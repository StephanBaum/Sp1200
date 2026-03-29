import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AudioWorkletProcessor and worklet globals before importing processor
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { onmessage: null, postMessage: vi.fn() };
  }
};
globalThis.sampleRate = 44100;
globalThis.registerProcessor = vi.fn();

// Dynamic import so mocks are in place first
await import('../../js/audio/sp1200-processor.js');

// Grab the registered class from the registerProcessor call
const SP1200Processor = registerProcessor.mock.calls[0][1];

function createProcessor() {
  const proc = new SP1200Processor({});
  proc.port.postMessage = vi.fn();
  return proc;
}

describe('SP1200Processor Transport', () => {
  let proc;

  beforeEach(() => {
    proc = createProcessor();
  });

  // ── Play ─────────────────────────────────────────────────────────────────

  it('play sets isPlaying=true and starts clock', () => {
    expect(proc.isPlaying).toBe(false);
    proc._handleMessage({ type: 'transport', action: 'play' });
    expect(proc.isPlaying).toBe(true);
    expect(proc.clock.playing).toBe(true);
  });

  it('play resets patternTick to 0', () => {
    proc.patternTick = 42;
    proc._handleMessage({ type: 'transport', action: 'play' });
    expect(proc.patternTick).toBe(0);
  });

  // ── Stop ─────────────────────────────────────────────────────────────────

  it('stop sets isPlaying=false and isRecording=false', () => {
    proc._handleMessage({ type: 'transport', action: 'play' });
    proc._handleMessage({ type: 'transport', action: 'record' });
    expect(proc.isPlaying).toBe(true);
    expect(proc.isRecording).toBe(true);

    proc._handleMessage({ type: 'transport', action: 'stop' });
    expect(proc.isPlaying).toBe(false);
    expect(proc.isRecording).toBe(false);
    expect(proc.clock.playing).toBe(false);
  });

  it('stop resets patternTick to 0', () => {
    proc._handleMessage({ type: 'transport', action: 'play' });
    proc.patternTick = 100;
    proc._handleMessage({ type: 'transport', action: 'stop' });
    expect(proc.patternTick).toBe(0);
  });

  // ── Record ───────────────────────────────────────────────────────────────

  it('record sets isRecording=true and starts playing', () => {
    proc._handleMessage({ type: 'transport', action: 'record' });
    expect(proc.isRecording).toBe(true);
    expect(proc.isPlaying).toBe(true);
    expect(proc.clock.playing).toBe(true);
  });

  it('record preserves during play: send record then play, isRecording stays true', () => {
    proc._handleMessage({ type: 'transport', action: 'record' });
    expect(proc.isRecording).toBe(true);
    proc._handleMessage({ type: 'transport', action: 'play' });
    expect(proc.isRecording).toBe(true);
    expect(proc.isPlaying).toBe(true);
  });

  it('play preserves recording: send play while recording does not clear isRecording', () => {
    proc._handleMessage({ type: 'transport', action: 'play' });
    proc._handleMessage({ type: 'transport', action: 'record' });
    expect(proc.isPlaying).toBe(true);
    expect(proc.isRecording).toBe(true);
    // Now send play again
    proc._handleMessage({ type: 'transport', action: 'play' });
    expect(proc.isRecording).toBe(true);
  });

  // ── Trigger during recording ─────────────────────────────────────────────

  it('trigger during recording adds event to current pattern', () => {
    proc._handleMessage({ type: 'transport', action: 'record' });
    proc.patternTick = 48;
    proc._handleMessage({ type: 'trigger', pad: 0, velocity: 100 });

    const events = proc.patterns[proc.currentPatternIndex].tracks[0].events;
    expect(events.length).toBe(1);
    expect(events[0].velocity).toBe(100);
  });

  it('trigger without recording does not add events', () => {
    proc._handleMessage({ type: 'transport', action: 'play' });
    proc.patternTick = 48;
    proc._handleMessage({ type: 'trigger', pad: 0, velocity: 100 });

    const events = proc.patterns[proc.currentPatternIndex].tracks[0].events;
    expect(events.length).toBe(0);
  });

  it('trigger quantizes to grid when recording', () => {
    proc._handleMessage({ type: 'transport', action: 'record' });
    proc.quantizeGrid = 24; // 1/16
    proc.patternTick = 13; // should round to 24
    proc._handleMessage({ type: 'trigger', pad: 0, velocity: 100 });

    const events = proc.patterns[proc.currentPatternIndex].tracks[0].events;
    expect(events[0].tick).toBe(24);
  });

  // ── Pattern loop ─────────────────────────────────────────────────────────

  it('pattern loops: patternTick resets at end of pattern', () => {
    proc._handleMessage({ type: 'transport', action: 'play' });
    const totalTicks = proc.patterns[0].totalTicks;

    // Simulate reaching end of pattern
    proc.patternTick = totalTicks - 1;
    proc._processTick(totalTicks - 1);

    // patternTick should be 0 after incrementing past end
    expect(proc.patternTick).toBe(0);
  });

  it('pattern-end message is posted when pattern loops', () => {
    proc._handleMessage({ type: 'transport', action: 'play' });
    proc.port.postMessage.mockClear();
    const totalTicks = proc.patterns[0].totalTicks;
    proc.patternTick = totalTicks - 1;
    proc._processTick(totalTicks - 1);

    const msgs = proc.port.postMessage.mock.calls.map(c => c[0]);
    const endMsg = msgs.find(m => m.type === 'pattern-end');
    expect(endMsg).toBeDefined();
    expect(endMsg.patternIndex).toBe(0);
  });

  // ── Set BPM ──────────────────────────────────────────────────────────────

  it('set-bpm updates clock bpm', () => {
    proc._handleMessage({ type: 'set-bpm', bpm: 140 });
    expect(proc.clock.bpm).toBe(140);
  });

  it('set-bpm clamps to valid range', () => {
    proc._handleMessage({ type: 'set-bpm', bpm: 5 });
    expect(proc.clock.bpm).toBe(30); // BPM_MIN
    proc._handleMessage({ type: 'set-bpm', bpm: 999 });
    expect(proc.clock.bpm).toBe(250); // BPM_MAX
  });

  // ── Set quantize ─────────────────────────────────────────────────────────

  it('set-quantize updates quantizeGrid', () => {
    proc._handleMessage({ type: 'set-quantize', grid: 48 });
    expect(proc.quantizeGrid).toBe(48);
  });

  // ── Pattern select ───────────────────────────────────────────────────────

  it('pattern-select changes currentPatternIndex', () => {
    proc._handleMessage({ type: 'pattern-select', number: 5 });
    expect(proc.currentPatternIndex).toBe(5);
    expect(proc.patternTick).toBe(0);
  });

  it('pattern-select ignores out-of-range values', () => {
    proc._handleMessage({ type: 'pattern-select', number: 5 });
    proc._handleMessage({ type: 'pattern-select', number: -1 });
    expect(proc.currentPatternIndex).toBe(5);
    proc._handleMessage({ type: 'pattern-select', number: 200 });
    expect(proc.currentPatternIndex).toBe(5);
  });

  // ── Mode change ──────────────────────────────────────────────────────────

  it('set-mode updates mode', () => {
    proc._handleMessage({ type: 'set-mode', mode: 'song' });
    expect(proc.mode).toBe('song');
    proc._handleMessage({ type: 'set-mode', mode: 'pattern' });
    expect(proc.mode).toBe('pattern');
  });

  // ── Set swing ────────────────────────────────────────────────────────────

  it('set-swing updates swingPercent', () => {
    proc._handleMessage({ type: 'set-swing', amount: 60 });
    expect(proc.swingPercent).toBe(60);
  });

  it('set-swing clamps to valid range', () => {
    proc._handleMessage({ type: 'set-swing', amount: 20 });
    expect(proc.swingPercent).toBe(50); // SWING_MIN
    proc._handleMessage({ type: 'set-swing', amount: 100 });
    expect(proc.swingPercent).toBe(75); // SWING_MAX
  });

  // ── Step edit ────────────────────────────────────────────────────────────

  it('step-edit adds event to pattern track', () => {
    proc._handleMessage({ type: 'step-edit', track: 2, tick: 48, velocity: 90 });
    const events = proc.patterns[0].tracks[2].events;
    expect(events.length).toBe(1);
    expect(events[0].tick).toBe(48);
  });

  it('step-edit removes event when remove flag set', () => {
    proc._handleMessage({ type: 'step-edit', track: 2, tick: 48, velocity: 90 });
    proc._handleMessage({ type: 'step-edit', track: 2, tick: 48, remove: true });
    expect(proc.patterns[0].tracks[2].events.length).toBe(0);
  });

  // ── Metronome ────────────────────────────────────────────────────────────

  it('set-metronome toggles metronome', () => {
    proc._handleMessage({ type: 'set-metronome', enabled: true });
    expect(proc.metronomeEnabled).toBe(true);
    proc._handleMessage({ type: 'set-metronome', enabled: false });
    expect(proc.metronomeEnabled).toBe(false);
  });

  // ── Load sample ──────────────────────────────────────────────────────────

  it('load-sample sets voice buffer', () => {
    const buf = new Float32Array([0.1, 0.2, 0.3]);
    proc._handleMessage({ type: 'load-sample', pad: 3, buffer: buf.buffer });
    expect(proc.voices[3].sample).toBeDefined();
    expect(proc.voices[3].sample.length).toBe(3);
  });
});
