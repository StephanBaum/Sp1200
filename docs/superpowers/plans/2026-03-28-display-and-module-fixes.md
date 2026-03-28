# SP-1200 Display & Module Accuracy Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all display messages and module interaction flows match the real SP-1200 hardware behavior as documented in `sp1200_functions.md`.

**Architecture:** All changes are in the UI layer (`js/ui/display.js`, `js/ui/transport.js`, `js/ui/step-edit.js`). The audio engine (`js/audio/engine-node.js`) uses a message-passing interface — UI sends `{ type, ... }` objects via `engine.send()`. No engine/DSP changes needed. No new files.

**Tech Stack:** Vanilla JS, DOM, Web Audio API message passing. Tests: Vitest (but UI modules have no tests — verify visually in browser).

---

### Task 1: Fix Display Format — BPM Integer, Segment/Song Format

**Files:**
- Modify: `js/ui/display.js:47-64` (`_refresh` method)
- Modify: `js/ui/display.js:23` (`setBpm`)

**Context:** The real SP-1200 displays BPM as an integer (e.g., `120` not `120.0`). Segment screen shows `Seg 01  120` with a space (no colon). Song mode should track and display the current song number, not hardcode `Song:01`.

- [ ] **Step 1: Fix `_refresh()` in display.js**

Change the `_refresh` method to use integer BPM and correct formatting:

```javascript
_refresh() {
  const seg = String(this.pattern + 1).padStart(2, '0');
  const bpm = String(Math.round(this.bpm)).padStart(3, ' ');

  if (this.mode === 'segment' || this.mode === 'pattern') {
    this.setLine1('Seg ' + seg + '    ' + bpm);
    this.setLine2(' ');
  } else if (this.mode === 'song') {
    const song = String(this.song + 1).padStart(2, '0');
    this.setLine1('Song ' + song + '   ' + bpm);
    this.setLine2(' ');
  } else if (this.mode === 'step') {
    this.setLine1('StepPgm     ' + bpm);
    this.setLine2(' ');
  } else {
    this.setLine1(this.mode);
  }
}
```

- [ ] **Step 2: Add `song` state property to DisplayUI constructor**

In the constructor (around line 8-19), add `this.song = 0;` and a setter:

```javascript
constructor() {
  this.line1El = document.getElementById('lcd-line1');
  this.line2El = document.getElementById('lcd-line2');
  this.bpm = BPM_DEFAULT;
  this.pattern = 0;
  this.song = 0;
  this.bank = 0;
  this.bar = 0;
  this.mode = 'segment';
  this._flashTimer = null;
  this._knobTimer = null;
  this.locked = false;
  this._refresh();
}
```

Add setter after `setPattern`:

```javascript
setSong(num) { this.song = num; this._refresh(); }
```

- [ ] **Step 3: Fix all BPM flash messages in transport.js to use integer**

Search transport.js for every `'Tempo: ' + this.bpm` and ensure it shows integer:

In `_execProgFunction` tempo-change case (line ~416):
```javascript
this.display.flash('Tempo ' + Math.round(this.bpm), 'Use +/- or keys');
```

In `_confirmEntry` bpm case (line ~504):
```javascript
this.display.flash('Tempo ' + Math.round(this.bpm), 'BPM set');
```

In `_handleNav` bpm case (line ~601):
```javascript
this.display.flash('Tempo ' + Math.round(this.bpm), 'BPM');
```

In `_bindNumericKeypad` bpm entry (line ~664):
```javascript
this.display.flash('Tempo ' + this.numericBuffer, 'Enter to confirm');
```

- [ ] **Step 4: Verify in browser**

Run `pnpm dev`, open browser. Check:
- Default screen shows `Seg 01      90` (integer, no colon, space-separated)
- Tap tempo shows integer BPM
- All tempo flashes show integer

- [ ] **Step 5: Commit**

```bash
git add js/ui/display.js js/ui/transport.js
git commit -m "fix: display format - integer BPM, correct Seg/Song format per hardware"
```

---

### Task 2: Fix Module Display Persistence — Use Lock Instead of Flash

**Files:**
- Modify: `js/ui/transport.js:175-281` (`_handleModuleFunction`)
- Modify: `js/ui/transport.js:720-770` (`_bindPadActions`)

**Context:** On real hardware, when you enter a module function (e.g., Setup 11 Multi-Pitch), the display stays on that screen until you complete the action or exit. Currently `flash()` auto-reverts after 1.2s. Module functions that wait for user input should use `display.lock()` + `setLine1/setLine2` to persist, then `display.unlock()` when done.

The rule: if a function sets `editParam` or `pendingAction` (i.e., waits for further input), its display must persist. If it's a one-shot action (like toggling metronome), flash is correct.

- [ ] **Step 1: Add a helper `_moduleDisplay(line1, line2)` to TransportUI**

Add after the `_exitModule` method (around line 173):

```javascript
_moduleDisplay(line1, line2) {
  this.display.lock();
  this.display.setLine1(line1);
  this.display.setLine2(line2 || '');
}
```

- [ ] **Step 2: Update Setup module functions to use persistent display**

In `_handleModuleFunction`, replace `flash` with `_moduleDisplay` for functions that wait for input:

```javascript
if (mod === 'setup') {
  switch (funcNum) {
    case 11:
      this.editParam = 'select-pad';
      this.pendingAction = 'multi-pitch';
      this._moduleDisplay('Multi Pitch', 'Select a pad');
      break;
    case 12:
      this.editParam = 'select-pad';
      this.pendingAction = 'multi-level';
      this._moduleDisplay('Multi Level', 'Select a pad');
      break;
    case 13:
      this.engine.send({ type: 'exit-multi' });
      this.display.flash('Exit Multi', 'Done');
      break;
    case 14:
      this.editParam = 'dynamic-confirm';
      this._moduleDisplay('Dynamic Btns', 'Yes=9 No=7');
      break;
    case 15:
      this.editParam = 'define-mix';
      this.numericBuffer = '';
      this._moduleDisplay('Define Mix', 'Enter slot 1-8');
      break;
    case 16:
      this.editParam = 'select-mix';
      this.numericBuffer = '';
      this._moduleDisplay('Select Mix', 'Enter slot 1-8');
      break;
    case 17:
      this.editParam = 'select-pad';
      this.pendingAction = 'channel-assign';
      this._moduleDisplay('Channel Assign', 'Select a pad');
      break;
    case 18:
      this.editParam = 'select-pad';
      this.pendingAction = 'decay-tune';
      this._moduleDisplay('Decay/Tune Sel', 'Select a pad');
      break;
    case 19:
      this.editParam = 'select-pad';
      this.pendingAction = 'truncate';
      this._moduleDisplay('Loop/Truncate', 'Select a pad');
      break;
    case 20:
      this.editParam = 'select-pad';
      this.pendingAction = 'delete-sound';
      this._moduleDisplay('Delete Sound', 'Select a pad');
      break;
    case 22:
      this.editParam = 'dynamic-alloc-confirm';
      this._moduleDisplay('Dyn Alloc', 'Yes=9 No=7');
      break;
    case 23:
      this.editParam = 'special-menu';
      this.numericBuffer = '';
      this._moduleDisplay('Special Menu', 'Enter function #');
      break;
    case 25:
      this.editParam = 'select-pad';
      this.pendingAction = 'reverse-sound';
      this._moduleDisplay('Reverse Sound', 'Select a pad');
      break;
    default:
      this.display.flash('Setup ' + funcNum, 'Not available');
  }
}
```

- [ ] **Step 3: Update Sample module functions for persistent display**

```javascript
else if (mod === 'sample') {
  switch (funcNum) {
    case 1:
      this.editParam = null;
      this._moduleDisplay('VU Mode', this._vuPadLabel());
      break;
    case 2:
      this.editParam = 'select-pad';
      this.pendingAction = 'assign-voice';
      this._moduleDisplay('Assign Voice', 'Select a pad');
      break;
    case 3:
      this.editParam = 'sample-level';
      this.sampleGainIndex = this.sampleGainIndex || 0;
      this._moduleDisplay('Input Level', this._gainLabel());
      break;
    case 4:
      this.editParam = 'threshold';
      this._moduleDisplay('Arm Threshold', 'Use Slider #1');
      break;
    case 5:
      this.editParam = 'sample-length';
      this._moduleDisplay('Sample Length', '2.5s Slider #1');
      break;
    case 6:
      this.display.flash('Resample', 'Last pad');
      break;
    case 7:
      this._moduleDisplay('Sample Armed', 'Waiting...');
      break;
    case 9:
      this.display.flash('Sampling...', 'Force start');
      break;
    default:
      this.display.flash('Sample ' + funcNum, 'Not available');
  }
}
```

- [ ] **Step 4: Add helper methods for Sample module display**

Add these near the other helpers in TransportUI:

```javascript
_vuPadLabel() {
  const bank = ['A', 'B', 'C', 'D'][this.currentBank];
  const pad = (this.selectedSamplePad || 0) + 1;
  const gains = ['0dB', '+20dB', '+40dB'];
  const gain = gains[this.sampleGainIndex || 0];
  return bank + pad + '     ' + gain;
}

_gainLabel() {
  const gains = ['0dB', '+20dB', '+40dB'];
  return 'Gain: ' + gains[this.sampleGainIndex || 0];
}
```

Initialize `this.sampleGainIndex = 0;` and `this.selectedSamplePad = 0;` in the constructor (after line 26).

- [ ] **Step 5: Update Sync module for persistent display**

```javascript
else if (mod === 'sync') {
  switch (funcNum) {
    case 1:
      this.engine.send({ type: 'set-sync', mode: 1 });
      this._moduleDisplay('Select', 'Internal');
      break;
    case 2:
      this.engine.send({ type: 'set-sync', mode: 2 });
      this._moduleDisplay('Select', 'MIDI');
      break;
    case 3:
      this.editParam = 'smpte-rate';
      this.smpteIndex = this.smpteIndex || 0;
      this._moduleDisplay('SMPTE Format is', this._smpteLabel());
      break;
    case 4:
      this.editParam = 'click-divisor';
      this.numericBuffer = '';
      this._moduleDisplay('Click Divisor', 'Enter value');
      break;
    default:
      this.display.flash('Sync ' + funcNum, 'Not available');
  }
}
```

Add SMPTE helper and state. Initialize `this.smpteIndex = 0;` in constructor:

```javascript
_smpteLabel() {
  const rates = ['24fps', '25fps', '30fps', '30-drop'];
  return rates[this.smpteIndex || 0];
}
```

- [ ] **Step 6: Ensure `_exitModule` unlocks display properly**

The existing `_exitModule` already calls `display.unlock()` — verify it also clears `pendingAction` and `editParam`. It does (line 169-170). Good.

- [ ] **Step 7: Verify in browser**

- Enter Setup mode (F1), press 11 → display should stay on "Multi Pitch / Select a pad" until you tap a pad or exit
- Enter Sample mode (F4), press 3 → display should stay on "Input Level / Gain: 0dB"
- Enter Sync mode (F3), press 1 → display should show "Select / Internal" persistently

- [ ] **Step 8: Commit**

```bash
git add js/ui/transport.js
git commit -m "fix: module displays persist until action completes, match hardware behavior"
```

---

### Task 3: Fix Setup Functions 14, 17, 18, 22, 25 — Correct Interaction Flows

**Files:**
- Modify: `js/ui/transport.js:641-681` (`_bindNumericKeypad`)
- Modify: `js/ui/transport.js:720-770` (`_bindPadActions`)

**Context:** Several Setup functions have wrong interaction flows:
- **14 (Dynamic Btns):** Should prompt Yes(9)/No(7), not auto-toggle
- **17 (Channel Assign):** After pad selection, should prompt for channel 1-6, then Enter
- **18 (Decay/Tune):** After pad selection, should prompt for 1(Tune)/2(Decay) on keypad
- **22 (Dynamic Alloc):** Missing entirely, should prompt Yes/No
- **25 (Reverse Sound):** Missing entirely, should select pad then confirm Yes

- [ ] **Step 1: Add Yes/No and sub-flow handling to `_bindNumericKeypad`**

In the keypad handler, after the `module-func` routing block and before the normal numeric entry, add handling for the new editParam states. Find the section around line 649:

```javascript
// Yes/No confirmation flows (Key 9 = Yes, Key 7 = No)
if (this.editParam === 'dynamic-confirm') {
  if (key === '9') {
    this.dynamicButtons = true;
    this.engine.send({ type: 'dynamic-buttons', enabled: true });
    this.display.flash('Dynamic Btns', 'On');
  } else if (key === '7') {
    this.dynamicButtons = false;
    this.engine.send({ type: 'dynamic-buttons', enabled: false });
    this.display.flash('Dynamic Btns', 'Off');
  }
  this.editParam = 'module-func';
  this.numericBuffer = '';
  return;
}

if (this.editParam === 'dynamic-alloc-confirm') {
  if (key === '9') {
    this.engine.send({ type: 'dynamic-alloc', enabled: true });
    this.display.flash('Dyn Alloc', 'On');
  } else if (key === '7') {
    this.engine.send({ type: 'dynamic-alloc', enabled: false });
    this.display.flash('Dyn Alloc', 'Off');
  }
  this.editParam = 'module-func';
  this.numericBuffer = '';
  return;
}

if (this.editParam === 'reverse-confirm') {
  if (key === '9') {
    this.engine.send({ type: 'reverse-sound', pad: this._pendingPad });
    this.display.flash('Reversed', 'Pad ' + (this._pendingPad + 1));
  } else if (key === '7') {
    this.display.flash('Cancelled', '');
  }
  this._pendingPad = null;
  this.editParam = 'module-func';
  this.numericBuffer = '';
  return;
}

if (this.editParam === 'decay-tune-select') {
  if (key === '1') {
    this.engine.send({ type: 'set-pad-mode', pad: this._pendingPad, mode: 'tune' });
    this.display.flash('Pad ' + (this._pendingPad + 1), 'Tune');
  } else if (key === '2') {
    this.engine.send({ type: 'set-pad-mode', pad: this._pendingPad, mode: 'decay' });
    this.display.flash('Pad ' + (this._pendingPad + 1), 'Decay');
  }
  this._pendingPad = null;
  this.editParam = 'module-func';
  this.numericBuffer = '';
  return;
}

if (this.editParam === 'channel-assign-num') {
  if (key >= '1' && key <= '6') {
    this.engine.send({ type: 'channel-assign', pad: this._pendingPad, channel: parseInt(key, 10) });
    this._moduleDisplay('Ch ' + key + ' assigned', 'Pad ' + (this._pendingPad + 1));
  }
  // Don't clear yet — wait for Enter to confirm
  this.numericBuffer = key;
  return;
}

if (this.editParam === 'sample-level') {
  // In sample level mode, ignore keypad (use +/- arrows only)
  return;
}

if (this.editParam === 'smpte-rate') {
  // In SMPTE mode, ignore keypad (use +/- arrows only)
  return;
}

if (this.editParam === 'click-divisor') {
  this.numericBuffer += key;
  this._moduleDisplay('Click Divisor', this.numericBuffer);
  return;
}
```

- [ ] **Step 2: Update pad actions for reverse-sound and decay-tune sub-flows**

In `_bindPadActions`, update the switch cases for the new pending actions:

```javascript
case 'reverse-sound':
  this._pendingPad = pad;
  this.editParam = 'reverse-confirm';
  this.pendingAction = null;
  this._moduleDisplay('Reverse ' + ['A','B','C','D'][this.currentBank] + (pad + 1), 'Yes=9 No=7');
  break;
case 'decay-tune':
  this._pendingPad = pad;
  this.editParam = 'decay-tune-select';
  this.pendingAction = null;
  this._moduleDisplay('Pad ' + (pad + 1), '1=Tune 2=Decay');
  break;
case 'channel-assign':
  this._pendingPad = pad;
  this.editParam = 'channel-assign-num';
  this.pendingAction = null;
  this._moduleDisplay('Pad ' + (pad + 1), 'Enter ch 1-6');
  break;
case 'assign-voice':
  this.selectedSamplePad = pad;
  this.display.flash('Sampling', ['A','B','C','D'][this.currentBank] + (pad + 1));
  this.editParam = 'module-func';
  this.pendingAction = null;
  break;
```

- [ ] **Step 3: Handle Enter confirmation for channel-assign and click-divisor**

In `_confirmEntry`, add cases:

```javascript
case 'channel-assign-num':
  if (this.numericBuffer.length > 0) {
    const ch = parseInt(this.numericBuffer, 10);
    if (ch >= 1 && ch <= 6) {
      this.engine.send({ type: 'channel-assign', pad: this._pendingPad, channel: ch });
      this.display.flash('Ch ' + ch, 'Pad ' + (this._pendingPad + 1));
    }
  }
  this._pendingPad = null;
  this.editParam = 'module-func';
  break;

case 'click-divisor':
  if (this.numericBuffer.length > 0) {
    const div = parseInt(this.numericBuffer, 10);
    this.engine.send({ type: 'set-click-divisor', divisor: div });
    this.display.flash('Click Div', div.toString());
  }
  this.editParam = 'module-func';
  break;
```

- [ ] **Step 4: Initialize new state in constructor**

Add to the constructor (after `this.pendingAction = null;`):

```javascript
this._pendingPad = null;
this.sampleGainIndex = 0;
this.selectedSamplePad = 0;
this.smpteIndex = 0;
```

- [ ] **Step 5: Verify in browser**

- Setup 14: should show "Dynamic Btns / Yes=9 No=7", press 9 → "On", press 7 → "Off"
- Setup 17: select pad → "Pad 1 / Enter ch 1-6" → press 3 → Enter → confirms
- Setup 18: select pad → "Pad 1 / 1=Tune 2=Decay" → press 1 or 2
- Setup 22: should show "Dyn Alloc / Yes=9 No=7"
- Setup 25: select pad → "Reverse A1 / Yes=9 No=7" → press 9 to confirm

- [ ] **Step 6: Commit**

```bash
git add js/ui/transport.js
git commit -m "fix: setup functions 14,17,18,22,25 match hardware interaction flows"
```

---

### Task 4: Fix Nav Arrow Handlers for Sample Level and SMPTE

**Files:**
- Modify: `js/ui/transport.js:592-638` (`_handleNav`)

**Context:** Sample Opt 3 (Input Level) and Sync Opt 3 (SMPTE) both expect +/- arrow navigation but have no cases in `_handleNav`. Input Level cycles 0dB/+20dB/+40dB. SMPTE cycles 24/25/30/30-drop fps.

- [ ] **Step 1: Add `sample-level` and `smpte-rate` cases to `_handleNav`**

Add these cases in the switch block, before the `default` case:

```javascript
case 'sample-level': {
  const gains = ['0dB', '+20dB', '+40dB'];
  this.sampleGainIndex = Math.max(0, Math.min(gains.length - 1, (this.sampleGainIndex || 0) + dir));
  this._moduleDisplay('Input Level', 'Gain: ' + gains[this.sampleGainIndex]);
  break;
}
case 'smpte-rate': {
  const rates = ['24fps', '25fps', '30fps', '30-drop'];
  this.smpteIndex = Math.max(0, Math.min(rates.length - 1, (this.smpteIndex || 0) + dir));
  this._moduleDisplay('SMPTE Format is', rates[this.smpteIndex]);
  break;
}
case 'threshold':
case 'sample-length':
  // Controlled by fader/slider, not arrows
  break;
```

- [ ] **Step 2: Verify in browser**

- Enter Sample mode (F4), press 3 → "Input Level / Gain: 0dB"
- Press right arrow → "Gain: +20dB" → again → "Gain: +40dB" → stays at +40dB
- Enter Sync mode (F3), press 3 → "SMPTE Format is / 24fps"
- Press right → "25fps" → "30fps" → "30-drop"

- [ ] **Step 3: Commit**

```bash
git add js/ui/transport.js
git commit -m "fix: arrow nav works for sample input level and SMPTE rate selection"
```

---

### Task 5: Fix Step Program Display Format

**Files:**
- Modify: `js/ui/step-edit.js` (`_updateDisplay` method)

**Context:** The real SP-1200 step program display shows `M:01 B:01 S:01` (Measure, Beat, Sub-beat). Current code shows `MS:01 BT:1.1` / `AC:1/16 Step` which is non-standard.

- [ ] **Step 1: Read the current step-edit.js**

Read the file to find the `_updateDisplay` method.

- [ ] **Step 2: Fix the display format**

Update `_updateDisplay` to match hardware format:

```javascript
_updateDisplay() {
  const stepsPerBeat = Math.floor(this.stepsPerBar / 4);
  const measure = Math.floor(this.currentStep / this.stepsPerBar) + 1;
  const stepInBar = this.currentStep % this.stepsPerBar;
  const beat = Math.floor(stepInBar / stepsPerBeat) + 1;
  const sub = (stepInBar % stepsPerBeat) + 1;

  const gridNames = { 96: '1/4', 48: '1/8', 32: '1/8T', 24: '1/16', 16: '1/16T', 12: '1/32', 1: 'HiR' };
  const grid = gridNames[this.quantizeGrid] || '1/16';

  this.display.setLine1('M:' + String(measure).padStart(2, '0') + ' B:' + String(beat).padStart(2, '0') + ' S:' + String(sub).padStart(2, '0'));
  this.display.setLine2('AC:' + grid);
}
```

- [ ] **Step 3: Verify in browser**

Toggle step program mode. Display should show:
- Line 1: `M:01 B:01 S:01`
- Line 2: `AC:1/16`
- Arrow right advances sub-beat correctly

- [ ] **Step 4: Commit**

```bash
git add js/ui/step-edit.js
git commit -m "fix: step program display shows M:01 B:01 S:01 format per hardware"
```

---

### Task 6: Fix Song Mode — Track Song Number, Recording Flow Display

**Files:**
- Modify: `js/ui/transport.js` (song mode handling in `_execProgFunction`, `_handleNav`)

**Context:** Song mode always shows `Song:01`. Should track current song number and update on nav. Song recording (Hold Record + Run, type segment numbers) is a complex flow — for now, fix the display tracking and navigation.

- [ ] **Step 1: Add song number tracking**

Add `this.currentSong = 0;` to the constructor.

- [ ] **Step 2: Update song mode activation**

In `_execProgFunction`, `case 'song'`:

```javascript
case 'song':
  this.mode = 'song';
  this.engine.setMode('song');
  this.display.setSong(this.currentSong);
  this.display.setMode('song');
  break;
```

- [ ] **Step 3: Update nav default to handle song mode**

In `_handleNav`, update the `default` case to navigate songs when in song mode:

```javascript
default:
  if (this.mode === 'song') {
    this.currentSong = Math.max(0, Math.min(99, this.currentSong + dir));
    this.display.setSong(this.currentSong);
  } else {
    this.currentSegment = Math.max(0, Math.min(99, this.currentSegment + dir));
    this.engine.selectPattern(this.currentSegment);
    this.display.setPattern(this.currentSegment);
  }
  break;
```

- [ ] **Step 4: Verify in browser**

- Toggle to Song mode → should show `Song 01    90`
- Press right arrow → `Song 02    90`
- Toggle back to Segment → shows `Seg 01    90`

- [ ] **Step 5: Commit**

```bash
git add js/ui/transport.js js/ui/display.js
git commit -m "fix: song mode tracks and displays current song number"
```

---

### Task 7: Fix Segment Display — Show Bar:Beat During Playback

**Files:**
- Modify: `js/ui/display.js` (add playback position to segment display)
- Modify: `js/ui/transport.js` (segment mode display after flash)

**Context:** The real SP-1200 shows the segment number and tempo on line 1, and during playback shows the current bar and beat position on line 2. Currently line 2 is always blank in segment mode. The `main.js` already receives tick messages with `bar` and `beat` — it calls `display.setBar()` and `display.setLine2()` directly. But `_refresh()` clears line 2, so any flash in segment mode wipes the playback position.

- [ ] **Step 1: Add beat tracking to display**

Add to display constructor:
```javascript
this.beat = 0;
this.playing = false;
```

Add setters:
```javascript
setBeat(beat) { this.beat = beat; }
setPlaying(playing) { this.playing = playing; }
```

- [ ] **Step 2: Update `_refresh` to show playback position on line 2**

```javascript
if (this.mode === 'segment' || this.mode === 'pattern') {
  this.setLine1('Seg ' + seg + '    ' + bpm);
  if (this.playing) {
    this.setLine2('Bar:' + (this.bar + 1) + ' Beat:' + (this.beat + 1));
  } else {
    this.setLine2(' ');
  }
}
```

- [ ] **Step 3: Wire play/stop state to display in transport.js**

In `_play()`:
```javascript
this.display.setPlaying(true);
```

In `_stop()`:
```javascript
this.display.setPlaying(false);
```

- [ ] **Step 4: Verify in browser**

- Press Space to play → line 2 shows "Bar:1 Beat:1" updating in real time
- Press Space to stop → line 2 goes blank

- [ ] **Step 5: Commit**

```bash
git add js/ui/display.js js/ui/transport.js
git commit -m "fix: segment mode shows bar/beat position during playback"
```

---

### Task 8: Fix Disk Module Display Format

**Files:**
- Modify: `js/ui/transport.js:272-278` (disk module handler)

**Context:** Disk functions currently all show `Disk: Label` / `Processing...` generically. While full disk I/O isn't implemented, the display should at least match what the hardware shows per function. Functions that wait for file selection should persist.

- [ ] **Step 1: Update disk module handler**

```javascript
else if (mod === 'disk') {
  switch (funcNum) {
    case 0:
      this._moduleDisplay('Load All', 'Select file +/-');
      this.editParam = 'disk-browse';
      break;
    case 1:
      this._moduleDisplay('Save Sequences', 'Processing...');
      break;
    case 2:
      this._moduleDisplay('Save Sounds', 'Processing...');
      break;
    case 3:
      this._moduleDisplay('Load Sequences', 'Select file +/-');
      this.editParam = 'disk-browse';
      break;
    case 4:
      this.editParam = 'disk-seg-num';
      this.numericBuffer = '';
      this._moduleDisplay('Load Segment #', 'Enter 2-digit #');
      break;
    case 5:
      this._moduleDisplay('Load Sounds', 'Select file +/-');
      this.editParam = 'disk-browse';
      break;
    case 6:
      this.editParam = 'select-pad';
      this.pendingAction = 'load-sound-pad';
      this._moduleDisplay('Load Sound #', 'Select a pad');
      break;
    case 7:
      this._moduleDisplay('Cat Sequences', 'Use +/- browse');
      this.editParam = 'disk-browse';
      break;
    case 8:
      this._moduleDisplay('Cat Sounds', 'Use +/- browse');
      this.editParam = 'disk-browse';
      break;
    case 9:
      this.editParam = 'disk-name';
      this._moduleDisplay('Save All As', 'Use slider name');
      break;
    default:
      this.display.flash('Disk ' + funcNum, 'Not available');
  }
}
```

- [ ] **Step 2: Verify in browser**

- Enter Disk mode (F2), press 0 → "Load All / Select file +/-" stays on screen
- Press 9 → "Save All As / Use slider name" stays on screen

- [ ] **Step 3: Commit**

```bash
git add js/ui/transport.js
git commit -m "fix: disk module displays match hardware prompts per function"
```

---

### Task 9: Fix Record Flow — Hold Record Then Press Run

**Files:**
- Modify: `js/ui/transport.js:41-57` (record button handler)

**Context:** On real hardware, you hold Record then press Run to start recording (both LEDs light). Currently pressing Record auto-starts playback. The correct flow: Record button arms recording (LED on), then pressing Run starts play+record together. If already playing, pressing Record toggles record on/off (overdub).

- [ ] **Step 1: Update record button handler**

```javascript
document.getElementById('btn-record').addEventListener('click', () => {
  if (this.playing) {
    // Already playing — toggle recording on/off (overdub)
    this.recording = !this.recording;
    if (this.recording) {
      this.engine.record();
    }
    document.getElementById('btn-record').classList.toggle('active', this.recording);
    this._led('led-record', this.recording);
  } else {
    // Not playing — arm recording, then start playback
    this.recording = true;
    this.engine.record();
    document.getElementById('btn-record').classList.add('active');
    this._led('led-record', true);
    this._play();
  }
});
```

Note: This still auto-starts on click (matching the keyboard shortcut Ctrl+Space). The "hold Record, then press Run" interaction requires tracking mousedown/mouseup state which is complex for a button. Keeping click-to-record-and-play is a reasonable compromise since the keyboard shortcut (Ctrl+Space) is the primary way users interact.

- [ ] **Step 2: Verify in browser**

- Click Record while stopped → recording starts, both LEDs on
- Click Record while playing → toggles recording on/off
- Stop → both LEDs off

- [ ] **Step 3: Commit**

```bash
git add js/ui/transport.js
git commit -m "fix: record button toggles overdub when playing, arms+starts when stopped"
```

---

### Task 10: Run Existing Tests & Final Verification

**Files:** None modified — verification only.

- [ ] **Step 1: Run the test suite**

```bash
pnpm test:run
```

Ensure all existing tests pass. The UI changes don't have unit tests, but DSP/sequencer tests should be unaffected.

- [ ] **Step 2: Visual verification checklist**

Run `pnpm dev` and verify each item:

1. Default screen: `Seg 01      90` (no colon, integer BPM)
2. Tap tempo: shows integer BPM
3. Enter Setup (F1) → press 11 → "Multi Pitch / Select a pad" persists
4. Enter Setup → press 14 → "Dynamic Btns / Yes=9 No=7" → press 9 → "On"
5. Enter Setup → press 18 → select pad → "Pad 1 / 1=Tune 2=Decay"
6. Enter Setup → press 25 → select pad → "Reverse A1 / Yes=9 No=7"
7. Enter Sample (F4) → press 3 → arrows cycle 0dB/+20dB/+40dB
8. Enter Sync (F3) → press 3 → arrows cycle SMPTE rates
9. Toggle Song mode → "Song 01" with nav
10. Step program → "M:01 B:01 S:01"
11. Play → line 2 shows "Bar:1 Beat:1"

- [ ] **Step 3: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "fix: display and module accuracy tweaks"
```
