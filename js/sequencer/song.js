import { BPM_MIN, BPM_MAX, MAX_SONG_ENTRIES } from '../constants.js';

export class SongEntry {
  constructor(pattern, repeats = 1) { this.pattern = pattern; this.repeats = Math.max(1, repeats); }
}

export class Song {
  constructor() {
    this.songs = Array.from({ length: 100 }, () => ({
      steps: [],
      tempo: 120,
    }));
    this.currentSong = 0;
    this.currentStep = 0;
    this.repeatStack = [];
  }

  addStep(songNum, stepIndex, stepData) {
    if (songNum < 0 || songNum >= 100) return;
    const song = this.songs[songNum];
    if (song.steps.length >= MAX_SONG_ENTRIES) return;
    if (stepIndex >= song.steps.length) {
      song.steps.push(stepData);
    } else {
      song.steps.splice(stepIndex, 0, stepData);
    }
  }

  deleteStep(songNum, stepIndex) {
    if (songNum < 0 || songNum >= 100) return;
    const song = this.songs[songNum];
    if (stepIndex >= 0 && stepIndex < song.steps.length) {
      song.steps.splice(stepIndex, 1);
    }
  }

  setTempo(songNum, bpm) {
    if (songNum < 0 || songNum >= 100) return;
    this.songs[songNum].tempo = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
  }

  start(songNum) {
    if (songNum >= 0 && songNum < 100) this.currentSong = songNum;
    this.currentStep = 0;
    this.repeatStack = [];
  }

  getNextSegment() {
    const song = this.songs[this.currentSong];
    while (this.currentStep < song.steps.length) {
      const step = song.steps[this.currentStep];
      this.currentStep++;

      switch (step.type) {
        case 'segment':
          return { segment: step.value };
        case 'end':
          return null;
        case 'tempo-change':
          return { tempoChange: step.value };
        case 'mix-change':
          return { mixChange: step.value };
        case 'trigger':
          return { trigger: step.value };
        case 'sub-song':
          this.repeatStack.push({ song: this.currentSong, step: this.currentStep });
          this.currentSong = step.value;
          this.currentStep = 0;
          return this.getNextSegment();
        case 'repeat-start':
          this.repeatStack.push({
            song: this.currentSong,
            step: this.currentStep,
            count: step.value || 1,
          });
          continue;
        case 'repeat-end': {
          if (this.repeatStack.length > 0) {
            const top = this.repeatStack[this.repeatStack.length - 1];
            if (top.count !== undefined && top.count > 0) {
              top.count--;
              this.currentStep = top.step;
            } else {
              this.repeatStack.pop();
            }
          }
          continue;
        }
        default:
          continue;
      }
    }

    if (this.repeatStack.length > 0) {
      const parent = this.repeatStack.pop();
      this.currentSong = parent.song;
      this.currentStep = parent.step;
      return this.getNextSegment();
    }

    return null;
  }

  currentPattern() {
    const song = this.songs[this.currentSong];
    if (this.currentStep >= song.steps.length) return -1;
    const step = song.steps[this.currentStep];
    return step && step.type === 'segment' ? step.value : -1;
  }

  advanceRepeat() {
    this.getNextSegment();
  }

  isFinished() {
    const song = this.songs[this.currentSong];
    return this.currentStep >= song.steps.length && this.repeatStack.length === 0;
  }

  getPosition() {
    return {
      songIndex: this.currentSong,
      stepIndex: this.currentStep,
      pattern: this.currentPattern(),
    };
  }

  reset() {
    this.currentStep = 0;
    this.repeatStack = [];
  }

  serialize() {
    return {
      songs: this.songs.map(s => ({
        steps: s.steps.map(step => ({ ...step })),
        tempo: s.tempo,
      })),
      currentSong: this.currentSong,
    };
  }

  static deserialize(data) {
    const s = new Song();
    if (data.songs) {
      data.songs.forEach((songData, i) => {
        s.songs[i].steps = songData.steps || [];
        s.songs[i].tempo = songData.tempo || 120;
      });
    }
    s.currentSong = data.currentSong || 0;
    return s;
  }
}
