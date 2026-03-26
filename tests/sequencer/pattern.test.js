import { describe, it, expect } from 'vitest';
import { Pattern, PatternEvent } from '../../js/sequencer/pattern.js';
import { PPQN, NUM_PADS } from '../../js/constants.js';

describe('Pattern', () => {
  it('creates empty pattern with default 1 bar', () => {
    const p = new Pattern();
    expect(p.bars).toBe(1);
    expect(p.tracks.length).toBe(NUM_PADS);
    expect(p.tracks[0].events.length).toBe(0);
  });
  it('sets bar length up to 4', () => {
    const p = new Pattern();
    p.setBars(4);
    expect(p.bars).toBe(4);
    expect(p.totalTicks).toBe(PPQN * 4 * 4);
  });
  it('adds an event to a track', () => {
    const p = new Pattern();
    p.addEvent(0, new PatternEvent(0, 100, 0));
    expect(p.tracks[0].events.length).toBe(1);
    expect(p.tracks[0].events[0].tick).toBe(0);
    expect(p.tracks[0].events[0].velocity).toBe(100);
  });
  it('gets events at a specific tick', () => {
    const p = new Pattern();
    p.addEvent(0, new PatternEvent(0, 100, 0));
    p.addEvent(0, new PatternEvent(24, 80, 0));
    p.addEvent(1, new PatternEvent(0, 90, 0));
    const eventsAtZero = p.getEventsAtTick(0);
    expect(eventsAtZero.length).toBe(2);
    expect(eventsAtZero[0].track).toBe(0);
    expect(eventsAtZero[1].track).toBe(1);
  });
  it('removes an event', () => {
    const p = new Pattern();
    p.addEvent(0, new PatternEvent(0, 100, 0));
    p.removeEvent(0, 0);
    expect(p.tracks[0].events.length).toBe(0);
  });
  it('quantizes a tick to the nearest grid', () => {
    const p = new Pattern();
    expect(p.quantizeTick(13, PPQN / 4)).toBe(24);
    expect(p.quantizeTick(11, PPQN / 4)).toBe(0);
    expect(p.quantizeTick(36, PPQN / 4)).toBe(48);
  });
  it('clears all events from a track', () => {
    const p = new Pattern();
    p.addEvent(0, new PatternEvent(0, 100, 0));
    p.addEvent(0, new PatternEvent(48, 100, 0));
    p.clearTrack(0);
    expect(p.tracks[0].events.length).toBe(0);
  });
  it('clears entire pattern', () => {
    const p = new Pattern();
    p.addEvent(0, new PatternEvent(0, 100, 0));
    p.addEvent(3, new PatternEvent(24, 80, 0));
    p.clear();
    for (let i = 0; i < NUM_PADS; i++) expect(p.tracks[i].events.length).toBe(0);
  });
  it('serializes and deserializes', () => {
    const p = new Pattern();
    p.setBars(2);
    p.addEvent(0, new PatternEvent(0, 100, 2));
    p.addEvent(3, new PatternEvent(48, 80, -1));
    const json = p.serialize();
    const p2 = Pattern.deserialize(json);
    expect(p2.bars).toBe(2);
    expect(p2.tracks[0].events.length).toBe(1);
    expect(p2.tracks[0].events[0].velocity).toBe(100);
    expect(p2.tracks[0].events[0].pitchOffset).toBe(2);
    expect(p2.tracks[3].events[0].tick).toBe(48);
  });
});
