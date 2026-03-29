import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal DOM mock — SP1200State constructor accesses document
globalThis.document = {
  getElementById: () => ({
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
  }),
  querySelectorAll: () => [],
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};
globalThis.Event = class Event { constructor(type) { this.type = type; } };
globalThis.CustomEvent = class CustomEvent extends globalThis.Event {
  constructor(type, opts) { super(type); this.detail = opts?.detail; }
};
globalThis.setTimeout = vi.fn((fn) => fn());

import { SP1200State } from '../../js/ui/sp1200-state.js';

function mockDisplay() {
  return {
    lock: vi.fn(),
    unlock: vi.fn(),
    setLine1: vi.fn(),
    setLine2: vi.fn(),
    setMode: vi.fn(),
    flash: vi.fn(),
    setBpm: vi.fn(),
    setSong: vi.fn(),
    setPlaying: vi.fn(),
  };
}

function mockEngine() {
  return {
    send: vi.fn(),
    setMode: vi.fn(),
  };
}

describe('SP1200State', () => {
  let state, display, engine;

  beforeEach(() => {
    display = mockDisplay();
    engine = mockEngine();
    state = new SP1200State(engine, display);
  });

  // ── Default state values ─────────────────────────────────────────────────

  it('has correct defaults', () => {
    expect(state.playing).toBe(false);
    expect(state.recording).toBe(false);
    expect(state.mode).toBe('segment');
    expect(state.bpm).toBe(120);
    expect(state.currentSegment).toBe(0);
    expect(state.segmentLength).toBe(2);
    expect(state.swingAmount).toBe(50);
    expect(state.quantizeIndex).toBe(3);
    expect(state.quantizeGrid).toBe(24);
    expect(state.activeModule).toBeNull();
    expect(state.editParam).toBeNull();
    expect(state.numericBuffer).toBe('');
    expect(state.currentBank).toBe(0);
    expect(state.dynamicButtons).toBe(false);
    expect(state.sampleGainIndex).toBe(0);
    expect(state.selectedSamplePad).toBe(0);
    expect(state.sampleLength).toBe(2.5);
    expect(state.sampleThreshold).toBe(0.05);
    expect(state.smpteIndex).toBe(0);
    expect(state.currentSong).toBe(0);
    expect(state.multiMode).toBeNull();
    expect(state.stepProgramMode).toBe(false);
    expect(state.eraseMode).toBe(false);
    expect(state.metronomeOn).toBe(true);
    expect(state.faderMode).toBe('volume');
    expect(state.timeSig).toBe('4/4');
  });

  it('padModes defaults to all tune', () => {
    expect(state.padModes.length).toBe(8);
    for (const m of state.padModes) expect(m).toBe('tune');
  });

  it('channelAssign defaults to identity mapping', () => {
    for (let i = 0; i < 8; i++) expect(state.channelAssign[i]).toBe(i);
  });

  // ── vuPadLabel ───────────────────────────────────────────────────────────

  it('vuPadLabel returns 16-char string starting with bank+pad', () => {
    state.currentBank = 0;
    state.selectedSamplePad = 0;
    state.sampleGainIndex = 0;
    const label = state.vuPadLabel();
    expect(label).toHaveLength(16);
    expect(label.startsWith('A1')).toBe(true);
  });

  it('vuPadLabel updates with bank change', () => {
    state.currentBank = 2; // C
    state.selectedSamplePad = 4; // pad 5
    const label = state.vuPadLabel();
    expect(label).toHaveLength(16);
    expect(label.startsWith('C5')).toBe(true);
  });

  it('vuPadLabel updates with pad change', () => {
    state.currentBank = 1; // B
    state.selectedSamplePad = 6; // pad 7
    const label = state.vuPadLabel();
    expect(label.startsWith('B7')).toBe(true);
  });

  it('vuPadLabel handles bank D pad 8', () => {
    state.currentBank = 3;
    state.selectedSamplePad = 7;
    const label = state.vuPadLabel();
    expect(label).toHaveLength(16);
    expect(label.startsWith('D8')).toBe(true);
  });

  // ── gainLabel ────────────────────────────────────────────────────────────

  it('gainLabel returns correct gain string', () => {
    state.sampleGainIndex = 0;
    expect(state.gainLabel()).toBe('+00dB');
    state.sampleGainIndex = 1;
    expect(state.gainLabel()).toBe('+20dB');
    state.sampleGainIndex = 2;
    expect(state.gainLabel()).toBe('+40dB');
  });

  // ── smpteLabel ───────────────────────────────────────────────────────────

  it('smpteLabel returns correct rate string', () => {
    state.smpteIndex = 0;
    expect(state.smpteLabel()).toBe('24fps');
    state.smpteIndex = 1;
    expect(state.smpteLabel()).toBe('25fps');
    state.smpteIndex = 2;
    expect(state.smpteLabel()).toBe('30fps');
    state.smpteIndex = 3;
    expect(state.smpteLabel()).toBe('30-drop');
  });

  // ── moduleDisplay ────────────────────────────────────────────────────────

  it('moduleDisplay calls display.lock and sets lines', () => {
    state.moduleDisplay('Test Line 1', 'Test Line 2');
    expect(display.lock).toHaveBeenCalled();
    expect(display.setLine1).toHaveBeenCalledWith('Test Line 1');
    expect(display.setLine2).toHaveBeenCalledWith('Test Line 2');
  });

  it('moduleDisplay defaults line2 to empty string', () => {
    state.moduleDisplay('Only Line 1');
    expect(display.setLine2).toHaveBeenCalledWith('');
  });

  // ── exitModule ───────────────────────────────────────────────────────────

  it('exitModule clears activeModule, editParam, unlocks display', () => {
    state.activeModule = 'setup';
    state.editParam = 'some-param';
    state.numericBuffer = '42';
    state.pendingAction = 'some-action';

    state.exitModule();

    expect(state.activeModule).toBeNull();
    expect(state.editParam).toBeNull();
    expect(state.numericBuffer).toBe('');
    expect(state.pendingAction).toBeNull();
    expect(display.unlock).toHaveBeenCalled();
    expect(display.setMode).toHaveBeenCalledWith('segment');
  });

  it('exitModule is no-op if no active module', () => {
    state.activeModule = null;
    state.exitModule();
    expect(display.unlock).not.toHaveBeenCalled();
  });

  // ── flashDisplay ─────────────────────────────────────────────────────────

  it('flashDisplay does not override when editParam is set', () => {
    state.editParam = 'bpm';
    state.activeModule = null;
    state.flashDisplay();
    // setTimeout was called, and our mock executes it immediately
    // Since editParam is set, unlock should NOT have been called
    expect(display.unlock).not.toHaveBeenCalled();
  });

  it('flashDisplay does not override when activeModule is set', () => {
    state.activeModule = 'setup';
    state.editParam = null;
    state.flashDisplay();
    expect(display.unlock).not.toHaveBeenCalled();
  });

  it('flashDisplay unlocks and sets mode when no editParam or activeModule', () => {
    state.activeModule = null;
    state.editParam = null;
    state.mode = 'segment';
    state.flashDisplay();
    expect(display.unlock).toHaveBeenCalled();
    expect(display.setMode).toHaveBeenCalledWith('segment');
  });

  it('flashDisplay sets song mode when in song mode', () => {
    state.activeModule = null;
    state.editParam = null;
    state.mode = 'song';
    state.flashDisplay();
    expect(display.setMode).toHaveBeenCalledWith('song');
  });

  it('flashDisplay sets step mode when in step-edit mode', () => {
    state.activeModule = null;
    state.editParam = null;
    state.mode = 'step-edit';
    state.flashDisplay();
    expect(display.setMode).toHaveBeenCalledWith('step');
  });
});
