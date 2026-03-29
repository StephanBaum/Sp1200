import { describe, it, expect } from 'vitest';
import { Song } from '../../js/sequencer/song.js';

describe('Song', () => {
  it('starts with 100 empty songs', () => {
    const s = new Song();
    expect(s.songs.length).toBe(100);
    expect(s.songs[0].steps.length).toBe(0);
  });

  it('adds steps to a song', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'segment', value: 1 });
    s.addStep(0, 1, { type: 'segment', value: 2 });
    expect(s.songs[0].steps.length).toBe(2);
    expect(s.songs[0].steps[0].value).toBe(1);
  });

  it('caps at 99 steps per song', () => {
    const s = new Song();
    for (let i = 0; i < 100; i++) s.addStep(0, 999, { type: 'segment', value: i % 99 });
    expect(s.songs[0].steps.length).toBe(99);
  });

  it('deletes a step by index', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'segment', value: 1 });
    s.addStep(0, 1, { type: 'segment', value: 2 });
    s.deleteStep(0, 0);
    expect(s.songs[0].steps.length).toBe(1);
    expect(s.songs[0].steps[0].value).toBe(2);
  });

  it('iterates through segments via getNextSegment', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'segment', value: 1 });
    s.addStep(0, 1, { type: 'segment', value: 5 });
    s.addStep(0, 2, { type: 'end' });
    s.start(0);
    const first = s.getNextSegment();
    expect(first).toEqual({ segment: 1 });
    const second = s.getNextSegment();
    expect(second).toEqual({ segment: 5 });
    const end = s.getNextSegment();
    expect(end).toBeNull();
    expect(s.isFinished()).toBe(true);
  });

  it('handles repeat-start and repeat-end', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'repeat-start', value: 2 });
    s.addStep(0, 1, { type: 'segment', value: 3 });
    s.addStep(0, 2, { type: 'repeat-end' });
    s.addStep(0, 3, { type: 'end' });
    s.start(0);
    // Should get segment 3 three times (initial + 2 repeats)
    expect(s.getNextSegment()).toEqual({ segment: 3 });
    expect(s.getNextSegment()).toEqual({ segment: 3 });
    expect(s.getNextSegment()).toEqual({ segment: 3 });
    expect(s.getNextSegment()).toBeNull();
  });

  it('handles tempo-change steps', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'tempo-change', value: 140 });
    s.addStep(0, 1, { type: 'segment', value: 0 });
    s.addStep(0, 2, { type: 'end' });
    s.start(0);
    const tempoStep = s.getNextSegment();
    expect(tempoStep).toEqual({ tempoChange: 140 });
    const seg = s.getNextSegment();
    expect(seg).toEqual({ segment: 0 });
  });

  it('sets tempo per song', () => {
    const s = new Song();
    s.setTempo(0, 140);
    expect(s.songs[0].tempo).toBe(140);
    s.setTempo(0, 999); // clamped
    expect(s.songs[0].tempo).toBe(250);
  });

  it('sub-song jumps to another song and returns', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'segment', value: 1 });
    s.addStep(0, 1, { type: 'sub-song', value: 1 });
    s.addStep(0, 2, { type: 'segment', value: 3 });
    s.addStep(0, 3, { type: 'end' });
    s.addStep(1, 0, { type: 'segment', value: 2 });
    s.addStep(1, 1, { type: 'end' });

    s.start(0);
    expect(s.getNextSegment()).toEqual({ segment: 1 });
    expect(s.getNextSegment()).toEqual({ segment: 2 });
    expect(s.getNextSegment()).toEqual({ segment: 3 });
    expect(s.getNextSegment()).toBeNull();
  });

  it('self-referencing sub-song loops indefinitely', () => {
    const s = new Song();
    s.addStep(0, 0, { type: 'segment', value: 1 });
    s.addStep(0, 1, { type: 'sub-song', value: 0 });
    s.start(0);
    expect(s.getNextSegment()).toEqual({ segment: 1 });
    expect(s.getNextSegment()).toEqual({ segment: 1 });
    expect(s.getNextSegment()).toEqual({ segment: 1 });
  });
});
