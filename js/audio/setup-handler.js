import { NUM_PADS, TOTAL_PADS, MAX_PATTERNS, BASE_PITCH_STEP } from '../constants.js';
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
      case 'dynamic-alloc': return this._dynamicAlloc(msg);
      case 'define-mix': return this._defineMix(msg);
      case 'select-mix': return this._selectMix(msg);
      case 'channel-assign': return this._channelAssign(msg);
      case 'decay-tune-select': return this._decayTuneSelect(msg);
      case 'delete-sound': return this._deleteSound(msg);
      case 'reverse-sound': return this._reverseSound(msg);
      case 'erase-segment': return this._eraseSegment(msg);
      case 'copy-segment': return this._copySegment(msg);
      case 'truncate': return this._truncate(msg);
      case 'truncate-permanent': return this._truncatePermanent(msg);
      case 'erase-track': return this._eraseTrack(msg);
      case 'erase-track-start': return this._eraseTrackStart(msg);
      case 'erase-track-stop': return this._eraseTrackStop(msg);
      case 'copy-sound': return this._copySound(msg);
      case 'swap-sounds': return this._swapSounds(msg);
      default: return false;
    }
  }

  _multiPitch(msg) {
    const p = this.processor;
    const src = msg.pad;
    const slotIdx = p.currentBank * NUM_PADS + src;
    const srcSlot = p.sampleSlots[slotIdx];
    if (src >= 0 && src < NUM_PADS && srcSlot.sample) {
      p._multiBackup = p.voices.map(v => ({
        sample: v.sample,
        pitch: v.pitch,
        velocity: v.velocity,
      }));
      for (let i = 0; i < NUM_PADS; i++) {
        p.voices[i].loadSample(srcSlot.sample);
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
    const slotIdx = p.currentBank * NUM_PADS + src;
    const srcSlot = p.sampleSlots[slotIdx];
    if (src >= 0 && src < NUM_PADS && srcSlot.sample) {
      p._multiBackup = p.voices.map(v => ({
        sample: v.sample,
        pitch: v.pitch,
        velocity: v.velocity,
      }));
      for (let i = 0; i < NUM_PADS; i++) {
        p.voices[i].loadSample(srcSlot.sample);
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

  _dynamicAlloc(msg) {
    const p = this.processor;
    p.dynamicAlloc = !!msg.enabled;
    p.port.postMessage({ type: 'dynamic-alloc', enabled: p.dynamicAlloc });
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
    const bank = msg.bank ?? p.currentBank;
    const slotIdx = bank * NUM_PADS + pad;
    if (slotIdx >= 0 && slotIdx < TOTAL_PADS) {
      p.sampleSlots[slotIdx].sample = null;
      // Clear voice if in current bank
      if (bank === p.currentBank && pad >= 0 && pad < NUM_PADS) {
        p.voices[pad].sample = null;
        p.voices[pad].active = false;
        p.voices[pad].position = 0;
      }
      p.port.postMessage({ type: 'sound-deleted', pad });
    }
    return true;
  }

  _reverseSound(msg) {
    const p = this.processor;
    const pad = msg.pad;
    const bank = msg.bank ?? p.currentBank;
    const slotIdx = bank * NUM_PADS + pad;
    if (slotIdx >= 0 && slotIdx < TOTAL_PADS) {
      const slot = p.sampleSlots[slotIdx];
      slot.reversed = !slot.reversed;
    }
    if (pad >= 0 && pad < NUM_PADS && bank === p.currentBank) {
      p.voices[pad].reversed = p.sampleSlots[slotIdx].reversed;
      p.port.postMessage({ type: 'reverse-toggled', pad, reversed: p.voices[pad].reversed });
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
    // Legacy one-shot erase (kept for compatibility)
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

  _eraseTrackStart(msg) {
    const p = this.processor;
    if (msg.pad >= 0 && msg.pad < NUM_PADS) {
      p.erasingPads.add(msg.pad);
    }
    return true;
  }

  _eraseTrackStop(msg) {
    const p = this.processor;
    if (msg.pad >= 0 && msg.pad < NUM_PADS) {
      p.erasingPads.delete(msg.pad);
    }
    return true;
  }

  _copySound(msg) {
    const p = this.processor;
    const from = msg.from; // slot index (bank*8+pad)
    const to = msg.to;
    if (from >= 0 && from < TOTAL_PADS && to >= 0 && to < TOTAL_PADS) {
      const srcSlot = p.sampleSlots[from];
      const dstSlot = p.sampleSlots[to];
      // Share sample buffer by reference (like real SP-1200)
      dstSlot.sample = srcSlot.sample;
      dstSlot.startPoint = srcSlot.startPoint;
      dstSlot.endPoint = srcSlot.endPoint;
      dstSlot.loopEnabled = srcSlot.loopEnabled;
      dstSlot.loopStart = srcSlot.loopStart;
      dstSlot.loopEnd = srcSlot.loopEnd;
      dstSlot.reversed = srcSlot.reversed;
      dstSlot.pitch = srcSlot.pitch;
      dstSlot.decayRate = srcSlot.decayRate;
      // Update voice if destination is in the current bank
      const dstVoice = to % NUM_PADS;
      if (Math.floor(to / NUM_PADS) === p.currentBank) {
        this._loadSlotIntoVoice(dstVoice, dstSlot);
      }
      p.port.postMessage({ type: 'sound-copied', from, to });
    }
    return true;
  }

  _swapSounds(msg) {
    const p = this.processor;
    const a = msg.padA; // slot index (bank*8+pad)
    const b = msg.padB;
    if (a >= 0 && a < TOTAL_PADS && b >= 0 && b < TOTAL_PADS) {
      const slotA = p.sampleSlots[a];
      const slotB = p.sampleSlots[b];
      // Swap all slot properties
      const tmp = { ...slotA };
      Object.assign(slotA, slotB);
      Object.assign(slotB, tmp);
      // Update voices if either slot is in the current bank
      const bankA = Math.floor(a / NUM_PADS);
      const bankB = Math.floor(b / NUM_PADS);
      if (bankA === p.currentBank) this._loadSlotIntoVoice(a % NUM_PADS, slotA);
      if (bankB === p.currentBank) this._loadSlotIntoVoice(b % NUM_PADS, slotB);
      p.port.postMessage({ type: 'sounds-swapped', padA: a, padB: b });
    }
    return true;
  }

  _truncatePermanent(msg) {
    const p = this.processor;
    const pad = msg.pad;
    const bank = msg.bank ?? p.currentBank;
    const slotIdx = bank * NUM_PADS + pad;
    if (slotIdx < 0 || slotIdx >= TOTAL_PADS) return true;
    const slot = p.sampleSlots[slotIdx];
    if (!slot.sample) return true;

    const start = Math.max(0, Math.min(msg.start ?? 0, slot.sample.length - 1));
    const end = Math.min(slot.sample.length - 1, Math.max(start, msg.end ?? slot.sample.length - 1));

    // Slice sample (end inclusive)
    const newSample = slot.sample.slice(start, end + 1);

    // Adjust loop points relative to new buffer
    if (slot.loopEnabled) {
      slot.loopStart = Math.max(0, slot.loopStart - start);
      slot.loopEnd = Math.min(newSample.length - 1, slot.loopEnd - start);
      if (slot.loopStart >= newSample.length) slot.loopStart = 0;
      if (slot.loopEnd < slot.loopStart) slot.loopEnd = newSample.length - 1;
    }

    slot.sample = newSample;
    slot.startPoint = 0;
    slot.endPoint = newSample.length - 1;

    // Update voice if in current bank
    if (bank === p.currentBank && pad >= 0 && pad < NUM_PADS) {
      this._loadSlotIntoVoice(pad, slot);
    }

    p.port.postMessage({ type: 'truncated', pad, bank, length: newSample.length });
    return true;
  }

  _loadSlotIntoVoice(voiceIdx, slot) {
    const v = this.processor.voices[voiceIdx];
    if (slot.sample) {
      v.sample = slot.sample;
      v.startPoint = slot.startPoint;
      v.endPoint = slot.endPoint;
      v.loopEnabled = slot.loopEnabled;
      v.loopStart = slot.loopStart;
      v.loopEnd = slot.loopEnd;
      v.reversed = slot.reversed;
      v.pitch = slot.pitch;
      v.decayRate = slot.decayRate;
    } else {
      v.sample = null;
    }
  }

  _copySegment(msg) {
    const p = this.processor;
    const from = msg.from;
    const to = msg.to;
    if (from < 0 || from >= MAX_PATTERNS || to < 0 || to >= MAX_PATTERNS) return true;

    if (from === to) {
      // Self-copy: double the pattern by appending
      const pat = p.patterns[from];
      const origTicks = pat.totalTicks;
      const origBars = pat.bars;
      pat.setBars(origBars * 2);
      for (let t = 0; t < pat.tracks.length; t++) {
        const origEvents = [...pat.tracks[t].events];
        for (const e of origEvents) {
          pat.tracks[t].addEvent(new PatternEvent(
            e.tick + origTicks, e.velocity, e.pitchOffset,
            { slot: e.slot, pitch: e.pitch, decay: e.decay, mixVolume: e.mixVolume }
          ));
        }
      }
    } else {
      const srcPat = p.patterns[from];
      const dstPat = p.patterns[to];
      dstPat.clear();
      dstPat.setBars(srcPat.bars);
      for (let t = 0; t < NUM_PADS; t++) {
        for (const ev of srcPat.tracks[t].events) {
          dstPat.addEvent(t, new PatternEvent(ev.tick, ev.velocity, ev.pitchOffset));
        }
      }
    }
    p.port.postMessage({ type: 'segment-copied', from, to });
    return true;
  }
}
