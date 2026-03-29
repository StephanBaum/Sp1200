# SP-1200 Emulator — UI Mechanics & Rules

This document defines HOW the emulator UI works. Follow these rules when modifying any UI code.

**Goal:** Replicate the original E-MU / Rossum SP-1200 behavior as closely as possible. Digital shortcuts (file system, right-click pad loading, system audio capture) are acceptable where hardware is impractical in a browser, but all sequencer, sampling, editing, and module workflows must match the original.

**Reference documents:**
- `docs/sp1200-function-reference.md` — complete function list with LCD displays, derived from manual + tutorial
- `docs/superpowers/refs/sp1200_functions.md` — raw notes from ToneLab tutorial video
- `docs/superpowers/refs/sp1200_manual.pdf` — original Rossum SP-1200 manual
- `docs/superpowers/refs/transcript` — full video tutorial transcript
- `docs/superpowers/refs/screens/` — screenshots of real hardware LCD displays

**When in doubt about behavior, consult the transcript and manual first.** The emulator should feel like using the real hardware.

---

## How the Real SP-1200 Works (Summary)

The SP-1200 has 4 modules (Setup, Disk, Sync, Sample), each activated by its button. Once in a module, you type function numbers on the keypad. Each function shows a screen on the 2-line, 16-character LCD. You interact via pads (select sounds), sliders (adjust values), keypad (type numbers, Y/N), and arrows (step through options). Enter confirms. The module stays active until you press its button again.

The sequencer has Segment mode (build individual patterns) and Song mode (chain patterns). You toggle with the Song/Segment button. Recording: hold Record, press Run. Erase: toggle Erase, hold a pad while playing.

Sounds live in 4 banks (A-D) × 8 pads = 32 slots. Each pad has independent pitch, volume, decay, reverse, loop, and truncate settings. Channel assignment creates mute groups.

---

## Core Principle: Module Functions Never Exit

A module function stays active until the user explicitly exits via:
1. **Enter** — exits the current function back to the module home screen
2. **Module button** — exits the entire module back to default segment/song display
3. **Another module button** — switches to that module

Nothing else exits a function. Not pads, not faders, not confirmations.

---

## The Display Stack

```
Layer 3: flash()         — temporary message (1.2s), auto-reverts to Layer 2
Layer 2: moduleDisplay() — current function screen (locked), saved as restore point
Layer 1: _refresh()      — default screen (Seg XX ♪BPM) — only shown when unlocked
```

- `moduleDisplay(line1, line2)` locks the display and saves a restore callback
- `flash(line1, line2)` shows a message, then reverts to whatever `moduleDisplay` last set
- `_refresh()` only runs when display is unlocked (no module active)
- Fader visuals (`showMixLevels`, `showTuneLevels`) only show when unlocked

---

## editParam State Machine

`editParam` controls what the keypad, arrows, and Enter do:

| editParam | Keypad does | Arrows do | Enter does |
|-----------|-------------|-----------|------------|
| `null` | Segment select (2-digit) | N/A | Confirm segment |
| `'module-func'` | Function number entry | N/A | N/A |
| `'vu-mode'` | Single digit → sample function | N/A | N/A |
| `'select-pad'` | N/A (pads handle it) | N/A | Exit to module home |
| `'channel-assign-num'` | Type channel 1-8 | Adjust channel ±1 | Exit to module home |
| `'decay-tune-select'` | Type 1=tune 2=decay | N/A | Exit to module home |
| `'truncate-edit'` | N/A (faders handle it) | N/A | Prompt truncate Y/N |
| `'delete-confirm'` | 9=yes 7=no | N/A | Yes (Enter=Yes) |
| `'reverse-confirm'` | 9=yes 7=no | N/A | Yes (Enter=Yes) |
| `'bpm'` | Type 3-digit BPM | Adjust ±1 BPM | Confirm BPM |
| `'segment'` | Type 2-digit segment | N/A | Confirm segment |
| `'swing'` | Type 2-digit swing | Cycle presets | Confirm |
| `'quantize'` | N/A | Cycle grids | N/A |
| `'special-menu'` | Type 2-digit function | Browse catalog ±1 | Select browsed function |
| `'catalog-browse'` | N/A | Browse entries ±1 | N/A |
| `'threshold'` | N/A | Adjust ±5% | Confirm → VU mode |
| `'sample-length'` | N/A | Adjust ±0.1s | Confirm → VU mode |
| `'disk-browse'` | N/A | Browse files ±1 | Execute disk op / enter folder |
| `'disk-name'` | Type chars | Cursor ±1 | Save file |
| `'tabsong-entry'` | Type 2-digit segment | N/A | N/A (auto-adds) |

---

## Pad Behavior in Functions

When `pendingAction` is set, pad clicks are intercepted by `pad-actions.js`:

| pendingAction | Pad click does | After pad click |
|---------------|----------------|-----------------|
| `'channel-assign'` | Shows pad's channel | Stays — tap another pad or type # |
| `'decay-tune'` | Shows pad's tune/decay mode | Stays — tap another or type 1/2 |
| `'truncate'` | Loads pad's sample points | Stays — faders update |
| `'delete-sound'` | Shows "Delete: XX Y/N" | Stays — press Y/N then tap next |
| `'reverse-sound'` | Shows "Reverse: XX Y/N" | Stays — press Y/N then tap next |
| `'copy-sound-from'` | Selects source, switches to `copy-sound-to` | Waits for dest pad |
| `'copy-sound-to'` | Copies and exits to module-func | Done |
| `'swap-sound-from'` | Selects first, switches to `swap-sound-to` | Waits for second pad |
| `'swap-sound-to'` | Swaps and exits to module-func | Done |
| `'multi-pitch'` | Activates multi-pitch | Exits to module-func (one-shot) |
| `'multi-level'` | Activates multi-level | Exits to module-func (one-shot) |
| `'name-sound'` | Enters name editor for pad | Name entry mode |

**Rule:** `pendingAction` must stay set for functions that allow pad switching. Only clear it for one-shot actions (multi-pitch/level, copy-to, swap-to).

---

## PadsUI Guard

`PadsUI._bindMouse()` suppresses sound triggers when a function is selecting pads:

```javascript
if (state.pendingAction && state.editParam matches a function editParam) return;
```

The guard checks: `select-pad`, `channel-assign-num`, `decay-tune-select`, `truncate-edit`, `delete-confirm`, `reverse-confirm`.

---

## Y/N Confirmations

All Y/N prompts: key 9 = Yes, key 7 = No, Enter = Yes.

After confirmation:
- Per-pad functions (delete, reverse): stay in function, show result via `flash()` which auto-reverts to the function screen
- One-shot functions (exit multi, dynamic buttons, clear all): `editParam = 'module-func'`, show result via `flash()`

---

## flash() Auto-Revert

`display.flash(line1, line2)` shows a message for 1.2 seconds, then:
- If a module is active: reverts to whatever `moduleDisplay()` last set (via `_moduleRestore` callback)
- If no module: reverts to default `_refresh()` (Seg XX ♪BPM)

This means you can call `flash()` anywhere in a module and it will auto-return to the current function screen. No manual setTimeout needed.

---

## Segment/Song Indexing

- Internal: 0-indexed (pattern arrays, engine messages)
- Display: 1-indexed (user types 01 = internal 0)
- All UI entry points subtract 1: `const idx = val - 1`
- All display points add 1: `String(idx + 1).padStart(2, '0')`

---

## Bank System

- 32 sample slots: bank 0-3 × pad 0-7 = slot 0-31
- `slotIdx = bank * 8 + pad`
- Bank switch: processor updates idle voices only (active voices keep playing)
- Recording stores `slot` in PatternEvent for correct playback from any bank
- Trigger handler loads from slot before playing (skipped in multi mode)

---

## Audio Signal Chain (Sampling)

```
micStream → MediaStreamSource → GainNode → AnalyserNode → VU display
                                    ↓
                            MediaStreamDestination → MediaRecorder → sample buffer
```

- Gain = knob position (0-2x) × preamp level (+0/+20/+40 dB)
- Stream acquired once, kept alive for session
- Option 8 switches to system audio (getDisplayMedia)

---

## Module Entry/Exit

**Enter module:**
1. Set `s.activeModule = 'moduleName'`
2. Lock display
3. Set `editParam = 'module-func'` (or `'vu-mode'` for sample)
4. Show module home screen

**Exit module (press module button again):**
1. `exitModule()` clears activeModule, editParam, pendingAction
2. Clears moduleRestore callback
3. Unlocks display → `_refresh()` shows default screen

**Enter function (type number on keypad):**
1. `handleModuleFunction()` sets editParam to function-specific value
2. `moduleDisplay()` shows function screen and saves restore point

**Exit function (Enter key):**
1. `editParam = 'module-func'`
2. Module home screen shown
