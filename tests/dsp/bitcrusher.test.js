import { describe, it, expect } from 'vitest';
import { quantize12Bit, crushBuffer } from '../../js/dsp/bitcrusher.js';

describe('quantize12Bit', () => {
  it('passes zero through unchanged', () => {
    expect(quantize12Bit(0)).toBe(0);
  });
  it('quantizes small values to nearest 12-bit step', () => {
    const result = quantize12Bit(0.0003);
    expect(result).toBe(0);
  });
  it('quantizes 1.0 to max positive value', () => {
    const result = quantize12Bit(1.0);
    expect(result).toBeCloseTo(2047 / 2048, 4);
  });
  it('quantizes -1.0 to min negative value', () => {
    const result = quantize12Bit(-1.0);
    expect(result).toBe(-1.0);
  });
  it('introduces quantization noise on fractional values', () => {
    const input = 0.12345;
    const result = quantize12Bit(input);
    expect(result).not.toBe(input);
    expect(Math.abs(result - input)).toBeLessThan(1 / 4096 + 0.0001);
  });
});

describe('crushBuffer', () => {
  it('quantizes every sample in a Float32Array', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const output = crushBuffer(input);
    expect(output).toBeInstanceOf(Float32Array);
    expect(output.length).toBe(5);
    for (let i = 0; i < output.length; i++) {
      expect(output[i]).toBe(quantize12Bit(input[i]));
    }
  });
  it('returns a new buffer, does not modify input', () => {
    const input = new Float32Array([0.12345]);
    const output = crushBuffer(input);
    expect(output).not.toBe(input);
    expect(input[0]).toBeCloseTo(0.12345, 4);
  });
});
