import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupHandler } from '../../js/audio/setup-handler.js';
import { NUM_PADS, TOTAL_PADS, MAX_PATTERNS, BASE_PITCH_STEP } from '../../js/constants.js';
import { Pattern, PatternEvent } from '../../js/sequencer/pattern.js';
import { Mixer } from '../../js/dsp/mixer.js';
import { Voice } from '../../js/dsp/voice.js';

function mockProcessor() {
  const voices = Array.from({ length: NUM_PADS }, (_, i) => new Voice(i));
  // Load a sample into each voice so multi-pitch/level can work
  for (const v of voices) {
    v.loadSample(new Float32Array(100).fill(0.5));
  }

  // Build sample slots (32 total) and populate bank 0 from voices
  const sampleSlots = Array.from({ length: TOTAL_PADS }, () => ({
    sample: null,
    pitch: BASE_PITCH_STEP,
    decayRate: 1.0,
    reversed: false,
    loopEnabled: false, loopStart: 0, loopEnd: 0,
    startPoint: 0, endPoint: 0,
  }));
  for (let i = 0; i < NUM_PADS; i++) {
    sampleSlots[i].sample = voices[i].sample;
    sampleSlots[i].endPoint = voices[i].sample ? voices[i].sample.length - 1 : 0;
  }

  return {
    voices,
    sampleSlots,
    currentBank: 0,
    patterns: Array.from({ length: MAX_PATTERNS }, () => new Pattern()),
    currentPatternIndex: 0,
    patternTick: 50,
    quantizeGrid: 24,
    mixSnapshots: Array.from({ length: 8 }, () => new Float32Array(8).fill(0.75)),
    mixer: new Mixer(),
    dynamicButtons: false,
    padModes: new Array(8).fill('tune'),
    channelAssign: new Uint8Array(8),
    _multiBackup: null,
    port: { postMessage: vi.fn() },
  };
}

describe('SetupHandler', () => {
  let proc, handler;

  beforeEach(() => {
    proc = mockProcessor();
    handler = new SetupHandler(proc);
  });

  // ── multi-pitch ──────────────────────────────────────────────────────────

  it('multi-pitch stores backup and distributes pitched copies', () => {
    const result = handler.handle({ type: 'multi-pitch', pad: 0 });
    expect(result).toBe(true);
    expect(proc._multiBackup).not.toBeNull();
    expect(proc._multiBackup.length).toBe(NUM_PADS);

    // All voices should have the sample from pad 0
    for (let i = 0; i < NUM_PADS; i++) {
      expect(proc.voices[i].sample).toBeDefined();
    }

    // Voices should have different pitches
    expect(proc.voices[0].pitch).not.toBe(proc.voices[7].pitch);

    // Should post multi-pitch-active message
    const msg = proc.port.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('multi-pitch-active');
    expect(msg.sourcePad).toBe(0);
  });

  it('multi-pitch ignores invalid pad', () => {
    handler.handle({ type: 'multi-pitch', pad: -1 });
    expect(proc._multiBackup).toBeNull();
  });

  // ── multi-level ──────────────────────────────────────────────────────────

  it('multi-level stores backup and sets volume levels', () => {
    const result = handler.handle({ type: 'multi-level', pad: 2 });
    expect(result).toBe(true);
    expect(proc._multiBackup).not.toBeNull();

    // All voices should share the same sample
    for (let i = 0; i < NUM_PADS; i++) {
      expect(proc.voices[i].sample).toBeDefined();
      expect(proc.voices[i].pitch).toBe(BASE_PITCH_STEP);
    }

    // Volumes should be graduated
    expect(proc.mixer.channels[0].volume).toBeCloseTo(1 / NUM_PADS, 5);
    expect(proc.mixer.channels[7].volume).toBeCloseTo(1.0, 5);
  });

  // ── exit-multi ───────────────────────────────────────────────────────────

  it('exit-multi restores backup', () => {
    // First enter multi
    handler.handle({ type: 'multi-pitch', pad: 0 });
    const origPitch = proc._multiBackup[3].pitch;

    handler.handle({ type: 'exit-multi' });
    expect(proc._multiBackup).toBeNull();
    expect(proc.voices[3].pitch).toBe(origPitch);
  });

  it('exit-multi is no-op without backup', () => {
    const result = handler.handle({ type: 'exit-multi' });
    expect(result).toBe(true);
    expect(proc._multiBackup).toBeNull();
  });

  // ── dynamic-buttons ──────────────────────────────────────────────────────

  it('dynamic-buttons toggles dynamicButtons flag', () => {
    handler.handle({ type: 'dynamic-buttons', enabled: true });
    expect(proc.dynamicButtons).toBe(true);

    handler.handle({ type: 'dynamic-buttons', enabled: false });
    expect(proc.dynamicButtons).toBe(false);
  });

  // ── define-mix ───────────────────────────────────────────────────────────

  it('define-mix saves current mixer volumes to snapshot slot', () => {
    proc.mixer.setVolume(0, 0.3);
    proc.mixer.setVolume(3, 0.9);

    handler.handle({ type: 'define-mix', slot: 2 });

    expect(proc.mixSnapshots[2][0]).toBeCloseTo(0.3, 5);
    expect(proc.mixSnapshots[2][3]).toBeCloseTo(0.9, 5);
  });

  it('define-mix ignores invalid slot', () => {
    const orig = proc.mixSnapshots[0][0];
    handler.handle({ type: 'define-mix', slot: -1 });
    expect(proc.mixSnapshots[0][0]).toBe(orig);
    handler.handle({ type: 'define-mix', slot: 10 });
    expect(proc.mixSnapshots[0][0]).toBe(orig);
  });

  // ── select-mix ───────────────────────────────────────────────────────────

  it('select-mix restores mixer volumes from snapshot slot', () => {
    proc.mixSnapshots[4][0] = 0.2;
    proc.mixSnapshots[4][5] = 0.8;

    handler.handle({ type: 'select-mix', slot: 4 });

    expect(proc.mixer.channels[0].volume).toBeCloseTo(0.2, 5);
    expect(proc.mixer.channels[5].volume).toBeCloseTo(0.8, 5);
  });

  // ── delete-sound ─────────────────────────────────────────────────────────

  it('delete-sound clears voice buffer', () => {
    expect(proc.voices[3].sample).not.toBeNull();
    handler.handle({ type: 'delete-sound', pad: 3 });
    expect(proc.voices[3].sample).toBeNull();
    expect(proc.voices[3].active).toBe(false);

    const msg = proc.port.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('sound-deleted');
    expect(msg.pad).toBe(3);
  });

  // ── reverse-sound ────────────────────────────────────────────────────────

  it('reverse-sound toggles voice reversed state', () => {
    expect(proc.voices[1].reversed).toBe(false);
    handler.handle({ type: 'reverse-sound', pad: 1 });
    expect(proc.voices[1].reversed).toBe(true);
    handler.handle({ type: 'reverse-sound', pad: 1 });
    expect(proc.voices[1].reversed).toBe(false);
  });

  // ── copy-sound ───────────────────────────────────────────────────────────

  it('copy-sound copies buffer from one slot to another', () => {
    // Clear slot 5 sample first
    proc.sampleSlots[5].sample = null;
    proc.voices[5].sample = null;
    handler.handle({ type: 'copy-sound', from: 0, to: 5 });
    // Slot and voice (same bank) should both be updated
    expect(proc.sampleSlots[5].sample).not.toBeNull();
    expect(proc.voices[5].sample).not.toBeNull();

    const msg = proc.port.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('sound-copied');
  });

  it('copy-sound handles null source', () => {
    proc.sampleSlots[2].sample = null;
    handler.handle({ type: 'copy-sound', from: 2, to: 4 });
    expect(proc.sampleSlots[4].sample).toBeNull();
  });

  // ── swap-sounds ──────────────────────────────────────────────────────────

  it('swap-sounds swaps buffers between two slots', () => {
    const sampleA = new Float32Array([1, 2, 3]);
    const sampleB = new Float32Array([4, 5, 6, 7]);
    proc.sampleSlots[0].sample = sampleA;
    proc.sampleSlots[0].endPoint = 2;
    proc.sampleSlots[1].sample = sampleB;
    proc.sampleSlots[1].endPoint = 3;

    handler.handle({ type: 'swap-sounds', padA: 0, padB: 1 });

    expect(proc.sampleSlots[0].sample.length).toBe(4);
    expect(proc.sampleSlots[1].sample.length).toBe(3);
    // Voices should also be updated (same bank)
    expect(proc.voices[0].sample.length).toBe(4);
    expect(proc.voices[1].sample.length).toBe(3);
  });

  // ── erase-segment ────────────────────────────────────────────────────────

  it('erase-segment clears all tracks in a pattern', () => {
    proc.patterns[3].addEvent(0, new PatternEvent(0, 100));
    proc.patterns[3].addEvent(2, new PatternEvent(48, 80));

    handler.handle({ type: 'erase-segment', segment: 3 });

    for (let t = 0; t < NUM_PADS; t++) {
      expect(proc.patterns[3].tracks[t].events.length).toBe(0);
    }
  });

  it('erase-segment ignores out-of-range segment', () => {
    proc.patterns[0].addEvent(0, new PatternEvent(0, 100));
    handler.handle({ type: 'erase-segment', segment: -1 });
    expect(proc.patterns[0].tracks[0].events.length).toBe(1);
  });

  // ── copy-segment ─────────────────────────────────────────────────────────

  it('copy-segment duplicates pattern data', () => {
    proc.patterns[0].addEvent(0, new PatternEvent(0, 100, 2));
    proc.patterns[0].addEvent(3, new PatternEvent(48, 80, -1));
    proc.patterns[0].setBars(3);

    handler.handle({ type: 'copy-segment', from: 0, to: 5 });

    expect(proc.patterns[5].bars).toBe(3);
    expect(proc.patterns[5].tracks[0].events.length).toBe(1);
    expect(proc.patterns[5].tracks[0].events[0].velocity).toBe(100);
    expect(proc.patterns[5].tracks[0].events[0].pitchOffset).toBe(2);
    expect(proc.patterns[5].tracks[3].events[0].tick).toBe(48);
  });

  it('copy-segment to itself doubles the pattern', () => {
    proc.patterns[0].setBars(2);
    proc.patterns[0].addEvent(0, new PatternEvent(0, 100));
    proc.patterns[0].addEvent(1, new PatternEvent(48, 80));

    handler.handle({ type: 'copy-segment', from: 0, to: 0 });

    expect(proc.patterns[0].bars).toBe(4);
    expect(proc.patterns[0].tracks[0].events.length).toBe(2);
    expect(proc.patterns[0].tracks[1].events.length).toBe(2);
    const origTicks = 2 * 96 * 4; // 768
    expect(proc.patterns[0].tracks[0].events[1].tick).toBe(origTicks);
    expect(proc.patterns[0].tracks[1].events[1].tick).toBe(48 + origTicks);
  });

  // ── erase-track ──────────────────────────────────────────────────────────

  it('erase-track removes events near current tick', () => {
    proc.patterns[0].addEvent(1, new PatternEvent(48, 100));
    proc.patterns[0].addEvent(1, new PatternEvent(96, 80));
    proc.patternTick = 50;
    proc.quantizeGrid = 24;

    handler.handle({ type: 'erase-track', pad: 1 });

    // Event at tick 48 is within window (|48-50| = 2 <= 24), should be removed
    // Event at tick 96 is outside window (|96-50| = 46 > 24), should remain
    const remaining = proc.patterns[0].tracks[1].events;
    expect(remaining.length).toBe(1);
    expect(remaining[0].tick).toBe(96);
  });

  // ── truncate ─────────────────────────────────────────────────────────────

  it('truncate slices voice buffer to start/end range', () => {
    const bigBuf = new Float32Array(200);
    for (let i = 0; i < 200; i++) bigBuf[i] = i;
    proc.voices[0].loadSample(bigBuf);
    proc.voices[0].buffer = bigBuf; // setup-handler uses .buffer

    handler.handle({ type: 'truncate', pad: 0, start: 10, end: 50 });

    expect(proc.voices[0].buffer.length).toBe(40);
    expect(proc.voices[0].buffer[0]).toBe(10);
    expect(proc.voices[0].length).toBe(40);
  });

  // ── channel-assign ───────────────────────────────────────────────────────

  it('channel-assign sets channelAssign value', () => {
    handler.handle({ type: 'channel-assign', pad: 3, channel: 5 });
    expect(proc.channelAssign[3]).toBe(5);
  });

  it('channel-assign ignores out-of-range pad', () => {
    handler.handle({ type: 'channel-assign', pad: -1, channel: 5 });
    handler.handle({ type: 'channel-assign', pad: 10, channel: 5 });
    // No crash, and values unchanged
    expect(proc.channelAssign[0]).toBe(0);
  });

  // ── decay-tune-select ────────────────────────────────────────────────────

  it('decay-tune-select changes padMode', () => {
    handler.handle({ type: 'decay-tune-select', pad: 2, mode: 'decay' });
    expect(proc.padModes[2]).toBe('decay');

    handler.handle({ type: 'decay-tune-select', pad: 2, mode: 'tune' });
    expect(proc.padModes[2]).toBe('tune');
  });

  it('decay-tune-select defaults to tune for unknown mode', () => {
    handler.handle({ type: 'decay-tune-select', pad: 4, mode: 'invalid' });
    expect(proc.padModes[4]).toBe('tune');
  });

  // ── truncate-permanent ───────────────────────────────────────────────────

  it('truncate-permanent slices sample buffer and updates slot', () => {
    const bigBuf = new Float32Array(200);
    for (let i = 0; i < 200; i++) bigBuf[i] = i;
    proc.sampleSlots[0].sample = bigBuf;
    proc.sampleSlots[0].startPoint = 0;
    proc.sampleSlots[0].endPoint = 199;

    handler.handle({ type: 'truncate-permanent', pad: 0, bank: 0, start: 10, end: 49 });

    // Sliced from 10 to 49 inclusive = 40 samples
    expect(proc.sampleSlots[0].sample.length).toBe(40);
    expect(proc.sampleSlots[0].sample[0]).toBe(10);
    expect(proc.sampleSlots[0].sample[39]).toBe(49);
    expect(proc.sampleSlots[0].startPoint).toBe(0);
    expect(proc.sampleSlots[0].endPoint).toBe(39);

    // Voice should be updated (same bank)
    expect(proc.voices[0].sample.length).toBe(40);

    // Should post truncated message
    const msg = proc.port.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('truncated');
    expect(msg.pad).toBe(0);
    expect(msg.length).toBe(40);
  });

  it('truncate-permanent with loop point preserves relative loop', () => {
    const bigBuf = new Float32Array(200);
    for (let i = 0; i < 200; i++) bigBuf[i] = i;
    proc.sampleSlots[2].sample = bigBuf;
    proc.sampleSlots[2].startPoint = 0;
    proc.sampleSlots[2].endPoint = 199;
    proc.sampleSlots[2].loopEnabled = true;
    proc.sampleSlots[2].loopStart = 50;
    proc.sampleSlots[2].loopEnd = 150;

    handler.handle({ type: 'truncate-permanent', pad: 2, bank: 0, start: 20, end: 179 });

    // New buffer is 160 samples (20..179 inclusive)
    expect(proc.sampleSlots[2].sample.length).toBe(160);
    // Loop start was 50, shifted by -20 = 30
    expect(proc.sampleSlots[2].loopStart).toBe(30);
    // Loop end was 150, shifted by -20 = 130
    expect(proc.sampleSlots[2].loopEnd).toBe(130);
    expect(proc.sampleSlots[2].loopEnabled).toBe(true);
  });

  // ── unknown message type returns false ────────────────────────────────────

  it('returns false for unknown message types', () => {
    const result = handler.handle({ type: 'unknown-type' });
    expect(result).toBe(false);
  });
});
