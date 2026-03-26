import { describe, it, expect } from 'vitest';
import { Mixer } from '../../js/dsp/mixer.js';
import { NUM_PADS } from '../../js/constants.js';

describe('Mixer', () => {
  it('creates 8 channels', () => {
    const m = new Mixer();
    expect(m.channels.length).toBe(NUM_PADS);
  });
  it('sums mono inputs to stereo center by default', () => {
    const m = new Mixer();
    const inputs = new Float32Array(NUM_PADS).fill(0);
    inputs[0] = 0.5;
    const [left, right] = m.process(inputs);
    expect(left).toBeCloseTo(right, 4);
    expect(left).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
  });
  it('pans hard left', () => {
    const m = new Mixer();
    m.setPan(0, -1);
    const inputs = new Float32Array(NUM_PADS).fill(0);
    inputs[0] = 1.0;
    const [left, right] = m.process(inputs);
    expect(left).toBeCloseTo(1.0, 2);
    expect(right).toBeCloseTo(0, 2);
  });
  it('pans hard right', () => {
    const m = new Mixer();
    m.setPan(0, 1);
    const inputs = new Float32Array(NUM_PADS).fill(0);
    inputs[0] = 1.0;
    const [left, right] = m.process(inputs);
    expect(left).toBeCloseTo(0, 2);
    expect(right).toBeCloseTo(1.0, 2);
  });
  it('applies per-channel volume', () => {
    const m = new Mixer();
    m.setVolume(0, 0.5);
    const inputs = new Float32Array(NUM_PADS).fill(0);
    inputs[0] = 1.0;
    const [left] = m.process(inputs);
    expect(left).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
  });
  it('sums multiple channels', () => {
    const m = new Mixer();
    const inputs = new Float32Array(NUM_PADS).fill(0);
    inputs[0] = 0.3;
    inputs[1] = 0.4;
    const [left] = m.process(inputs);
    expect(left).toBeCloseTo((0.3 + 0.4) * Math.SQRT1_2, 3);
  });
});
