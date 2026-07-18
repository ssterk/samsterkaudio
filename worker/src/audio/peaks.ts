export type PcmFormat = {
  numChannels: number;
  bitsPerSample: number;
  dataSize: number;
};

function readSample(view: DataView, offset: number, bitsPerSample: number): number {
  switch (bitsPerSample) {
    case 8:
      return view.getUint8(offset) - 128;
    case 16:
      return view.getInt16(offset, true);
    case 24: {
      const b0 = view.getUint8(offset);
      const b1 = view.getUint8(offset + 1);
      const b2 = view.getUint8(offset + 2);
      let val = b0 | (b1 << 8) | (b2 << 16);
      if (val & 0x800000) val -= 0x1000000;
      return val;
    }
    case 32:
      return view.getInt32(offset, true);
    default:
      throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
  }
}

// Streams little-endian PCM samples and reduces them to `bucketCount`
// peak-amplitude values (0..1) without holding the whole file in memory —
// audio masters can be hundreds of MB, well past what a Worker isolate can
// safely buffer.
export async function computePeaks(
  stream: ReadableStream<Uint8Array>,
  format: PcmFormat,
  bucketCount = 2000,
): Promise<number[]> {
  const bytesPerSample = format.bitsPerSample / 8;
  const frameSize = bytesPerSample * format.numChannels;
  const totalFrames = Math.floor(format.dataSize / frameSize);
  const framesPerBucket = Math.max(1, Math.floor(totalFrames / bucketCount));
  const maxSampleValue = 2 ** (format.bitsPerSample - 1);

  const buckets: number[] = new Array(bucketCount).fill(0);
  let bucketIndex = 0;
  let frameInBucket = 0;
  let bucketPeak = 0;
  let carry = new Uint8Array(0);

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const combined = new Uint8Array(carry.length + value.length);
    combined.set(carry, 0);
    combined.set(value, carry.length);

    const usableLength = combined.length - (combined.length % frameSize);
    const view = new DataView(combined.buffer, combined.byteOffset, usableLength);
    carry = combined.slice(usableLength);

    for (let off = 0; off < usableLength && bucketIndex < bucketCount; off += frameSize) {
      let frameAbs = 0;
      for (let ch = 0; ch < format.numChannels; ch++) {
        const s = Math.abs(readSample(view, off + ch * bytesPerSample, format.bitsPerSample));
        if (s > frameAbs) frameAbs = s;
      }
      if (frameAbs > bucketPeak) bucketPeak = frameAbs;
      frameInBucket++;
      if (frameInBucket >= framesPerBucket) {
        buckets[bucketIndex] = Math.min(1, bucketPeak / maxSampleValue);
        bucketIndex++;
        frameInBucket = 0;
        bucketPeak = 0;
      }
    }
  }
  if (bucketIndex < bucketCount && frameInBucket > 0) {
    buckets[bucketIndex] = Math.min(1, bucketPeak / maxSampleValue);
  }
  return buckets;
}
