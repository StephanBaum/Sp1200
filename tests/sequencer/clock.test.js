import { describe, it, expect } from 'vitest';
import { Clock } from '../../js/sequencer/clock.js';
import { PPQN, OUTPUT_SAMPLE_RATE } from '../../js/constants.js';

describe('Clock', () => {
  it('starts stopped', () => {
    const c = new Clock(OUTPUT_SAMPLE_RATE);
    expect(c.playing).toBe(false);
    expect(c.tick).toBe(0);
  });
  it('calculates samples per tick at given BPM', () => {
    const c = new Clock(OUTPUT_SAMPLE_RATE);
    c.setBpm(120);
    expect(c.samplesPerTick).toBeCloseTo(22050 / PPQN, 2);
  });
  it('advances tick when enough samples processed', () => {
    const c = new Clock(OUTPUT_SAMPLE_RATE);
    c.setBpm(120);
    c.start();
    const spTick = c.samplesPerTick;
    const ticks = [];
    for (let i = 0; i < Math.ceil(spTick) + 1; i++) {
      const tick = c.advance();
      if (tick !== null) ticks.push(tick);
    }
    expect(ticks.length).toBe(1);
    expect(ticks[0]).toBe(1);
  });
  it('returns null when no tick boundary crossed', () => {
    const c = new Clock(OUTPUT_SAMPLE_RATE);
    c.setBpm(120);
    c.start();
    c.advance();
    const result = c.advance();
    expect(result).toBe(null);
  });
  it('resets on stop', () => {
    const c = new Clock(OUTPUT_SAMPLE_RATE);
    c.setBpm(120);
    c.start();
    for (let i = 0; i < 5000; i++) c.advance();
    c.stop();
    expect(c.tick).toBe(0);
    expect(c.playing).toBe(false);
  });
  it('calculates bar/beat/step from tick', () => {
    const c = new Clock(OUTPUT_SAMPLE_RATE);
    expect(c.getPosition(0)).toEqual({ bar: 0, beat: 0, sixteenth: 0, tick: 0 });
    expect(c.getPosition(PPQN)).toEqual({ bar: 0, beat: 1, sixteenth: 0, tick: PPQN });
    expect(c.getPosition(PPQN * 4)).toEqual({ bar: 1, beat: 0, sixteenth: 0, tick: PPQN * 4 });
  });
});
