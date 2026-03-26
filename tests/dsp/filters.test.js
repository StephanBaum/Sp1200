import { describe, it, expect } from 'vitest';
import { SSM2044Filter, FixedFilter } from '../../js/dsp/filters.js';

describe('SSM2044Filter', () => {
  it('creates a filter with initial cutoff and resonance', () => {
    const f = new SSM2044Filter(10000, 0);
    expect(f).toBeDefined();
    expect(f.cutoff).toBe(10000);
    expect(f.resonance).toBe(0);
  });
  it('passes DC signal through unchanged', () => {
    const f = new SSM2044Filter(10000, 0);
    for (let i = 0; i < 1000; i++) f.process(0.5);
    const out = f.process(0.5);
    expect(out).toBeCloseTo(0.5, 1);
  });
  it('attenuates signal above cutoff', () => {
    const f = new SSM2044Filter(1000, 0);
    const sampleRate = 26040;
    const freq = 5000;
    let inputPower = 0, outputPower = 0;
    for (let i = 0; i < 500; i++) f.process(Math.sin(2 * Math.PI * freq * i / sampleRate));
    for (let i = 0; i < 2000; i++) {
      const s = Math.sin(2 * Math.PI * freq * (i + 500) / sampleRate);
      const out = f.process(s);
      inputPower += s * s;
      outputPower += out * out;
    }
    expect(outputPower).toBeLessThan(inputPower * 0.1);
  });
  it('passes signal below cutoff with minimal attenuation', () => {
    const f = new SSM2044Filter(10000, 0);
    const sampleRate = 26040;
    const freq = 200;
    let inputPower = 0, outputPower = 0;
    for (let i = 0; i < 500; i++) f.process(Math.sin(2 * Math.PI * freq * i / sampleRate));
    for (let i = 0; i < 2000; i++) {
      const s = Math.sin(2 * Math.PI * freq * (i + 500) / sampleRate);
      const out = f.process(s);
      inputPower += s * s;
      outputPower += out * out;
    }
    expect(outputPower / inputPower).toBeGreaterThan(0.8);
  });
  it('setCutoff changes the filter frequency', () => {
    const f = new SSM2044Filter(10000, 0);
    f.setCutoff(500);
    expect(f.cutoff).toBe(500);
  });
});

describe('FixedFilter', () => {
  it('creates filter with fixed cutoff', () => {
    const f = new FixedFilter(8000);
    expect(f).toBeDefined();
  });
  it('attenuates signal above fixed cutoff', () => {
    const f = new FixedFilter(4000);
    const sampleRate = 26040;
    const freq = 10000;
    let inputPower = 0, outputPower = 0;
    for (let i = 0; i < 500; i++) f.process(Math.sin(2 * Math.PI * freq * i / sampleRate));
    for (let i = 0; i < 2000; i++) {
      const s = Math.sin(2 * Math.PI * freq * (i + 500) / sampleRate);
      const out = f.process(s);
      inputPower += s * s;
      outputPower += out * out;
    }
    expect(outputPower).toBeLessThan(inputPower * 0.3);
  });
});
