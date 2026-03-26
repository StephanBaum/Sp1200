import { describe, it, expect } from 'vitest';
import { resampleTo26k, resampleToOutput } from '../../js/dsp/resampler.js';
import { SP_SAMPLE_RATE, OUTPUT_SAMPLE_RATE } from '../../js/constants.js';

describe('resampleTo26k', () => {
  it('downsamples from 44100 to 26040', () => {
    const input = new Float32Array(44100);
    for (let i = 0; i < input.length; i++) input[i] = i / input.length;
    const output = resampleTo26k(input, 44100);
    expect(output.length).toBe(SP_SAMPLE_RATE);
  });
  it('preserves DC signal', () => {
    const input = new Float32Array(1000).fill(0.5);
    const output = resampleTo26k(input, 44100);
    for (let i = 0; i < output.length; i++) {
      expect(output[i]).toBeCloseTo(0.5, 2);
    }
  });
  it('returns copy if already at 26040', () => {
    const input = new Float32Array(26040).fill(0.3);
    const output = resampleTo26k(input, SP_SAMPLE_RATE);
    expect(output.length).toBe(26040);
    expect(output[0]).toBeCloseTo(0.3, 5);
  });
  it('upsamples from lower rate to 26040', () => {
    const input = new Float32Array(22050).fill(0.7);
    const output = resampleTo26k(input, 22050);
    const expectedLength = Math.floor(22050 * SP_SAMPLE_RATE / 22050);
    expect(output.length).toBe(expectedLength);
  });
});

describe('resampleToOutput', () => {
  it('upsamples from 26040 to output rate', () => {
    const input = new Float32Array(26040);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(2 * Math.PI * 1000 * i / SP_SAMPLE_RATE);
    const output = resampleToOutput(input, OUTPUT_SAMPLE_RATE);
    expect(output.length).toBe(OUTPUT_SAMPLE_RATE);
  });
  it('uses nearest-neighbor (no interpolation)', () => {
    const input = new Float32Array(100);
    input.fill(0, 0, 50);
    input.fill(1, 50, 100);
    const output = resampleToOutput(input, OUTPUT_SAMPLE_RATE);
    for (let i = 0; i < output.length; i++) {
      expect(output[i] === 0 || output[i] === 1).toBe(true);
    }
  });
});
