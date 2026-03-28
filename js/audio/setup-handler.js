import { NUM_PADS, MAX_PATTERNS, BASE_PITCH_STEP } from '../constants.js';
import { PatternEvent } from '../sequencer/pattern.js';

export class SetupHandler {
  constructor(processor) {
    this.processor = processor;
  }

  handle(msg) {
    switch (msg.type) {
      case 'multi-pitch': return this._multiPitch(msg);
      case 'multi-level': return this._multiLevel(msg);
      case 'exit-multi': return this._exitMulti(msg);
      case 'dynamic-buttons': return this._dynamicButtons(msg);
      case 'define-mix': return this._defineMix(msg);
      case 'select-mix': return this._selectMix(msg);
      case 'channel-assign': return this._channelAssign(msg);
      case 'decay-tune-select': return this._decayTuneSelect(msg);
      case 'delete-sound': return this._deleteSound(msg);
      case 'reverse-sound': return this._reverseSound(msg);
      case 'erase-segment': return this._eraseSegment(msg);
      case 'copy-segment': return this._copySegment(msg);
      case 'truncate': return this._truncate(msg);
      case 'erase-track': return this._eraseTrack(msg);
      case 'copy-sound': return this._copySound(msg);
      case 'swap-sounds': return this._swapSounds(msg);
      default: return false;
    }
  }

  _multiPitch(msg) {
    const p = this.processor;
    const src = msg.pad;
    if (src >= 0 && src < NUM_PADS && p.voices[src].sample) {
      p._multiBackup = p.voices.map(v => ({
        sample: v.sample,
        pitch: v.pitch,
        velocity: v.velocity,
      }));
      const sampleRef = p.voices[src].sample;
      for (let i = 0; i < NUM_PADS; i++) {
        p.voices[i].loadSample(sampleRef);
        const semitones = -8 + (i * 15 / 7);
        p.voices[i].setPitch(BASE_PITCH_STEP * Math.pow(2, semitones / 12));
      }
      p.port.postMessage({ type: 'multi-pitch-active', sourcePad: src });
    }
    return true;
  }

  _multiLevel(msg) {
    const p = this.processor;
    const src = msg.pad;
    if (src >= 0 && src < NUM_PADS && p.voices[src].sample) {
      p._multiBackup = p.voices.map(v => ({
        sample: v.sample,
        pitch: v.pitch,
        velocity: v.velocity,
      }));
      const sampleRef = p.voices[src].sample;
      for (let i = 0; i < NUM_PADS; i++) {
        p.voices[i].loadSample(sampleRef);
        p.voices[i].setPitch(BASE_PITCH_STEP);
        p.mixer.setVolume(i, (i + 1) / NUM_PADS);
      }
      p.port.postMessage({ type: 'multi-level-active', sourcePad: src });
    }
    return true;
  }

  _exitMulti() {
    const p = this.processor;
    if (p._multiBackup) {
      for (let i = 0; i < NUM_PADS; i++) {
        const bk = p._multiBackup[i];
        if (bk.sample) {
          p.voices[i].loadSample(bk.sample);
        } else {
          p.voices[i].sample = null;
        }
        p.voices[i].pitch = bk.pitch;
      }
      p._multiBackup = null;
      p.port.postMessage({ type: 'multi-exit' });
    }
    return true;
  }

  _dynamicButtons(msg) {
    const p = this.processor;
    p.dynamicButtons = !!msg.enabled;
    p.port.postMessage({ type: 'dynamic-buttons', enabled: p.dynamicButtons });
    return true;
  }

  _defineMix(msg) {
    const p = this.processor;
    const slot = msg.slot;
    if (slot >= 0 && slot < 8) {
      for (let i = 0; i < NUM_PADS; i++) {
        p.mixSnapshots[slot][i] = p.mixer.channels[i].volume;
      }
      p.port.postMessage({ type: 'mix-defined', slot });
    }
    return true;
  }

  _selectMix(msg) {
    const p = this.processor;
    const slot = msg.slot;
    if (slot >= 0 && slot < 8) {
      for (let i = 0; i < NUM_PADS; i++) {
        p.mixer.setVolume(i, p.mixSnapshots[slot][i]);
      }
      p.port.postMessage({ type: 'mix-selected', slot });
    }
    return true;
  }

  _channelAssign(msg) {
    const p = this.processor;
    const pad = msg.pad;
    const ch = msg.channel;
    if (pad >= 0 && pad < NUM_PADS && ch >= 0 && ch < 8) {
      p.channelAssign[pad] = ch;
    }
    return true;
  }

  _decayTuneSelect(msg) {
    const p = this.processor;
    const pad = msg.pad;
    if (pad >= 0 && pad < NUM_PADS) {
      p.padModes[pad] = msg.mode === 'decay' ? 'decay' : 'tune';
      p.port.postMessage({ type: 'pad-mode', pad, mode: p.padModes[pad] });
    }
    return true;
  }

  _deleteSound(msg) {
    const p = this.processor;
    const pad = msg.pad;
    if (pad >= 0 && pad < NUM_PADS) {
      p.voices[pad].sample = null;
      p.voices[pad].active = false;
      p.voices[pad].position = 0;
      p.port.postMessage({ type: 'sound-deleted', pad });
    }
    return true;
  }

  _reverseSound(msg) {
    const p = this.processor;
    const pad = msg.pad;
    if (pad >= 0 && pad < NUM_PADS) {
      const voice = p.voices[pad];
      voice.reversed = !voice.reversed;
      p.port.postMessage({ type: 'reverse-toggled', pad, reversed: voice.reversed });
    }
    return true;
  }

  _eraseSegment(msg) {
    const p = this.processor;
    const seg = msg.segment;
    if (seg >= 0 && seg < MAX_PATTERNS) {
      p.patterns[seg].clear();
      p.port.postMessage({ type: 'segment-erased', segment: seg });
    }
    return true;
  }

  _truncate(msg) {
    const p = this.processor;
    const pad = msg.pad;
    if (pad >= 0 && pad < NUM_PADS) {
      const voice = p.voices[pad];
      if (voice.buffer) {
        const start = msg.start ?? 0;
        const end = msg.end ?? voice.buffer.length;
        const newBuf = voice.buffer.slice(start, end);
        voice.buffer = newBuf;
        voice.length = newBuf.length;
        p.port.postMessage({ type: 'truncated', pad });
      }
    }
    return true;
  }

  _eraseTrack(msg) {
    const p = this.processor;
    const pat = p.patterns[p.currentPatternIndex];
    if (msg.pad >= 0 && msg.pad < pat.tracks.length) {
      const tick = p.patternTick;
      const window = p.quantizeGrid;
      pat.tracks[msg.pad].events = pat.tracks[msg.pad].events.filter(
        e => Math.abs(e.tick - tick) > window
      );
    }
    return true;
  }

  _copySound(msg) {
    const p = this.processor;
    const from = msg.from;
    const to = msg.to;
    if (from >= 0 && from < p.voices.length && to >= 0 && to < p.voices.length) {
      if (p.voices[from].sample) {
        p.voices[to].loadSample(new Float32Array(p.voices[from].sample));
      } else {
        p.voices[to].sample = null;
      }
      p.port.postMessage({ type: 'sound-copied', from, to });
    }
    return true;
  }

  _swapSounds(msg) {
    const p = this.processor;
    const a = msg.padA;
    const b = msg.padB;
    if (a >= 0 && a < p.voices.length && b >= 0 && b < p.voices.length) {
      const tmpSample = p.voices[a].sample;
      p.voices[a].sample = p.voices[b].sample;
      p.voices[b].sample = tmpSample;
      // Update start/end points
      if (p.voices[a].sample) {
        p.voices[a].startPoint = 0;
        p.voices[a].endPoint = p.voices[a].sample.length - 1;
      }
      if (p.voices[b].sample) {
        p.voices[b].startPoint = 0;
        p.voices[b].endPoint = p.voices[b].sample.length - 1;
      }
      p.port.postMessage({ type: 'sounds-swapped', padA: a, padB: b });
    }
    return true;
  }

  _copySegment(msg) {
    const p = this.processor;
    const from = msg.from;
    const to = msg.to;
    if (from >= 0 && from < MAX_PATTERNS && to >= 0 && to < MAX_PATTERNS && from !== to) {
      const srcPat = p.patterns[from];
      const dstPat = p.patterns[to];
      dstPat.clear();
      dstPat.setBars(srcPat.bars);
      for (let t = 0; t < NUM_PADS; t++) {
        for (const ev of srcPat.tracks[t].events) {
          dstPat.addEvent(t, new PatternEvent(ev.tick, ev.velocity, ev.pitchOffset));
        }
      }
      p.port.postMessage({ type: 'segment-copied', from, to });
    }
    return true;
  }
}
