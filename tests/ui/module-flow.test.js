import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleModuleFunction } from '../../js/ui/modules.js';
import { execProgFunction } from '../../js/ui/programming.js';

// Minimal DOM mock for modules.js (uses document.dispatchEvent for sample events)
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
globalThis.setTimeout = vi.fn();

function mockState() {
  return {
    activeModule: null,
    editParam: null,
    numericBuffer: '',
    pendingAction: null,
    _pendingPad: null,
    playing: false,
    mode: 'segment',
    currentBank: 0,
    currentSong: 0,
    currentSegment: 0,
    segmentLength: 2,
    dynamicButtons: false,
    multiMode: null,
    sampleGainIndex: 0,
    selectedSamplePad: 0,
    smpteIndex: 0,
    padModes: new Array(8).fill('tune'),
    channelAssign: new Uint8Array(8),
    sampleLength: 2.5,
    sampleThreshold: 0.05,
    timeSig: '4/4',
    swingAmount: 50,
    quantizeIndex: 3,
    bpm: 120,
    metronomeOn: false,
    stepProgramMode: false,
    eraseMode: false,
    storage: { listDisks: async () => [] },
    fsStorage: { hasFolder: true, _refreshFiles: async () => {}, getFileList: () => [], dirHandle: { name: 'test' } },
    engine: { send: vi.fn(), setMode: vi.fn() },
    display: {
      lock: vi.fn(),
      unlock: vi.fn(),
      setLine1: vi.fn(),
      setLine2: vi.fn(),
      flash: vi.fn(),
      showVU: vi.fn(),
      setMode: vi.fn(),
      setBpm: vi.fn(),
      setSong: vi.fn(),
      setPlaying: vi.fn(),
    },
    moduleDisplay: function (l1, l2) {
      this._lastDisplay = [l1, l2 || ''];
      this.display.lock();
      this.display.setLine1(l1);
      this.display.setLine2(l2 || '');
    },
    led: vi.fn(),
    bindBtn: vi.fn(),
    vuPadLabel: function () {
      const bank = ['A', 'B', 'C', 'D'][this.currentBank];
      const pad = (this.selectedSamplePad || 0) + 1;
      const gains = ['+00dB', '+20dB', '+40dB'];
      const gain = gains[this.sampleGainIndex || 0];
      const left = bank + pad;
      const spaces = 16 - left.length - gain.length;
      return left + ' '.repeat(Math.max(1, spaces)) + gain;
    },
    gainLabel: function () {
      return ['+00dB', '+20dB', '+40dB'][this.sampleGainIndex || 0];
    },
    smpteLabel: function () {
      return ['24fps', '25fps', '30fps', '30-drop'][this.smpteIndex || 0];
    },
    listenSampleDone: vi.fn(),
    exitModule: vi.fn(),
    flashDisplay: vi.fn(),
    _lastDisplay: null,
  };
}

// ============================================================================
// Setup Module
// ============================================================================

describe('Module Flow: Setup', () => {
  let s;

  beforeEach(() => {
    s = mockState();
    s.activeModule = 'setup';
  });

  it('Setup while playing restricts to 11-13', () => {
    s.playing = true;
    handleModuleFunction(s, 20);
    expect(s._lastDisplay[1]).toBe('[11-13]');
    expect(s.editParam).toBe('module-func');
  });

  it('Setup while playing allows 11', () => {
    s.playing = true;
    handleModuleFunction(s, 11);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('multi-pitch');
  });

  it('Setup 11: multi-pitch', () => {
    handleModuleFunction(s, 11);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('multi-pitch');
    expect(s._lastDisplay[0]).toBe('Multi Pitch');
  });

  it('Setup 12: multi-level', () => {
    handleModuleFunction(s, 12);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('multi-level');
  });

  it('Setup 13: exit-multi-confirm', () => {
    handleModuleFunction(s, 13);
    expect(s.editParam).toBe('exit-multi-confirm');
    expect(s._lastDisplay[1]).toBe('YES/NO');
  });

  it('Setup 14: shows dynamic button state', () => {
    s.dynamicButtons = true;
    handleModuleFunction(s, 14);
    expect(s.editParam).toBe('dynamic-confirm');
    expect(s._lastDisplay[0]).toContain('YES');
  });

  it('Setup 14: shows NO when dynamic buttons off', () => {
    s.dynamicButtons = false;
    handleModuleFunction(s, 14);
    expect(s._lastDisplay[0]).toContain('NO');
  });

  it('Setup 15: define-mix', () => {
    handleModuleFunction(s, 15);
    expect(s.editParam).toBe('define-mix');
    expect(s._lastDisplay[0]).toBe('Save Current Mix');
  });

  it('Setup 16: select-mix', () => {
    handleModuleFunction(s, 16);
    expect(s.editParam).toBe('select-mix');
  });

  it('Setup 17: channel-assign', () => {
    handleModuleFunction(s, 17);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('channel-assign');
  });

  it('Setup 18: decay-tune', () => {
    handleModuleFunction(s, 18);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('decay-tune');
  });

  it('Setup 19: truncate', () => {
    handleModuleFunction(s, 19);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('truncate');
  });

  it('Setup 20: delete-sound', () => {
    handleModuleFunction(s, 20);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('delete-sound');
    expect(s._lastDisplay[0]).toBe('Delete:');
  });

  it('Setup 21: first-song-step', () => {
    handleModuleFunction(s, 21);
    expect(s.editParam).toBe('first-song-step');
  });

  it('Setup 22: midi-channel', () => {
    handleModuleFunction(s, 22);
    expect(s.editParam).toBe('midi-channel');
    expect(s._lastDisplay[0]).toBe('Midi Parameters');
  });

  it('Setup 23: special-menu', () => {
    handleModuleFunction(s, 23);
    expect(s.editParam).toBe('special-menu');
  });

  it('Setup 25: reverse-sound', () => {
    handleModuleFunction(s, 25);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('reverse-sound');
  });

  it('Invalid setup number shows Not available', () => {
    handleModuleFunction(s, 99);
    expect(s._lastDisplay[1]).toBe('Not available');
  });
});

// ============================================================================
// Sample Module
// ============================================================================

describe('Module Flow: Sample', () => {
  let s;

  beforeEach(() => {
    s = mockState();
    s.activeModule = 'sample';
  });

  it('Sample 1: enters VU mode', () => {
    handleModuleFunction(s, 1);
    expect(s.editParam).toBe('vu-mode');
    expect(s.display.lock).toHaveBeenCalled();
  });

  it('Sample 2: assign-voice', () => {
    handleModuleFunction(s, 2);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('assign-voice');
  });

  it('Sample 3: sample-level', () => {
    handleModuleFunction(s, 3);
    expect(s.editParam).toBe('sample-level');
    expect(s._lastDisplay[0]).toContain('Input Gain');
  });

  it('Sample 4: threshold', () => {
    handleModuleFunction(s, 4);
    expect(s.editParam).toBe('threshold');
  });

  it('Sample 5: sample-length with current length', () => {
    s.sampleLength = 3.0;
    handleModuleFunction(s, 5);
    expect(s.editParam).toBe('sample-length');
    expect(s._lastDisplay[0]).toContain('3.0');
  });

  it('Sample 6: resample-confirm', () => {
    handleModuleFunction(s, 6);
    expect(s.editParam).toBe('resample-confirm');
  });

  it('Sample 7: calls listenSampleDone', () => {
    handleModuleFunction(s, 7);
    expect(s.listenSampleDone).toHaveBeenCalled();
  });

  it('Sample 9: calls listenSampleDone', () => {
    handleModuleFunction(s, 9);
    expect(s.listenSampleDone).toHaveBeenCalled();
  });

  it('Invalid sample number shows Not available', () => {
    handleModuleFunction(s, 99);
    expect(s._lastDisplay[1]).toBe('Not available');
  });
});

// ============================================================================
// Sync Module
// ============================================================================

describe('Module Flow: Sync', () => {
  let s;

  beforeEach(() => {
    s = mockState();
    s.activeModule = 'sync';
  });

  it('Sync 1: sends set-sync mode 1 (internal)', () => {
    handleModuleFunction(s, 1);
    expect(s.engine.send).toHaveBeenCalledWith({ type: 'set-sync', mode: 1 });
    expect(s._lastDisplay[0]).toBe('Select Internal');
  });

  it('Sync 2: sends set-sync mode 2 (midi)', () => {
    handleModuleFunction(s, 2);
    expect(s.engine.send).toHaveBeenCalledWith({ type: 'set-sync', mode: 2 });
  });

  it('Sync 3: smpte-rate', () => {
    handleModuleFunction(s, 3);
    expect(s.editParam).toBe('smpte-rate');
    expect(s._lastDisplay[1]).toBe('24fps');
  });

  it('Sync 4: click-divisor', () => {
    handleModuleFunction(s, 4);
    expect(s.editParam).toBe('click-divisor');
  });

  it('Invalid sync number shows Not available', () => {
    handleModuleFunction(s, 9);
    expect(s._lastDisplay[1]).toBe('Not available');
  });
});

// ============================================================================
// Disk Module
// ============================================================================

describe('Module Flow: Disk', () => {
  let s;

  beforeEach(() => {
    s = mockState();
    s.activeModule = 'disk';
  });

  it('Disk 9: sets disk-name with UNTITLED buffer', () => {
    handleModuleFunction(s, 9);
    expect(s.editParam).toBe('disk-name');
    expect(s.diskNameBuffer).toBe('UNTITLED');
    expect(s.diskNameCursor).toBe(0);
    expect(s._lastDisplay[0]).toBe('Save All As');
  });

  it('Disk 4: disk-seg-num', () => {
    handleModuleFunction(s, 4);
    expect(s.editParam).toBe('disk-seg-num');
  });

  it('Disk 6: select-pad for load-sound-pad', () => {
    handleModuleFunction(s, 6);
    expect(s.editParam).toBe('select-pad');
    expect(s.pendingAction).toBe('load-sound-pad');
  });

  it('Invalid disk number shows Not available', () => {
    handleModuleFunction(s, 88);
    expect(s._lastDisplay[1]).toBe('Not available');
  });
});

// ============================================================================
// No active module
// ============================================================================

describe('Module Flow: no active module', () => {
  it('handleModuleFunction does nothing when no activeModule', () => {
    const s = mockState();
    s.activeModule = null;
    handleModuleFunction(s, 11);
    expect(s._lastDisplay).toBeNull();
  });
});

// ============================================================================
// Programming Functions
// ============================================================================

describe('Programming Functions', () => {
  let s;

  beforeEach(() => {
    s = mockState();
  });

  it('swing sets editParam="swing"', () => {
    execProgFunction(s, 'swing');
    expect(s.editParam).toBe('swing');
    expect(s._lastDisplay[0]).toContain('Swing');
  });

  it('auto-correct sets editParam="quantize"', () => {
    execProgFunction(s, 'auto-correct');
    expect(s.editParam).toBe('quantize');
    expect(s._lastDisplay[0]).toBe('Auto-Correct');
  });

  it('tempo-change sets editParam="bpm"', () => {
    execProgFunction(s, 'tempo-change');
    expect(s.editParam).toBe('bpm');
    expect(s._lastDisplay[0]).toContain('Tempo');
  });

  it('step-program toggles stepProgramMode', () => {
    expect(s.stepProgramMode).toBe(false);
    execProgFunction(s, 'step-program');
    expect(s.stepProgramMode).toBe(true);
    expect(s.mode).toBe('step-edit');
  });

  it('step-program toggles back off', () => {
    s.stepProgramMode = true;
    execProgFunction(s, 'step-program');
    expect(s.stepProgramMode).toBe(false);
    expect(s.mode).toBe('segment');
  });

  it('metronome toggles metronomeOn', () => {
    execProgFunction(s, 'metronome');
    expect(s.metronomeOn).toBe(true);
    expect(s.engine.send).toHaveBeenCalledWith({ type: 'set-metronome', enabled: true });

    execProgFunction(s, 'metronome');
    expect(s.metronomeOn).toBe(false);
  });

  it('copy sets editParam="copy"', () => {
    execProgFunction(s, 'copy');
    expect(s.editParam).toBe('copy');
  });

  it('erase while playing toggles eraseMode', () => {
    s.playing = true;
    execProgFunction(s, 'erase');
    expect(s.eraseMode).toBe(true);
    execProgFunction(s, 'erase');
    expect(s.eraseMode).toBe(false);
  });

  it('erase while stopped sets editParam="erase-seg"', () => {
    s.playing = false;
    execProgFunction(s, 'erase');
    expect(s.editParam).toBe('erase-seg');
  });

  it('seg-length sets editParam="seg-length"', () => {
    execProgFunction(s, 'seg-length');
    expect(s.editParam).toBe('seg-length');
  });

  it('time-sig sets editParam="time-sig"', () => {
    execProgFunction(s, 'time-sig');
    expect(s.editParam).toBe('time-sig');
  });

  // ── Song mode functions ──────────────────────────────────────────────────

  it('trigger sets editParam="trigger-type"', () => {
    execProgFunction(s, 'trigger');
    expect(s.editParam).toBe('trigger-type');
  });

  it('repeat sets editParam="repeat-count"', () => {
    execProgFunction(s, 'repeat');
    expect(s.editParam).toBe('repeat-count');
  });

  it('tabsong sets editParam="tabsong"', () => {
    execProgFunction(s, 'tabsong');
    expect(s.editParam).toBe('tabsong');
  });

  it('end sends song-end-mark', () => {
    execProgFunction(s, 'end');
    expect(s.engine.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'song-end-mark' })
    );
  });

  it('insert sends song-insert', () => {
    execProgFunction(s, 'insert');
    expect(s.engine.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'song-insert' })
    );
  });

  it('delete sends song-delete', () => {
    execProgFunction(s, 'delete');
    expect(s.engine.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'song-delete' })
    );
  });

  it('mix-change sets editParam="mix-change"', () => {
    execProgFunction(s, 'mix-change');
    expect(s.editParam).toBe('mix-change');
  });
});
