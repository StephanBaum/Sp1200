import { describe, it, expect } from 'vitest';
import { Song, SongEntry } from '../../js/sequencer/song.js';

describe('Song', () => {
  it('starts empty', () => { expect(new Song().entries.length).toBe(0); });
  it('adds entries', () => {
    const s = new Song();
    s.addEntry(new SongEntry(1, 4));
    s.addEntry(new SongEntry(2, 2));
    expect(s.entries.length).toBe(2);
    expect(s.entries[0].pattern).toBe(1);
    expect(s.entries[0].repeats).toBe(4);
  });
  it('caps at 99 entries', () => {
    const s = new Song();
    for (let i = 0; i < 100; i++) s.addEntry(new SongEntry(i % 99, 1));
    expect(s.entries.length).toBe(99);
  });
  it('removes an entry by index', () => {
    const s = new Song();
    s.addEntry(new SongEntry(1, 4));
    s.addEntry(new SongEntry(2, 2));
    s.removeEntry(0);
    expect(s.entries.length).toBe(1);
    expect(s.entries[0].pattern).toBe(2);
  });
  it('iterates through song positions', () => {
    const s = new Song();
    s.addEntry(new SongEntry(1, 2));
    s.addEntry(new SongEntry(5, 1));
    s.start();
    expect(s.currentPattern()).toBe(1);
    expect(s.isFinished()).toBe(false);
    s.advanceRepeat();
    expect(s.currentPattern()).toBe(1);
    s.advanceRepeat();
    expect(s.currentPattern()).toBe(5);
    s.advanceRepeat();
    expect(s.isFinished()).toBe(true);
  });
  it('serializes and deserializes', () => {
    const s = new Song();
    s.addEntry(new SongEntry(1, 4));
    s.addEntry(new SongEntry(3, 2));
    const json = s.serialize();
    const s2 = Song.deserialize(json);
    expect(s2.entries.length).toBe(2);
    expect(s2.entries[1].pattern).toBe(3);
    expect(s2.entries[1].repeats).toBe(2);
  });
});
