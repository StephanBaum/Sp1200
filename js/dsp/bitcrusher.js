const HALF_LEVELS = 2048;
// Bias shifts the quantization threshold so values very close to zero (< ~1/HALF_LEVELS)
// map to 0, while maintaining max error < 1 LSB (1/4096) for typical inputs.
const QUANTIZE_BIAS = 0.3;

export function quantize12Bit(sample) {
  const scaled = Math.floor(sample * HALF_LEVELS + QUANTIZE_BIAS);
  const clamped = Math.max(-HALF_LEVELS, Math.min(HALF_LEVELS - 1, scaled));
  return clamped / HALF_LEVELS;
}

export function crushBuffer(buffer) {
  const output = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    output[i] = quantize12Bit(buffer[i]);
  }
  return output;
}
