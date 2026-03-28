# Transport.js Refactor — Separation of Concerns

## Goal
Split the 1100-line `js/ui/transport.js` into focused modules sharing a common state object. Pure refactor — no behavior changes.

## Shared State: `js/ui/sp1200-state.js`
Single object holding all UI state + references to `engine` and `display`. Provides shared helpers (`_led`, `_moduleDisplay`, `_bindBtn`). Every other module receives this state object.

```javascript
export class SP1200State {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    // Transport
    this.playing = false;
    this.recording = false;
    this.bpm = 120;
    this.mode = 'segment';
    this.tapTimes = [];
    this.tapRepeatHeld = false;
    this._repeatInterval = null;
    // Module
    this.activeModule = null;
    this.editParam = null;
    this.numericBuffer = '';
    this.pendingAction = null;
    this._pendingPad = null;
    // Sequencer
    this.currentSegment = 0;
    this.currentSong = 0;
    this.segmentLength = 2;
    this.swingAmount = 50;
    this.quantizeIndex = 3;
    this.quantizeGrid = 24;
    this.stepProgramMode = false;
    this.metronomeOn = false;
    this.eraseMode = false;
    this.timeSig = '4/4';
    // Performance
    this.faderMode = 'volume';
    this.multiMode = null;
    this.currentBank = 0;
    this.dynamicButtons = false;
    // Sample
    this.sampleGainIndex = 0;
    this.selectedSamplePad = 0;
    this.smpteIndex = 0;
    // Programming button states
    this.progStates = {};
  }
  _led(id, on) { ... }
  _bindBtn(id, handler) { ... }
  _moduleDisplay(line1, line2) { ... }
  _exitModule() { ... }
}
```

## File Split

| File | Responsibility | Approx Lines |
|------|---------------|-------------|
| `sp1200-state.js` | Shared state, LED/display helpers, exitModule | ~80 |
| `transport.js` | Play/stop/record, tap tempo | ~80 |
| `modules.js` | Module activation (setup/disk/sync/sample switches), handleModuleFunction with all sub-cases, module-specific helpers (_vuPadLabel, _gainLabel, _smpteLabel), _listenSampleDone | ~250 |
| `programming.js` | 9 prog buttons binding, _execProgFunction (all cases), _flashDisplay | ~120 |
| `keypad.js` | Numeric keypad binding, all Yes/No/confirmation sub-flows, _confirmEntry | ~220 |
| `master-control.js` | Tempo/nav-left/nav-right/enter buttons, _handleNav with all cases | ~100 |
| `pad-actions.js` | Pad click routing: select-pad flows, erase, tap-repeat, module exit on pad | ~100 |
| `banks.js` | Bank cycling button, LED management | ~25 |
| `mode-button.js` | Mode button (Mix/Tune toggle) | ~25 |

## Initialization (main.js)

```javascript
const state = new SP1200State(engine, display);
bindTransport(state);
bindModules(state);
bindProgramming(state);
bindKeypad(state);
bindMasterControl(state);
bindPadActions(state);
bindBanks(state);
bindModeButton(state);
```

Each module exports a single `bind*(state)` function.

## Rules
- No behavior changes — every interaction must work exactly as before
- State is the only shared dependency — modules don't import each other
- Each module reads/writes state directly (no getters/setters overhead)
- Existing tests must still pass
