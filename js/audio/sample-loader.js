import { resampleTo26k } from '../dsp/resampler.js';
import { crushBuffer } from '../dsp/bitcrusher.js';
import { SP_SAMPLE_RATE, BANK_SAMPLE_FRAMES, NUM_PADS } from '../constants.js';

export class SampleMemory {
  constructor() { this.bankUsage = [0, 0, 0, 0]; }
  getBank(padIndex) { return Math.floor(padIndex / NUM_PADS); }
  getRemainingFrames(bank) { return BANK_SAMPLE_FRAMES - this.bankUsage[bank]; }
  getRemainingSeconds(bank) { return this.getRemainingFrames(bank) / SP_SAMPLE_RATE; }
  canFit(bank, frames) { return this.getRemainingFrames(bank) >= frames; }
  allocate(bank, frames) { this.bankUsage[bank] += frames; }
  free(bank, frames) { this.bankUsage[bank] = Math.max(0, this.bankUsage[bank] - frames); }
}

export async function loadSampleFromFile(audioContext, fileData) {
  const audioBuffer = await audioContext.decodeAudioData(fileData);
  let mono;
  if (audioBuffer.numberOfChannels === 1) {
    mono = audioBuffer.getChannelData(0);
  } else {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) * 0.5;
  }
  const resampled = resampleTo26k(mono, audioBuffer.sampleRate);
  return crushBuffer(resampled);
}

export function processMicCapture(rawBuffer, sourceSampleRate) {
  const resampled = resampleTo26k(rawBuffer, sourceSampleRate);
  return crushBuffer(resampled);
}
