# SP-1200 Missing Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all remaining SP-1200 emulator functions to achieve full feature parity with the original hardware.

**Architecture:** 14 features grouped into 10 tasks by subsystem. Each task is self-contained with tests. The processor (AudioWorklet) and UI communicate via message passing. State lives in `SP1200State` (UI) and `SP1200Processor` (audio thread). Storage uses IndexedDB with a project-folder abstraction layer.

**Tech Stack:** Vanilla JS, Vite, Web Audio API (AudioWorklet), IndexedDB, vitest

---

### Task 1: Truncate — 6-Fader Coarse/Fine Editing (Setup 19)

**Files:**
- Modify: `js/ui/faders.js` — add `'truncate'` mode
- Modify: `js/ui/modules.js` — truncate flow after pad select
- Modify: `js/ui/keypad.js` — truncate-confirm Y/N and Enter to accept
- Modify: `js/ui/master-control.js` — Enter key for truncate-confirm
- Modify: `js/audio/setup-handler.js` — `_truncate()` permanent truncation with memory reclaim
- Modify: `js/main.js` — fader-update handler for truncate mode display
- Test: `tests/audio/setup-handler.test.js` — truncate tests

The real SP-1200 truncate: select pad → display shows `S=00000` (start), `E=65090` (end), `L=NONE` (loop). Faders 1-2 = start coarse/fine, 3-4 = end coarse/fine, 5-6 = loop coarse/fine. Press Enter → "Make Truncation Permanent? Y/N". Yes = delete excess audio, reclaim memory.

- [ ] **Step 1: Write truncate tests**

In `tests/audio/setup-handler.test.js`, add:

```javascript
// ── truncate ──────────────────────────────────────────────────────────

it('truncate-permanent slices sample buffer and updates slot', () => {
  const sample = new Float32Array(1000);
  for (let i = 0; i < 1000; i++) sample[i] = i / 1000;
  proc.sampleSlots[0].sample = sample;
  proc.sampleSlots[0].startPoint = 0;
  proc.sampleSlots[0].endPoint = 999;
  proc.voices[0].sample = sample;

  handler.handle({ type: 'truncate-permanent', pad: 0, bank: 0, start: 100, end: 500 });

  expect(proc.sampleSlots[0].sample.length).toBe(401);
  expect(proc.sampleSlots[0].startPoint).toBe(0);
  expect(proc.sampleSlots[0].endPoint).toBe(400);
  expect(proc.voices[0].sample.length).toBe(401);
});

it('truncate-permanent with loop point preserves relative loop', () => {
  const sample = new Float32Array(1000);
  proc.sampleSlots[0].sample = sample;
  proc.sampleSlots[0].loopEnabled = true;
  proc.sampleSlots[0].loopStart = 200;
  proc.sampleSlots[0].loopEnd = 400;

  handler.handle({ type: 'truncate-permanent', pad: 0, bank: 0, start: 100, end: 500 });

  // Loop points should be relative to new buffer: 200-100=100, 400-100=300
  expect(proc.sampleSlots[0].loopStart).toBe(100);
  expect(proc.sampleSlots[0].loopEnd).toBe(300);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/audio/setup-handler.test.js`
Expected: FAIL — `truncate-permanent` not handled

- [ ] **Step 3: Add `truncate-permanent` handler in setup-handler.js**

In `js/audio/setup-handler.js`, add to the `handle()` switch:
```javascript
case 'truncate-permanent': return this._truncatePermanent(msg);
```

Add the method:
```javascript
_truncatePermanent(msg) {
  const p = this.processor;
  const pad = msg.pad;
  const bank = msg.bank ?? p.currentBank;
  const slotIdx = bank * NUM_PADS + pad;
  if (slotIdx < 0 || slotIdx >= TOTAL_PADS) return true;
  const slot = p.sampleSlots[slotIdx];
  if (!slot.sample) return true;

  const start = Math.max(0, Math.min(msg.start, slot.sample.length - 1));
  const end = Math.max(start, Math.min(msg.end, slot.sample.length - 1));
  const newSample = slot.sample.slice(start, end + 1);

  // Adjust loop points relative to new buffer
  if (slot.loopEnabled) {
    slot.loopStart = Math.max(0, slot.loopStart - start);
    slot.loopEnd = Math.min(newSample.length - 1, slot.loopEnd - start);
  }

  slot.sample = newSample;
  slot.startPoint = 0;
  slot.endPoint = newSample.length - 1;
  slot.loopEnd = Math.min(slot.loopEnd, newSample.length - 1);

  // Update voice if in current bank
  if (bank === p.currentBank && pad >= 0 && pad < NUM_PADS) {
    this._loadSlotIntoVoice(pad, slot);
  }

  p.port.postMessage({ type: 'truncated', pad, bank, length: newSample.length });
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/audio/setup-handler.test.js`
Expected: PASS

- [ ] **Step 5: Add truncate fader mode to FadersUI**

In `js/ui/faders.js`, the `_sendValue()` method currently handles volume/pitch/decay. Add truncate mode that dispatches a custom event instead of sending to engine:

```javascript
// In _sendValue(), add before the closing:
} else if (this.mode === 'truncate') {
  document.dispatchEvent(new CustomEvent('truncate-fader', {
    detail: { index, value: val }
  }));
}
```

The faders don't need stored params for truncate — they directly update the truncate state in main.js.

- [ ] **Step 6: Wire truncate UI flow in modules.js**

In `js/ui/modules.js`, after the pad is selected for truncate (the existing `case 'truncate':` in pad-actions.js already sets `s.editParam = 'truncate-edit'`), we need the modules flow to switch faders to truncate mode and show the S=/E=/L= display.

Find the existing truncate setup function in modules.js (setup function 19) and ensure it sets `s.pendingAction = 'truncate'` and `s.editParam = 'select-pad'`. This is already done.

In `js/ui/pad-actions.js`, the `case 'truncate':` handler needs to be enhanced. After pad is selected, it should:
1. Read sample length from the engine/slot
2. Initialize truncate state on `s`
3. Switch faders to truncate mode
4. Show S=/E=/L= display

Update the truncate case in pad-actions.js:
```javascript
case 'truncate':
  s._pendingPad = pad;
  s._pendingBank = s.currentBank;
  s.editParam = 'truncate-edit';
  s.pendingAction = null;
  // Initialize truncate editing state
  s._truncStart = 0;
  s._truncEnd = 65535; // will be updated when engine reports sample length
  s._truncLoop = -1; // -1 = NONE
  s.engine.send({ type: 'query-sample-info', pad, bank: s.currentBank });
  // Switch faders to truncate mode
  s.faderMode = 'truncate';
  document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'truncate' } }));
  s.moduleDisplay(
    'S=' + String(s._truncStart).padStart(5, '0') + '  ' + _padLabel(s, pad),
    'E=' + String(s._truncEnd).padStart(5, '0') + '  L= NONE'
  );
  break;
```

- [ ] **Step 7: Add query-sample-info handler in processor**

In `js/audio/sp1200-processor.js` `_handleMessage()`, add:
```javascript
case 'query-sample-info': {
  const slotIdx = (msg.bank ?? this.currentBank) * NUM_PADS + msg.pad;
  const slot = this.sampleSlots[slotIdx];
  const len = slot?.sample?.length ?? 0;
  this.port.postMessage({
    type: 'sample-info',
    pad: msg.pad,
    bank: msg.bank ?? this.currentBank,
    length: len,
    startPoint: slot?.startPoint ?? 0,
    endPoint: slot?.endPoint ?? (len - 1),
    loopStart: slot?.loopStart ?? 0,
    loopEnd: slot?.loopEnd ?? (len - 1),
    loopEnabled: slot?.loopEnabled ?? false,
  });
  break;
}
```

In `js/main.js`, handle the response in the engine.onMessage callback:
```javascript
case 'sample-info':
  if (state.editParam === 'truncate-edit') {
    state._truncStart = msg.startPoint;
    state._truncEnd = msg.endPoint;
    state._truncLoop = msg.loopEnabled ? msg.loopStart : -1;
    state._truncSampleLen = msg.length;
    const padLabel = ['A','B','C','D'][msg.bank] + (msg.pad + 1);
    const loopStr = state._truncLoop >= 0
      ? String(state._truncLoop).padStart(5, '0')
      : ' NONE';
    display.lock();
    display.setLine1('S=' + String(state._truncStart).padStart(5, '0') + '  ' + padLabel);
    display.setLine2('E=' + String(state._truncEnd).padStart(5, '0') + '  L=' + loopStr);
  }
  break;
```

- [ ] **Step 8: Handle truncate fader events in main.js**

In `js/main.js`, add a listener for `truncate-fader` events:
```javascript
document.addEventListener('truncate-fader', (e) => {
  if (state.editParam !== 'truncate-edit') return;
  const { index, value } = e.detail;
  const maxLen = state._truncSampleLen || 65535;

  switch (index) {
    case 0: // Start coarse
      state._truncStart = Math.round(value * maxLen);
      break;
    case 1: // Start fine (±500 frames around coarse)
      state._truncStart = Math.max(0, state._truncStart + Math.round((value - 0.5) * 1000));
      break;
    case 2: // End coarse
      state._truncEnd = Math.round(value * maxLen);
      break;
    case 3: // End fine
      state._truncEnd = Math.max(0, state._truncEnd + Math.round((value - 0.5) * 1000));
      break;
    case 4: // Loop coarse
      state._truncLoop = Math.round(value * maxLen);
      break;
    case 5: // Loop fine
      if (state._truncLoop >= 0) {
        state._truncLoop = Math.max(0, state._truncLoop + Math.round((value - 0.5) * 1000));
      }
      break;
  }

  // Clamp
  state._truncStart = Math.max(0, Math.min(state._truncStart, maxLen - 1));
  state._truncEnd = Math.max(state._truncStart, Math.min(state._truncEnd, maxLen - 1));

  // Live preview — send set-param truncate to engine
  engine.setParam('truncate', state._pendingPad, {
    start: state._truncStart,
    end: state._truncEnd,
  });

  // Update display
  const padLabel = ['A','B','C','D'][state._pendingBank || 0] + ((state._pendingPad || 0) + 1);
  const loopStr = state._truncLoop >= 0
    ? String(state._truncLoop).padStart(5, '0')
    : ' NONE';
  display.setLine1('S=' + String(state._truncStart).padStart(5, '0') + '  ' + padLabel);
  display.setLine2('E=' + String(state._truncEnd).padStart(5, '0') + '  L=' + loopStr);
});
```

- [ ] **Step 9: Handle Enter and Y/N for truncate confirmation**

In `js/ui/keypad.js`, the `truncate-edit` editParam should respond to Enter:
- Find where `truncate-edit` is handled (currently it's a passthrough for arrows only)
- When Enter is pressed in `truncate-edit` state, change to `truncate-confirm` and show "Make Truncation Permanent? Y/N"

In `js/ui/master-control.js`, add Enter handling for `truncate-edit`:
```javascript
case 'truncate-edit':
  s.editParam = 'truncate-confirm';
  s.moduleDisplay('Make Truncation', 'Permanent? Y/N');
  break;
```

In `js/ui/keypad.js`, the existing `truncate-confirm` handler should send the truncate-permanent message:
```javascript
if (s.editParam === 'truncate-confirm') {
  if (key === '9') {
    s.engine.send({
      type: 'truncate-permanent',
      pad: s._pendingPad,
      bank: s._pendingBank ?? s.currentBank,
      start: s._truncStart,
      end: s._truncEnd,
    });
    // Also set loop if enabled
    if (s._truncLoop >= 0) {
      s.engine.send({
        type: 'set-param', param: 'loop', pad: s._pendingPad,
        value: true,
      });
    }
    s.display.flash('Truncated', 'Copied');
  } else if (key === '7') {
    s.display.flash('Cancelled', '');
  }
  // Restore fader mode
  s.faderMode = 'volume';
  document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'volume' } }));
  s._pendingPad = null;
  s._pendingBank = null;
  s.editParam = 'module-func';
  return;
}
```

- [ ] **Step 10: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add js/ui/faders.js js/ui/modules.js js/ui/keypad.js js/ui/master-control.js js/ui/pad-actions.js js/audio/setup-handler.js js/audio/sp1200-processor.js js/main.js tests/audio/setup-handler.test.js
git commit -m "feat: full truncate editing with 6-fader coarse/fine, S=/E=/L= display, permanent truncation"
```

---

### Task 2: Right-Click Pad Loading

**Files:**
- Modify: `js/ui/pads.js` — add contextmenu handler
- Modify: `js/main.js` — wire up right-click file load
- Modify: `js/audio/sample-loader.js` — ensure loadSampleFromFile is accessible

Right-click a pad → opens file picker → audio file is resampled through current gain settings → loaded into that pad in the current bank.

- [ ] **Step 1: Add contextmenu handler to PadsUI**

In `js/ui/pads.js`, add to `_bindMouse()`:
```javascript
el.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const pad = parseInt(el.dataset.pad, 10);
  document.dispatchEvent(new CustomEvent('pad-right-click', { detail: { pad } }));
});
```

- [ ] **Step 2: Wire file picker in main.js**

In `js/main.js`, after init, add:
```javascript
document.addEventListener('pad-right-click', (e) => {
  const pad = e.detail.pad;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = async () => {
    if (!input.files.length) return;
    const file = input.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const processed = await loadSampleFromFile(engine.context, arrayBuffer);
    const bank = state?.currentBank || 0;
    const bankPad = bank * 8 + pad;
    engine.loadSample(bankPad, processed);
    sampleMemory.allocate(bank, processed.length);
    display.setMemory(sampleMemory.getRemainingSeconds(bank));
    const bankName = ['A', 'B', 'C', 'D'][bank];
    display.flash('Loaded', bankName + (pad + 1));
  };
  input.click();
});
```

- [ ] **Step 3: Test manually and run existing tests**

Run: `npx vitest run`
Expected: All tests pass (no new tests needed — this is a UI-only feature)

- [ ] **Step 4: Commit**

```bash
git add js/ui/pads.js js/main.js
git commit -m "feat: right-click pad to load audio file directly"
```

---

### Task 3: Project Folder Save/Load with Scratch Cache

**Files:**
- Modify: `js/storage/indexeddb.js` — add scratch cache and project export/import
- Modify: `js/ui/modules.js` — disk module: connect to project storage
- Modify: `js/main.js` — auto-cache samples on load/record
- Test: `tests/storage/indexeddb.test.js` — cache and project tests

The architecture:
- **Scratch cache** = IndexedDB store `'cache'` — persists across restarts, overridden per-slot on new sample
- **Project save** = IndexedDB store `'disks'` (existing) — full project with all samples + sequences + settings
- When no project folder is set, samples go to cache. On project save, cache is flushed to project.

- [ ] **Step 1: Write cache tests**

In `tests/storage/indexeddb.test.js`, add:
```javascript
describe('Scratch Cache', () => {
  it('cacheSample stores and retrieves a sample by slot', async () => {
    const storage = new SP1200Storage();
    await storage.init();
    const buf = new Float32Array([1, 2, 3, 4]);
    await storage.cacheSample(0, buf, { pitch: 1.0, decay: 1.0 });
    const result = await storage.getCachedSample(0);
    expect(result).not.toBeNull();
    expect(result.buffer.length).toBe(4);
    expect(result.settings.pitch).toBe(1.0);
  });

  it('cacheSample overwrites existing slot', async () => {
    const storage = new SP1200Storage();
    await storage.init();
    await storage.cacheSample(0, new Float32Array([1, 2]), {});
    await storage.cacheSample(0, new Float32Array([3, 4, 5]), {});
    const result = await storage.getCachedSample(0);
    expect(result.buffer.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/storage/indexeddb.test.js`
Expected: FAIL — cacheSample not defined

- [ ] **Step 3: Add cache store to IndexedDB**

In `js/storage/indexeddb.js`, update `init()` to create a `'cache'` store:
```javascript
init() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(this.dbName, 2); // bump version
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('disks')) {
        db.createObjectStore('disks', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'slot' });
      }
    };
    request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
    request.onerror = (e) => reject(e.target.error);
  });
}
```

Add cache methods:
```javascript
async cacheSample(slot, buffer, settings = {}) {
  const data = {
    slot,
    buffer: Array.from(buffer), // serialize Float32Array
    settings,
    timestamp: Date.now(),
  };
  return this._put('cache', data);
}

async getCachedSample(slot) {
  const data = await this._get('cache', slot);
  if (!data) return null;
  return {
    buffer: new Float32Array(data.buffer),
    settings: data.settings,
  };
}

async clearCache() {
  return new Promise((resolve, reject) => {
    const tx = this.db.transaction('cache', 'readwrite');
    tx.objectStore('cache').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/storage/indexeddb.test.js`
Expected: PASS

- [ ] **Step 5: Add auto-caching in main.js**

In `js/main.js`, after each sample load (in `loadFileToSelectedPad` and the mic recording `onstop`), add:
```javascript
// After engine.loadSample(bankPad, processed):
if (storage) {
  storage.cacheSample(bankPad, processed, {
    pitch: 1.0, decay: 1.0, reversed: false,
  });
}
```

- [ ] **Step 6: Add project export with settings**

In `js/storage/indexeddb.js`, enhance `saveAll()` to include per-slot settings:
The existing `saveAll(name, data)` already works. Update `js/ui/modules.js` `executeDiskOp()` to serialize sample slots and settings from the engine. This requires a `query-full-state` message to the processor.

In `js/audio/sp1200-processor.js`, add handler:
```javascript
case 'query-full-state': {
  const slots = this.sampleSlots.map((s, i) => ({
    slot: i,
    hasSample: !!s.sample,
    buffer: s.sample ? Array.from(s.sample) : null,
    pitch: s.pitch,
    decayRate: s.decayRate,
    reversed: s.reversed,
    loopEnabled: s.loopEnabled,
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    startPoint: s.startPoint,
    endPoint: s.endPoint,
  }));
  const patterns = this.patterns.map(p => p.serialize());
  this.port.postMessage({
    type: 'full-state',
    slots,
    patterns,
    bpm: this.clock.bpm,
    swing: this.swingPercent,
  });
  break;
}
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add js/storage/indexeddb.js js/main.js js/audio/sp1200-processor.js tests/storage/indexeddb.test.js
git commit -m "feat: scratch cache persistence and project save with full state"
```

---

### Task 4: Sub Song (Song Mode)

**Files:**
- Modify: `js/ui/programming.js` — add subsong button handler
- Modify: `js/ui/keypad.js` — subsong song number entry
- Modify: `js/audio/sp1200-processor.js` — subsong step in song-chain
- Test: `tests/sequencer/song.test.js` — sub-song tests

Sub Song is already supported in `song.js` (`getNextSegment` handles type `'sub-song'`). What's missing is the UI to insert sub-song steps.

- [ ] **Step 1: Write sub-song insertion test**

In `tests/sequencer/song.test.js`, add:
```javascript
it('sub-song jumps to another song and returns', () => {
  const s = new Song();
  // Song 0: play seg 1, then jump to song 1, then play seg 3
  s.addStep(0, 0, { type: 'segment', value: 1 });
  s.addStep(0, 1, { type: 'sub-song', value: 1 });
  s.addStep(0, 2, { type: 'segment', value: 3 });
  s.addStep(0, 3, { type: 'end' });
  // Song 1: play seg 2, then end
  s.addStep(1, 0, { type: 'segment', value: 2 });
  s.addStep(1, 1, { type: 'end' });

  s.start(0);
  expect(s.getNextSegment()).toEqual({ segment: 1 });
  expect(s.getNextSegment()).toEqual({ segment: 2 }); // from song 1
  expect(s.getNextSegment()).toEqual({ segment: 3 }); // back to song 0
  expect(s.getNextSegment()).toBeNull(); // end
});

it('self-referencing sub-song loops indefinitely', () => {
  const s = new Song();
  s.addStep(0, 0, { type: 'segment', value: 1 });
  s.addStep(0, 1, { type: 'sub-song', value: 0 }); // loop to self
  s.start(0);
  expect(s.getNextSegment()).toEqual({ segment: 1 });
  // Next call should loop back and return segment 1 again
  expect(s.getNextSegment()).toEqual({ segment: 1 });
  expect(s.getNextSegment()).toEqual({ segment: 1 });
});
```

- [ ] **Step 2: Run tests to verify sub-song works in song.js**

Run: `npx vitest run tests/sequencer/song.test.js`
Expected: These should PASS since `song.js` already handles `'sub-song'` type in `getNextSegment()`. If they fail, fix `song.js`.

- [ ] **Step 3: Add subsong button handler in programming.js**

In `js/ui/programming.js`, find the song mode button handlers. There should be a `case 'tabsong':` or similar. Add a new case for the subsong button. The subsong button in the programming section needs to be identified — look for the button layout. Add:

```javascript
case 'subsong':
  if (s.mode === 'song') {
    s.editParam = 'subsong-entry';
    s.numericBuffer = '';
    s.moduleDisplay('Sub Song', 'Song #: __');
  }
  break;
```

- [ ] **Step 4: Add subsong keypad entry in keypad.js**

In `js/ui/keypad.js`, add handler for `subsong-entry`:
```javascript
if (s.editParam === 'subsong-entry') {
  s.numericBuffer += key;
  s.display.setLine2('Song #: ' + s.numericBuffer.padStart(2, '_'));
  if (s.numericBuffer.length >= 2) {
    const songNum = parseInt(s.numericBuffer, 10);
    if (songNum >= 0 && songNum < 100) {
      s.engine.send({
        type: 'song-add-step',
        song: s.currentSong,
        step: 999,
        stepType: 'sub-song',
        value: songNum,
      });
      s.display.flash('Sub Song', 'Song ' + s.numericBuffer);
    }
    s.numericBuffer = '';
    s.editParam = null;
  }
  return;
}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add js/ui/programming.js js/ui/keypad.js tests/sequencer/song.test.js
git commit -m "feat: sub-song insertion in song mode with self-loop support"
```

---

### Task 5: Step Edit — Multi-Pad Display & Erase

**Files:**
- Modify: `js/ui/step-edit.js` — show pad names per step, erase support
- Modify: `js/audio/sp1200-processor.js` — query events at step
- Modify: `js/main.js` — handle step-events response for display

- [ ] **Step 1: Add step query handler in processor**

In `js/audio/sp1200-processor.js` `_handleMessage()`, add:
```javascript
case 'query-step-events': {
  const pattern = this.patterns[this.currentPatternIndex];
  const tick = msg.tick;
  const events = pattern.getEventsAtTick(tick);
  this.port.postMessage({
    type: 'step-events',
    tick,
    events: events.map(e => ({ track: e.track, velocity: e.velocity })),
  });
  break;
}
```

- [ ] **Step 2: Update step-edit.js to query and display pad names**

In `js/ui/step-edit.js`, update `_updateDisplay()` to also query events:
```javascript
_updateDisplay() {
  const tick = this.currentStep * this.quantizeGrid;
  const measure = Math.floor(this.currentStep / this.stepsPerBar) + 1;
  const beatInBar = Math.floor((this.currentStep % this.stepsPerBar) / (this.stepsPerBar / 4)) + 1;
  const sub = (this.currentStep % (this.stepsPerBar / 4)) + 1;
  this.display.lock();
  this.display.setLine1('M:' + String(measure).padStart(2, '0') +
    ' B:' + String(beatInBar).padStart(2, '0') +
    ' S:' + String(sub).padStart(2, '0'));
  // Query events at this tick for line 2
  this.engine.send({ type: 'query-step-events', tick });
}
```

In `js/main.js`, handle the response:
```javascript
case 'step-events':
  if (stepEdit?.active) {
    const banks = ['A','B','C','D'];
    const names = msg.events.slice(0, 4).map(e => {
      const bank = banks[Math.floor(e.track / 8)] || 'A';
      const pad = (e.track % 8) + 1;
      return bank + pad;
    });
    display.setLine2(names.join(' ') || state.quantizeLabel || '');
  }
  break;
```

- [ ] **Step 3: Add erase in step edit mode**

In `js/ui/step-edit.js`, add erase support. When `state.eraseMode` is true and a pad is clicked, remove the event instead of adding:

Update the pad click handler in step-edit.js:
```javascript
// In the pad mousedown handler inside step-edit:
const tick = this.currentStep * this.quantizeGrid;
if (this.state?.eraseMode) {
  this.engine.send({
    type: 'step-edit',
    pattern: undefined, // current pattern
    track: pad,
    tick: tick,
    remove: true,
  });
} else {
  this.engine.send({
    type: 'step-edit',
    track: pad,
    tick: tick,
    velocity: 100,
  });
}
this._updateDisplay(); // refresh to show change
```

The `step-edit` message handler in the processor already supports `msg.remove` (see existing code in sp1200-processor.js).

- [ ] **Step 4: Give step-edit access to state**

In `js/main.js`, after creating stepEdit, set:
```javascript
stepEdit.state = state;
```

And in `js/ui/step-edit.js`, add `this.state = null;` to the constructor.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add js/ui/step-edit.js js/audio/sp1200-processor.js js/main.js
git commit -m "feat: step edit multi-pad display and erase support"
```

---

### Task 6: VU Peak Hold

**Files:**
- Modify: `js/ui/display.js` — add peak hold to VU meter

- [ ] **Step 1: Add peak hold to showVU()**

In `js/ui/display.js`, update `showVU()`:
```javascript
showVU(level) {
  const n = Math.round(level * 16);
  // Peak hold: track max level, decay slowly
  if (level > (this._vuPeak || 0)) {
    this._vuPeak = level;
    this._vuPeakHold = 30; // hold for 30 frames
  }
  if (this._vuPeakHold > 0) {
    this._vuPeakHold--;
  } else if (this._vuPeak > 0) {
    this._vuPeak = Math.max(0, this._vuPeak - 0.02); // decay
  }
  const peakPos = Math.round((this._vuPeak || 0) * 15); // 0-15 index
  let bar = '\u2588'.repeat(n) + '\u2591'.repeat(16 - n);
  // Place peak hold marker
  if (this._vuPeak > 0 && peakPos >= n) {
    bar = bar.substring(0, peakPos) + '\u2586' + bar.substring(peakPos + 1);
  }
  this.setLine2(bar);
}
```

Uses `▆` (U+2586, lower three quarters block) as the peak marker to distinguish from the solid bars.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add js/ui/display.js
git commit -m "feat: VU meter peak hold indicator"
```

---

### Task 7: Gradual Tempo Change (Accel/Ritard)

**Files:**
- Modify: `js/audio/sp1200-processor.js` — gradual tempo ramp in _processTick
- Modify: `js/sequencer/song.js` — store tempo change duration in step
- Test: `tests/sequencer/song.test.js` — tempo change with duration

The tempo-change step currently stores just a BPM value. We need to also store `beats` (duration of the ramp) and `direction` (accel/ritard). The processor then ramps BPM over that many beats.

- [ ] **Step 1: Write gradual tempo change test**

In `tests/sequencer/song.test.js`, add:
```javascript
it('tempo-change step includes direction and beats', () => {
  const s = new Song();
  s.addStep(0, 0, { type: 'tempo-change', value: { amount: 10, beats: 8, direction: 'accel' } });
  s.start(0);
  const result = s.getNextSegment();
  expect(result.tempoChange.amount).toBe(10);
  expect(result.tempoChange.beats).toBe(8);
  expect(result.tempoChange.direction).toBe('accel');
});
```

- [ ] **Step 2: Run test — should PASS since song.js passes value through**

Run: `npx vitest run tests/sequencer/song.test.js`
Expected: PASS (the value is an object, song.js doesn't transform it)

- [ ] **Step 3: Add gradual tempo ramp to processor**

In `js/audio/sp1200-processor.js`, add state for tempo ramping:
```javascript
// In constructor:
this._tempoRamp = null; // { targetBpm, bpmPerTick, ticksRemaining }
```

In `_processTick()`, where `tempoChange` is handled, update:
```javascript
if (next.tempoChange) {
  const tc = next.tempoChange;
  if (typeof tc === 'number') {
    this.clock.setBpm(tc);
  } else if (tc.beats && tc.beats > 0) {
    const totalTicks = tc.beats * PPQN;
    const currentBpm = this.clock.bpm;
    const delta = tc.direction === 'accel' ? tc.amount : -tc.amount;
    this._tempoRamp = {
      targetBpm: currentBpm + delta,
      bpmPerTick: delta / totalTicks,
      ticksRemaining: totalTicks,
    };
  } else {
    const delta = tc.direction === 'accel' ? (tc.amount || tc) : -(tc.amount || tc);
    this.clock.setBpm(this.clock.bpm + delta);
  }
}
```

At the top of `_processTick()`, apply ramp:
```javascript
// Apply gradual tempo ramp
if (this._tempoRamp) {
  this.clock.setBpm(this.clock.bpm + this._tempoRamp.bpmPerTick);
  this._tempoRamp.ticksRemaining--;
  if (this._tempoRamp.ticksRemaining <= 0) {
    this.clock.setBpm(this._tempoRamp.targetBpm); // snap to exact
    this._tempoRamp = null;
  }
}
```

- [ ] **Step 4: Update programming.js UI for accel/ritard entry**

In `js/ui/programming.js`, update the `tempo-change` handler to prompt for direction and values:
```javascript
case 'tempo-change':
  if (s.mode === 'song' && s.playing) {
    // Already handled elsewhere for live BPM changes
  } else if (s.mode === 'song') {
    s.editParam = 'tempo-change-dir';
    s.numericBuffer = '';
    s.moduleDisplay('Tempo Change', '1=Accel 2=Ritard');
  }
  break;
```

In `js/ui/keypad.js`, add the multi-step tempo change flow:
```javascript
if (s.editParam === 'tempo-change-dir') {
  if (key === '1' || key === '2') {
    s._tempoDir = key === '1' ? 'accel' : 'ritard';
    s.editParam = 'tempo-change-amount';
    s.numericBuffer = '';
    s.moduleDisplay('Change: __ BPM', 'Over: __ Beats');
  }
  return;
}

if (s.editParam === 'tempo-change-amount') {
  s.numericBuffer += key;
  s.display.setLine1('Change: ' + s.numericBuffer.padStart(2, '_') + ' BPM');
  if (s.numericBuffer.length >= 2) {
    s._tempoAmount = parseInt(s.numericBuffer, 10);
    s.editParam = 'tempo-change-beats';
    s.numericBuffer = '';
  }
  return;
}

if (s.editParam === 'tempo-change-beats') {
  s.numericBuffer += key;
  s.display.setLine2('Over: ' + s.numericBuffer.padStart(2, '_') + ' Beats');
  if (s.numericBuffer.length >= 2) {
    const beats = parseInt(s.numericBuffer, 10);
    s.engine.send({
      type: 'song-add-step',
      song: s.currentSong,
      step: 999,
      stepType: 'tempo-change',
      value: { amount: s._tempoAmount, beats, direction: s._tempoDir },
    });
    s.display.flash('Tempo ' + (s._tempoDir === 'accel' ? '+' : '-') + s._tempoAmount,
      'Over ' + beats + ' beats');
    s.numericBuffer = '';
    s.editParam = null;
  }
  return;
}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add js/audio/sp1200-processor.js js/ui/programming.js js/ui/keypad.js tests/sequencer/song.test.js
git commit -m "feat: gradual tempo change (accelerando/ritardando) over N beats"
```

---

### Task 8: Dynamic Allocation, Copy-to-Self, Memory Remaining

**Files:**
- Modify: `js/audio/sp1200-processor.js` — voice stealing for dynamic allocation
- Modify: `js/sequencer/pattern.js` — copy-to-self append
- Modify: `js/audio/setup-handler.js` — copy-segment self-append
- Modify: `js/ui/modules.js` — memory remaining seq %
- Test: `tests/audio/setup-handler.test.js` — copy-segment-self test
- Test: `tests/sequencer/pattern.test.js` — pattern append test

- [ ] **Step 1: Write copy-to-self test**

In `tests/audio/setup-handler.test.js`, add:
```javascript
it('copy-segment to itself doubles the pattern length', () => {
  proc.patterns[0].setBars(2);
  proc.patterns[0].addEvent(0, new PatternEvent(0, 100));
  proc.patterns[0].addEvent(1, new PatternEvent(48, 80));

  handler.handle({ type: 'copy-segment', from: 0, to: 0 });

  expect(proc.patterns[0].bars).toBe(4);
  // Original events at tick 0 and 48 should still exist
  expect(proc.patterns[0].tracks[0].events.length).toBe(2);
  expect(proc.patterns[0].tracks[1].events.length).toBe(2);
  // Appended events should be offset by original totalTicks (2 bars * 384)
  const origTicks = 2 * 96 * 4; // 768
  expect(proc.patterns[0].tracks[0].events[1].tick).toBe(origTicks);
  expect(proc.patterns[0].tracks[1].events[1].tick).toBe(48 + origTicks);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/setup-handler.test.js`
Expected: FAIL

- [ ] **Step 3: Implement self-copy append in setup-handler.js**

In `js/audio/setup-handler.js`, update `_copySegment()`:
```javascript
_copySegment(msg) {
  const p = this.processor;
  const from = msg.from;
  const to = msg.to;
  if (from < 0 || from >= p.patterns.length || to < 0 || to >= p.patterns.length) return true;

  if (from === to) {
    // Self-copy: append (double the pattern)
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
    p.port.postMessage({ type: 'segment-copied', from, to });
  } else {
    // Normal copy
    const src = p.patterns[from].serialize();
    p.patterns[to] = Pattern.deserialize(src);
    p.port.postMessage({ type: 'segment-copied', from, to });
  }
  return true;
}
```

Make sure to import `Pattern` and `PatternEvent` at top of setup-handler.js (PatternEvent is already imported).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/audio/setup-handler.test.js`
Expected: PASS

- [ ] **Step 5: Add dynamic allocation to processor**

In `js/audio/sp1200-processor.js`, in the `_triggerVoice()` method, add voice stealing when `dynamicAlloc` is enabled:

```javascript
// After voice.trigger(velocity):
// Dynamic allocation: if this voice is already active with a long-playing sample,
// let it continue on a free voice channel
if (this.dynamicAlloc && voice.active) {
  // Find a free voice to continue the old sound
  for (let i = 0; i < NUM_PADS; i++) {
    if (i !== pad && !this.voices[i].active) {
      // Copy the old voice state to the free voice
      this.voices[i].sample = voice.sample;
      this.voices[i].position = voice.position;
      this.voices[i].velocity = voice.velocity;
      this.voices[i].decayLevel = voice.decayLevel;
      this.voices[i].decayRate = voice.decayRate;
      this.voices[i].pitch = voice.pitch;
      this.voices[i].reversed = voice.reversed;
      this.voices[i].active = true;
      break;
    }
  }
}
```

Add `this.dynamicAlloc = false;` to the constructor, and in the existing dynamic-alloc-confirm handler, set it.

- [ ] **Step 6: Add sequence memory % to memory remaining display**

In `js/ui/modules.js`, in the special function 13 (memory remaining), update to show both:
```javascript
case 13: {
  const secs = s.sampleMemory?.getRemainingSeconds(s.currentBank) ?? '??';
  // Estimate sequence memory: 99 patterns × bars × events
  s.moduleDisplay('Memory: ' + secs + 's', 'Seq: available');
  break;
}
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add js/audio/sp1200-processor.js js/audio/setup-handler.js js/ui/modules.js tests/audio/setup-handler.test.js
git commit -m "feat: dynamic allocation, copy-to-self segment append, memory remaining"
```

---

### Task 9: Name Sound (Special 21) & Create Folder (Disk 27)

**Files:**
- Modify: `js/audio/sp1200-processor.js` — store sample names per slot
- Modify: `js/ui/modules.js` — special function 21, disk function 27
- Modify: `js/ui/keypad.js` — name entry flow

- [ ] **Step 1: Add sample names to processor**

In `js/audio/sp1200-processor.js`, add `name: ''` to each sampleSlot in the constructor:
```javascript
this.sampleSlots = Array.from({ length: TOTAL_PADS }, () => ({
  sample: null, name: '',
  pitch: BASE_PITCH_STEP, decayRate: 1.0, reversed: false,
  loopEnabled: false, loopStart: 0, loopEnd: 0,
  startPoint: 0, endPoint: 0,
}));
```

Add handler:
```javascript
case 'set-sample-name': {
  const slotIdx = (msg.bank ?? this.currentBank) * NUM_PADS + msg.pad;
  if (slotIdx >= 0 && slotIdx < TOTAL_PADS) {
    this.sampleSlots[slotIdx].name = msg.name || '';
  }
  break;
}
```

- [ ] **Step 2: Add special function 21 UI flow**

In `js/ui/modules.js`, in `handleSpecialFunction()`, add:
```javascript
case 21:
  s.editParam = 'select-pad';
  s.pendingAction = 'name-sound';
  s.moduleDisplay('Name Sound', 'Select Pad');
  break;
```

In `js/ui/pad-actions.js`, add case for `name-sound`:
```javascript
case 'name-sound':
  s._pendingPad = pad;
  s._pendingBank = s.currentBank;
  s.editParam = 'name-sound-edit';
  s.pendingAction = null;
  s.diskNameBuffer = '';
  s.diskNameCursor = 0;
  s.moduleDisplay('Name ' + _padLabel(s, pad), '________________');
  break;
```

The name editing uses the same slider-based character entry as disk save (editParam `disk-name`). Reuse the existing mechanism — the keypad and fader handling for `disk-name` already works. Just set `s.editParam = 'disk-name'` and on Enter, send the name to the engine instead of saving to disk.

Actually, better: use a new editParam `name-sound-edit` that works identically to `disk-name` but on Enter sends `set-sample-name`.

In `js/ui/master-control.js`, add Enter handling for `name-sound-edit`:
```javascript
case 'name-sound-edit':
  s.engine.send({
    type: 'set-sample-name',
    pad: s._pendingPad,
    bank: s._pendingBank ?? s.currentBank,
    name: s.diskNameBuffer.trim(),
  });
  s.display.flash('Named', s.diskNameBuffer.trim());
  s._pendingPad = null;
  s.editParam = 'module-func';
  break;
```

- [ ] **Step 3: Add disk function 27 (Create Folder)**

In `js/ui/modules.js`, in the disk function handler, add:
```javascript
case 27:
  s.editParam = 'create-folder';
  s.diskNameBuffer = '';
  s.diskNameCursor = 0;
  s.moduleDisplay('Create Folder', '________________');
  break;
```

In `js/ui/master-control.js`, add Enter handling for `create-folder`:
```javascript
case 'create-folder':
  // In IndexedDB-based storage, folders are just name prefixes
  s.display.flash('Folder Created', s.diskNameBuffer.trim() + '/');
  s.editParam = 'module-func';
  break;
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add js/audio/sp1200-processor.js js/ui/modules.js js/ui/pad-actions.js js/ui/master-control.js js/ui/keypad.js
git commit -m "feat: name sound (special 21) and create folder (disk 27)"
```

---

### Task 10: Web MIDI Support

**Files:**
- Create: `js/midi/midi-input.js` — Web MIDI API input handler
- Modify: `js/main.js` — initialize MIDI, route note-on to pads
- Modify: `js/audio/engine-node.js` — no changes needed (uses existing trigger)

- [ ] **Step 1: Create MIDI input handler**

Create `js/midi/midi-input.js`:
```javascript
export class MIDIInput {
  constructor(engine) {
    this.engine = engine;
    this.state = null; // set after SP1200State created
    this.midiAccess = null;
    this.channel = 0; // 0-15, 0 = omni
    this.mode = 'omni'; // 'omni' | 'poly'
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI not supported');
      return false;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.inputs.forEach(input => {
        input.onmidimessage = (e) => this._onMessage(e);
      });
      // Listen for new devices
      this.midiAccess.onstatechange = () => {
        this.midiAccess.inputs.forEach(input => {
          input.onmidimessage = (e) => this._onMessage(e);
        });
      };
      console.log('Web MIDI initialized');
      return true;
    } catch (err) {
      console.warn('Web MIDI access denied:', err);
      return false;
    }
  }

  _onMessage(event) {
    const [status, note, velocity] = event.data;
    const msgType = status & 0xF0;
    const msgChannel = status & 0x0F;

    // Channel filter (omni = accept all)
    if (this.mode !== 'omni' && msgChannel !== this.channel) return;

    if (msgType === 0x90 && velocity > 0) {
      // Note On — map MIDI notes 36-43 to pads 0-7 (GM drum map)
      const pad = note - 36;
      if (pad >= 0 && pad < 8) {
        const bank = this.state?.currentBank || 0;
        this.engine.trigger(pad, velocity, bank);
      }
    } else if (msgType === 0x80 || (msgType === 0x90 && velocity === 0)) {
      // Note Off — no action needed for one-shot samples
    }
  }

  setChannel(ch) { this.channel = Math.max(0, Math.min(15, ch)); }
  setMode(mode) { this.mode = mode; }
}
```

- [ ] **Step 2: Initialize MIDI in main.js**

In `js/main.js`, add import and init:
```javascript
import { MIDIInput } from './midi/midi-input.js';
```

In `init()`:
```javascript
const midi = new MIDIInput(engine);
midi.state = state;
midi.init(); // async, non-blocking
```

Wire MIDI channel/mode from sync module — in the engine.onMessage handler:
```javascript
case 'midi-channel-set':
  if (midi) midi.setChannel(msg.channel - 1); // UI is 1-based
  break;
case 'midi-mode-set':
  if (midi) midi.setMode(msg.mode);
  break;
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All pass (MIDI is optional, no test failures if Web MIDI unavailable)

- [ ] **Step 4: Commit**

```bash
git add js/midi/midi-input.js js/main.js
git commit -m "feat: Web MIDI input support for external controllers"
```

---

## Verification

After all tasks are complete:

- [ ] Run full test suite: `npx vitest run` — all must pass
- [ ] Start dev server: `npx vite` — no errors
- [ ] Manual smoke test: load samples, record, playback, truncate, right-click load, save/load project, sub-song, step edit with erase, VU peak hold, gradual tempo change
