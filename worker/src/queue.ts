import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "./db/schema";
import type { Env, ProcessMessage } from "./env";
import { parseWavHeader, buildWavHeader } from "./audio/wav";
import { parseAiffHeader, byteSwapStream } from "./audio/aiff";
import { computePeaks } from "./audio/peaks";

const HEADER_PREFIX_BYTES = 65536;

// R2's put() rejects a plain ReadableStream ("must have a known length")
// unless it's backed by something with a declared size — FixedLengthStream
// is the Workers-runtime way to give a hand-built stream a known length.
function prefixStream(prefix: Uint8Array, rest: ReadableStream<Uint8Array>, totalLength: number): ReadableStream<Uint8Array> {
  const { readable, writable } = new FixedLengthStream(totalLength);
  const writer = writable.getWriter();
  (async () => {
    try {
      await writer.write(prefix);
      const reader = rest.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (err) {
      await writer.abort(err);
    }
  })();
  return readable;
}

async function processTrackVersion(env: Env, trackVersionId: string) {
  const db = drizzle(env.DB, { schema });

  const [version] = await db
    .select()
    .from(schema.trackVersions)
    .where(eq(schema.trackVersions.id, trackVersionId));
  if (!version) {
    console.error(`[pressing] queue: track_version ${trackVersionId} not found`);
    return;
  }

  await db
    .update(schema.trackVersions)
    .set({ status: "processing" })
    .where(eq(schema.trackVersions.id, trackVersionId));

  try {
    const headerObj = await env.MEDIA.get(version.originalKey, {
      range: { offset: 0, length: HEADER_PREFIX_BYTES },
    });
    if (!headerObj) throw new Error(`original file not found in R2: ${version.originalKey}`);
    const headerBuf = new Uint8Array(await headerObj.arrayBuffer());
    const magic = String.fromCharCode(headerBuf[0], headerBuf[1], headerBuf[2], headerBuf[3]);

    let streamKey: string;
    let peaks: number[];
    let format: { numChannels: number; sampleRate: number; bitsPerSample: number; dataOffset: number; dataSize: number };

    if (magic === "RIFF") {
      format = parseWavHeader(headerBuf);
      streamKey = version.originalKey;

      const pcmObj = await env.MEDIA.get(version.originalKey, { range: { offset: format.dataOffset } });
      if (!pcmObj) throw new Error("could not read PCM data from WAV");
      peaks = await computePeaks(pcmObj.body, format, 2000);
    } else if (magic === "FORM") {
      format = parseAiffHeader(headerBuf);

      const pcmObj = await env.MEDIA.get(version.originalKey, {
        range: { offset: format.dataOffset, length: format.dataSize },
      });
      if (!pcmObj) throw new Error("could not read PCM data from AIFF");

      const bytesPerSample = format.bitsPerSample / 8;
      const swapped = pcmObj.body.pipeThrough(byteSwapStream(bytesPerSample));
      const [forUpload, forPeaks] = swapped.tee();

      const wavHeader = buildWavHeader({
        numChannels: format.numChannels,
        sampleRate: format.sampleRate,
        bitsPerSample: format.bitsPerSample,
        dataSize: format.dataSize,
      });
      streamKey = version.originalKey.replace(/\.[^./]+$/, "") + ".wav";
      const totalLength = wavHeader.length + format.dataSize;

      const [, peaksResult] = await Promise.all([
        env.MEDIA.put(streamKey, prefixStream(wavHeader, forUpload, totalLength), {
          httpMetadata: { contentType: "audio/wav" },
        }),
        computePeaks(forPeaks, format, 2000),
      ]);
      peaks = peaksResult;
    } else {
      throw new Error(`Unrecognized audio format (magic bytes: "${magic}")`);
    }

    const peaksKey = `${version.originalKey}.peaks.json`;
    await env.MEDIA.put(peaksKey, JSON.stringify(peaks), {
      httpMetadata: { contentType: "application/json" },
    });

    const bytesPerFrame = format.numChannels * (format.bitsPerSample / 8);
    const duration = format.dataSize / (format.sampleRate * bytesPerFrame);

    await db
      .update(schema.trackVersions)
      .set({ streamKey, peaksKey, status: "ready" })
      .where(eq(schema.trackVersions.id, trackVersionId));

    await db
      .update(schema.tracks)
      .set({
        duration,
        sampleRate: format.sampleRate,
        bitDepth: format.bitsPerSample,
      })
      .where(eq(schema.tracks.id, version.trackId));
  } catch (err) {
    console.error(`[pressing] processing failed for track_version ${trackVersionId}:`, err);
    await db
      .update(schema.trackVersions)
      .set({ status: "failed" })
      .where(eq(schema.trackVersions.id, trackVersionId));
  }
}

export async function handleQueue(batch: MessageBatch<ProcessMessage>, env: Env) {
  for (const message of batch.messages) {
    await processTrackVersion(env, message.body.trackVersionId);
    message.ack();
  }
}
