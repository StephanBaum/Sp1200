import { describe, it, expect } from 'vitest';
import { Voice } from '../../js/dsp/voice.js';

describe('Voice', () => {
  it('starts inactive', () => {
    const v = new Voice(0);
    expect(v.active).toBe(false);
  });
  it('triggers playback of a loaded sample', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]));
    v.trigger(127);
    expect(v.active).toBe(true);
    expect(v.process()).toBeCloseTo(0.1, 4);
  });
  it('plays through sample and deactivates at end', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array([0.5, 0.6]));
    v.trigger(127);
    v.process();
    v.process();
    v.process();
    expect(v.active).toBe(false);
  });
  it('scales output by velocity', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array([1.0]));
    v.trigger(64);
    const out = v.process();
    expect(out).toBeCloseTo(64 / 127, 2);
  });
  it('applies pitch by changing playback rate', () => {
    const v = new Voice(0);
    const sample = new Float32Array(10);
    for (let i = 0; i < 10; i++) sample[i] = i / 10;
    v.loadSample(sample);
    v.setPitch(2.0);
    v.trigger(127);
    const s0 = v.process();
    const s1 = v.process();
    expect(s0).toBeCloseTo(0.0, 2);
    expect(s1).toBeCloseTo(0.2, 2);
  });
  it('applies decay envelope', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array(1000).fill(1.0));
    v.setDecay(0.5);
    v.trigger(127);
    const first = v.process();
    let last = first;
    for (let i = 0; i < 500; i++) last = v.process();
    expect(Math.abs(last)).toBeLessThan(Math.abs(first));
  });
  it('stops on stop()', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array(1000).fill(0.5));
    v.trigger(127);
    expect(v.active).toBe(true);
    v.stop();
    expect(v.active).toBe(false);
    expect(v.process()).toBe(0);
  });
  it('can reverse playback', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]));
    v.setReversed(true);
    v.trigger(127);
    expect(v.process()).toBeCloseTo(0.5, 4);
  });
  it('supports loop mode', () => {
    const v = new Voice(0);
    v.loadSample(new Float32Array([0.1, 0.2, 0.3]));
    v.setLoop(true, 0, 2);
    v.trigger(127);
    const values = [];
    for (let i = 0; i < 6; i++) values.push(v.process());
    expect(values[0]).toBeCloseTo(0.1, 4);
    expect(values[3]).toBeCloseTo(0.1, 4);
    expect(v.active).toBe(true);
  });
});
