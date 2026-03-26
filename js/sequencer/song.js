import { MAX_SONG_ENTRIES } from '../constants.js';

export class SongEntry {
  constructor(pattern, repeats = 1) { this.pattern = pattern; this.repeats = Math.max(1, repeats); }
}

export class Song {
  constructor() { this.entries = []; this.currentIndex = 0; this.currentRepeat = 0; }
  addEntry(entry) { if (this.entries.length < MAX_SONG_ENTRIES) this.entries.push(entry); }
  removeEntry(index) { if (index >= 0 && index < this.entries.length) this.entries.splice(index, 1); }
  start() { this.currentIndex = 0; this.currentRepeat = 0; }
  currentPattern() { if (this.isFinished()) return -1; return this.entries[this.currentIndex].pattern; }
  advanceRepeat() {
    if (this.isFinished()) return;
    this.currentRepeat++;
    if (this.currentRepeat >= this.entries[this.currentIndex].repeats) { this.currentIndex++; this.currentRepeat = 0; }
  }
  isFinished() { return this.currentIndex >= this.entries.length; }
  getPosition() { return { entryIndex: this.currentIndex, repeat: this.currentRepeat, pattern: this.currentPattern() }; }
  serialize() { return { entries: this.entries.map(e => ({ pattern: e.pattern, repeats: e.repeats })) }; }
  static deserialize(data) { const s = new Song(); for (const e of data.entries) s.addEntry(new SongEntry(e.pattern, e.repeats)); return s; }
}
