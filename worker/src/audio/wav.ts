export type WavInfo = {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
};

function readTag(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

// `buf` only needs to cover the header — callers pass a bounded prefix read,
// not the whole file.
export function parseWavHeader(buf: Uint8Array): WavInfo {
  if (readTag(buf, 0) !== "RIFF" || readTag(buf, 8) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 12;
  let fmt: { numChannels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataSize = -1;

  while (offset + 8 <= buf.byteLength) {
    const id = readTag(buf, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        numChannels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      dataOffset = body;
      dataSize = size;
      break;
    }
    offset = body + size + (size % 2);
  }

  if (!fmt || dataOffset < 0) {
    throw new Error("Malformed WAV: missing fmt or data chunk in header prefix");
  }
  return { ...fmt, dataOffset, dataSize };
}

function writeTag(view: DataView, offset: number, tag: string) {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

export function buildWavHeader(opts: {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataSize: number;
}): Uint8Array {
  const { numChannels, sampleRate, bitsPerSample, dataSize } = opts;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  const buf = new ArrayBuffer(44);
  const view = new DataView(buf);
  writeTag(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeTag(view, 8, "WAVE");
  writeTag(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeTag(view, 36, "data");
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buf);
}
