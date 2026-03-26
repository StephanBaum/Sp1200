import { SP_SAMPLE_RATE } from '../constants.js';

export function resampleTo26k(buffer, sourceSampleRate) {
  if (sourceSampleRate === SP_SAMPLE_RATE) {
    return new Float32Array(buffer);
  }
  const ratio = SP_SAMPLE_RATE / sourceSampleRate;
  const outputLength = Math.floor(buffer.length * ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i / ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const s0 = buffer[srcIndex] || 0;
    const s1 = buffer[srcIndex + 1] || s0;
    output[i] = s0 + frac * (s1 - s0);
  }
  return output;
}

export function resampleToOutput(buffer, outputSampleRate) {
  const ratio = outputSampleRate / SP_SAMPLE_RATE;
  const outputLength = Math.floor(buffer.length * ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = Math.floor(i / ratio);
    output[i] = buffer[Math.min(srcIndex, buffer.length - 1)];
  }
  return output;
}
