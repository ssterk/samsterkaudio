export type AiffInfo = {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
};

function readTag(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

// AIFF stores sample rate as an 80-bit IEEE 754 extended-precision float
// (SANE format) — not a type JS has native support for.
function readExtended80(view: DataView, offset: number): number {
  const sign = view.getUint8(offset) & 0x80 ? -1 : 1;
  const exponent = ((view.getUint8(offset) & 0x7f) << 8) | view.getUint8(offset + 1);
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  const mantissa = hi * 2 ** 32 + lo;
  if (exponent === 0 && mantissa === 0) return 0;
  return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

// `buf` only needs to cover the header — callers pass a bounded prefix read.
export function parseAiffHeader(buf: Uint8Array): AiffInfo {
  if (readTag(buf, 0) !== "FORM" || readTag(buf, 8) !== "AIFF") {
    throw new Error("Not an AIFF file");
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 12;
  let comm: { numChannels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataSize = -1;

  while (offset + 8 <= buf.byteLength) {
    const id = readTag(buf, offset);
    const size = view.getUint32(offset + 4, false);
    const body = offset + 8;
    if (id === "COMM") {
      comm = {
        numChannels: view.getUint16(body, false),
        bitsPerSample: view.getUint16(body + 6, false),
        sampleRate: Math.round(readExtended80(view, body + 8)),
      };
    } else if (id === "SSND") {
      // SSND body starts with its own 4-byte offset + 4-byte blockSize
      // before the actual sample data.
      dataOffset = body + 8;
      dataSize = size - 8;
      break;
    }
    offset = body + size + (size % 2);
  }

  if (!comm || dataOffset < 0) {
    throw new Error("Malformed AIFF: missing COMM or SSND chunk in header prefix");
  }
  return { ...comm, dataOffset, dataSize };
}

// AIFF PCM samples are big-endian; WAV wants little-endian. Swaps bytes
// within each sample-width boundary as data streams through, carrying any
// partial trailing sample across chunk boundaries.
export function byteSwapStream(bytesPerSample: number): TransformStream<Uint8Array, Uint8Array> {
  let carry = new Uint8Array(0);
  return new TransformStream({
    transform(chunk, controller) {
      const combined = new Uint8Array(carry.length + chunk.length);
      combined.set(carry, 0);
      combined.set(chunk, carry.length);

      const usableLength = combined.length - (combined.length % bytesPerSample);
      const swappable = combined.subarray(0, usableLength);
      carry = combined.slice(usableLength);

      const out = new Uint8Array(swappable.length);
      for (let i = 0; i < swappable.length; i += bytesPerSample) {
        for (let b = 0; b < bytesPerSample; b++) {
          out[i + b] = swappable[i + bytesPerSample - 1 - b];
        }
      }
      controller.enqueue(out);
    },
    flush(controller) {
      if (carry.length > 0) controller.enqueue(carry);
    },
  });
}
