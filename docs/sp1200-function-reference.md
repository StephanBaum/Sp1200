# SP-1200 Complete Function Reference

**This is a browser emulation of the E-MU / Rossum SP-1200.** There is no firmware, no SD card, no floppy disk. The UI layout (button types, colors, positions) is already correct and should not be changed. This document covers **functions, sub-functions, and how they interplay** with sliders, pads, display, and each other — so the emulation behaves like the original.

All LCD displays shown as `[Line 1]` / `[Line 2]`. Status: OK = working, PARTIAL = incomplete, MISSING = not implemented.

Sources: Rossum SP-1200 manual, ToneLab video tutorial transcript, Gemini analysis, hardware screenshots.

---

## General Navigation & Master Control

- **Activating Modules:** Press Setup, Disk, Sync, or Sample button → LED illuminates. Press again to exit (LED off).
- **Menu Navigation:** With module active, type function number on 10-digit keypad.
- **Adjusting Values:** Use 8 vertical sliders, keypad direct entry, or `<`/`>` arrow buttons to step through options. Hold arrow to fast-scroll.
- **Confirming Actions:** `Enter` button locks in values or advances to next screen.
- **Yes/No:** Key 9 = Yes, Key 7 = No.

---

## 1. SAMPLE Module
Press Sample button → LED illuminates → enters Option 1 (VU Mode) by default.

| Opt | Function | LCD Display | Behavior | Status |
|-----|----------|-------------|----------|--------|
| 1 | VU Mode (default) | `A1         +00dB` / `[VU meter bars]` | Monitors incoming audio level. Top line: Bank+Pad left, Gain right. Asterisk `*` if pad has sound. Bottom line: real-time CSS VU meter with **peak hold** indicator (thin line). Physical Gain knob adjusts input level. | OK |
| 2 | Assign Voice | `Sampling A1` / _(blank)_ | Select pad to receive sample. Asterisk `*` warns if pad has sound — asks to confirm erase (Yes/No). Press Enter on vacant pad. | OK |
| 2→ | Output Channel | `Sampling A1` / `Output Channel 7` | After confirming pad, enter output channel 1-8, press Enter. Returns to VU mode. | OK |
| 3 | Input Gain (Level) | `Input Gain +20dB` / `Use ← and →` | Adjusts internal preamp to boost weak signals. Arrow keys cycle: +00dB, +20dB, +40dB. Press Enter to confirm, returns to VU. Recommended: return to +00dB after sampling to avoid loud playback. | OK |
| 4 | Threshold Set | `Arm Slider #1` / `[VU with threshold marker]` | Creates volume tripwire for auto-start recording. Top line: single threshold bar + "Use Slider #1". Bottom line: VU meter. Push Slider 1 up/down to set tripwire above noise floor. | OK |
| 5 | Sample Length | `Length: 2.5 secs` / `Use Slider #1` | Sets strict cutoff time for recording. Max 2.5 seconds per zone. Slider 1 adjusts in **100ms increments**. Press Enter to lock. | OK |
| 6 | Resample | `A8    *    +20dB` / _(VU meter)_ | Shortcut: immediately overwrites last used pad using previously defined length and routing settings. Asterisk shows pad will be overwritten. Abort by pressing another module button or running Option 2. | OK |
| 7 | Arm Sampling | `Sample Armed` → `Sampling...` → `Sample is Good` | Standby mode. Auto-starts when audio breaches threshold (Option 4). Shows `Sample Overload` if audio clipped. | OK |
| 8 | System Audio (emulator) | `System Audio` / `Share screen...` | **Emulator addition:** Switches audio input from mic to system audio (captures other browser tabs, apps). Uses getDisplayMedia. Returns to VU mode after selection. | OK |
| 9 | Force Sample | `Sampling...` → `Sample is Good` | Manual trigger — recording begins immediately on keypress, bypasses threshold entirely. | OK |

---

## 2. SYNC Module
Press Sync button → LED illuminates. Dictates how the SP-1200 keeps time and talks to external gear.

| Opt | Function | LCD Display | Behavior | Status |
|-----|----------|-------------|----------|--------|
| 1 | Internal Clock | `Select Internal` | SP-1200 is master clock, generates its own tempo. Outputs SMPTE and metronome/clock signals. | OK |
| 2 | MIDI Clock | `Select MIDI` | SP-1200 becomes slave, locks to tempo of external MIDI device. If external sends clock but not start/stop, arm Run button first. | OK |
| 3 | SMPTE Format | `SMPTE Format is:` / `XX fps` | Syncs to analog tape machines or video equipment via timecode. Arrow keys select framerate: 24, 25, 30, 30-drop fps. Press Enter. Then key in exact SMPTE start point (H:M:S:F). | OK (no start point entry) |
| 4 | Click Divisor | `Click Divisor: XX` | Syncs SP-1200 to older pre-MIDI analog drum machines. Enter division number via keypad to divide internal 24 PPQ clock. (e.g., ÷4 for LinnDrum, ÷8 for Oberheim). | OK |

---

## 3. DISK Module

Press Disk button → LED illuminates. Handles saving and loading projects.

### Emulator Storage Architecture

Since this is a browser emulation, there is no SD card or floppy disk. Instead:

- **Project folder:** User specifies a folder (via browser file system access or IndexedDB). All samples, sequences, songs, and settings are saved as a project to this folder.
- **No folder specified → scratch cache:** If no project folder is set, samples are recorded/loaded into an internal cache inside the program. This cache acts as a **scratch pad** — it persists across browser/server restarts but is overridden when a new sample is recorded to the same slot. Recordings are only permanently saved when the user saves a project.
- **Right-click pad loading:** As a modern convenience, right-clicking a pad opens a file picker. The selected audio file is resampled through current gain/filter settings and loaded to that pad in the current bank. This bypasses the SP-1200's sampling workflow but the result is stored identically.
- **Project save format:** All samples are written as audio files, all settings (sequences, songs, per-pad pitch/decay/volume/reverse/truncate/loop, mix snapshots, channel assignments, etc.) are saved to a project manifest. Recordings go into a `.rec` file within the project.
- **Cache persistence:** The scratch cache persists even after rebooting server/browser. It is only overridden by recording a new sample to the same slot. When saving a project, the cache contents are written to the project folder.

### Disk Module Functions

For authenticity, the disk module uses the same quirky naming, folder navigation, and menu flow as the original SP-1200.

**Navigation:** Left/Right arrows scroll directory. Folders end with `/`. Exit path = `../`. Hold arrow to auto-scroll. Enter opens folder.

| Opt | Function | LCD Display | Behavior | Status |
|-----|----------|-------------|----------|--------|
| 0 | Load All | `Load All` / `[filename]` | One-touch: clears all memory, loads entire project (sounds + sequences). | OK |
| 1 | Save Sequences | `Save Sequences` | Saves only pattern and song data to project. | OK |
| 2 | Save Sounds | `Save Sounds` | Saves only audio samples to project. | OK |
| 3 | Load Sequences | `Load Sequences` | Wipes current sequence memory, loads patterns from project. | OK |
| 4 | Load Segment # | `Load Segment` / `Enter 2-digit #` | Enter 2-digit number to extract one specific pattern from project. | OK |
| 5 | Load Sounds | `Load Sounds` | Wipes current sample memory, loads all sounds from project. | OK |
| 6 | Load Sound # | `Load Sound #` / `Select pad` | Select a pad, then loads a single sound from project onto that pad. | OK |
| 7 | Catalog Sequences | `Catalog Seqs` | Scroll through and read names of sequences in project using Slider #1 without loading. | OK |
| 8 | Catalog Sounds | `Catalog Sounds` | Scroll through and read names of sounds in project using Slider #1 without loading. | OK |
| 9 | Save All As (Rename) | `Name:` / `[editable name]` | Save everything to a new project file. Slider 1 = cycle through letters/numbers/symbols. L/R arrows = move cursor. Erase button = delete char. Up arrow = insert space. Enter = save. | OK |
| 27 | Create Folder | `Create Folder?` / `Yes/No` | Create new folder in project directory. Name with slider/arrows, Enter to save. | MISSING |

### Right-Click Pad Loading (Emulator Addition)

| Action | Behavior | Status |
|--------|----------|--------|
| Right-click pad | Opens file picker. Selected audio file is resampled through current gain settings and loaded to that pad in the current bank. Stored in cache (or project if set). | MISSING |

---

## 4. SETUP Module
Press Setup button → LED illuminates. The deepest menu — handles sample editing, performance routing, and advanced settings.

**While playing: restricted to functions 11-13 only.** LCD shows: `Set-up Function?` / `[11-13]`

| Opt | Function | LCD Display | Behavior | Status |
|-----|----------|-------------|----------|--------|
| 11 | Multi-Pitch | _(Tune LED lights)_ / _(tuning values)_ | Takes single sample, maps across all 8 pads at varying pitches for melodies. Use 8 vertical sliders to tune each pad. Must exit via 13. | OK |
| 12 | Multi-Level | _(Mix LED lights)_ | Maps single sample across all 8 pads at varying volumes for expressive playing/ghost notes. Use 8 vertical sliders to set volume per pad. Must exit via 13. | OK |
| 13 | Exit Multi Mode | `Exit Multi Mode?` / `YES/NO` | Returns pads to normal state after multi-pitch or multi-level. | OK |
| 14 | Dynamic Buttons | `Dyn Buttons? YES` / `(yes/no)` | Toggles pad velocity sensitivity on/off. Yes/No on keypad. | OK |
| 15 | Define Mix (Save) | `Save Current Mix` / `As Mix #` | Saves current mixer snapshot (all fader positions) to one of 8 mix slots. Enter slot number 1-8, press Enter. | OK |
| 16 | Select Mix (Recall) | `Select Mix #1` | Instantly recalls a previously saved mixer snapshot. Enter slot number 1-8. | OK |
| 17 | Channel Assign | `Assign A6` / `Output Channel 7` | Routes pad to one of 8 individual rear outputs. Hit pad, key in 1-8, Enter. **Mute groups:** routing two sounds (e.g., open + closed hi-hat) to same channel causes one to cut off the other. | OK |
| 18 | Decay/Tune Select | `Decay/Tuning` / `Select Sound` → `A7      TUNED` / `1=Tune  2=Decay` | **Critical function.** Dictates whether pad's vertical slider controls Pitch (Tune) or volume Envelope (Decay). Select pad, key 1 for tune, key 2 for decay. Display shows `TUNED` or `DECAYED`. | OK |
| 19 | Loop/Truncate | `Truncate A1` / `S=00000  E=65090  L=NONE` | Interface for chopping samples. **Faders 1-2:** start point (coarse/fine). **Faders 3-4:** end point (coarse/fine). **Faders 5-6:** loop point (coarse/fine). Display shows `S=`, `E=`, `L=` values. Press Enter → `Make Truncation Permanent? Y/N` — confirming deletes excess audio to save memory. Shows `Copied` after. Enter accepts current bank slot for next sample selection. | PARTIAL (basic truncate works, no 6-fader coarse/fine, no loop point editing, no permanent truncation with memory reclaim) |
| 20 | Delete Sound | `Delete:` / `Select Sound` → `Delete! A1` / `Confirm? Y/N` | Erases specific sample to free memory. Select pad, confirm Yes/No. | OK |
| 21 | First Song Step | `Song 01` / `First Step: 01` | Set current song's starting step. Arrow keys or keypad to select step number. | OK |
| 22 | MIDI Parameters | `Midi Parameters` / `Basic Channel 01` → `MIDI Mode: omni` / `1=omni  2=poly` | Assigns MIDI channel (1-16) and toggles between Omni and Poly mode. | OK |
| 23 | Special Menu | `Set-up Function?` / `[11-22, 25]` | Opens sub-layer of functions (see below). | OK |
| 25 | Reverse Sound | `Reverse A1` / `YES/NO` | Reverses sample playback. Select pad, press Yes to confirm. | OK |

### Setup 23 → Special Sub-Menu

| Sub | Function | LCD Display | Behavior | Status |
|-----|----------|-------------|----------|--------|
| 11 | Catalog | — | List available functions. | OK |
| 12 | Clear All Memory | `Clear All?` / `Yes/No` | Wipes all sounds and sequences. | OK |
| 13 | Memory Remaining | `Memory: XX.Xs` / `Seq: XX%` | Display remaining sample seconds and sequence memory percentage. | PARTIAL (sample seconds shown, no sequence %) |
| 15 | Clear Sound Memory | `Clear Sounds?` / `Yes/No` | Wipes all sample memory only. | OK |
| 16 | Clear Sequence Memory | `Clear Seqs?` / `Yes/No` | Wipes all sequence memory only. | OK |
| 17 | Copy Sound | `Copy` / `Select Sound` → `Copy A1` / `Select Dest` | Copies sound to new pad **without using extra memory** (linked/reference copy, shares buffer). Can copy across banks. Then set different pitch/decay/volume on the copy independently. | OK |
| 18 | Swap Sounds | `Swap` / `Select Sound` → `Swap A1` / `Select Second` | Swaps the location of two sounds between pads. | OK |
| 19 | Default Decay | `Default Decay` / `Enter value` | Set default decay time for all pads currently in tune mode. | OK |
| 21 | Name Sound | — | Allows you to name your samples. | MISSING |
| 22 | Dynamic Allocation | `Dyn Alloc?` / `Yes/No` | If enabled, automatically routes sample to adjacent output channel when hit rapidly, preventing it from abruptly cutting itself off. Allows tail to ring out while new hit starts. | PARTIAL (UI exists, no voice stealing engine) |
| 25 | Reverse Sound | _(same as Setup 25)_ | Reverse sample playback. | OK |

---

## 5. PROGRAMMING & PERFORMANCE

### Transport Controls

| Function | Behavior | Status |
|----------|----------|--------|
| Run/Stop | Start/stop sequencer. Run LED = playing. | OK |
| Record | Hold Record + press Run to record. Both LEDs light. Record arms if not playing. | OK |
| Tap Tempo | Tap repeatedly to set BPM (averages last 4 taps). | OK |
| Tap Repeat | Hold button + hold pad = re-trigger sound at speed dictated by Auto Correct setting (e.g., 1/16 = rapid hi-hat roll). | OK |

### Segment Mode (Building Individual Patterns)

Toggled by Song/Segment button. Press Segment → LED on → `Seg XX` + Tempo displayed.

| Function | LCD Display | Behavior | Status |
|----------|-------------|----------|--------|
| Segment Select | `Seg 00    120.0` | Arrow keys or keypad to select segment 00-99. | OK |
| Segment Length | `Seg Length` / `XX Bars` | Enter 2-digit bar count, press Enter. Default = 02. If shortened: acts as Truncate to permanently delete steps outside new length. | OK |
| Erase (while playing) | `Erase On` / `Hold pad` | Hold Erase button, hold pad — deletes specific drum hits as playhead passes over them in real-time while sequence loops. Toggle on/off. | OK |
| Erase (while stopped) | `Erase Seg?` / `Enter seg number` | Enter segment number to erase entire segment. | OK |
| Copy Segment | `Copy Seg` / `From XX To YY` | Duplicate segment to empty slot. If copied to itself, appends to double its length. | OK (no self-append/double) |
| Time Signature | `Time Sig: 4/4` | Defines numerator and denominator. Cycle: 4/4, 3/4, 6/8, 5/4, 7/8. | OK |
| Metronome | `Click On` / `Click Off` | Defines click track grid (1/4 notes up to 1/32nd triplets). | OK |

### Song Mode (Arranging Patterns into Full Tracks)

Press Song button → LED on → `Song XX` (00-99). SP-1200 can hold up to **100 song arrangements**. Each song has its **own independent tempo**.

**Important:** When entering song mode, segment tempo and mix settings are NOT replicated. But unlike segments, song tempo IS saved/recalled with disk operations. Playing a song immediately adopts its tempo into segment mode.

**To set song tempo:** Select song → Record → insert any segment → Enter → Tempo button → enter BPM → Enter (saves tempo to that song).

**To arrange:** Record → type 2-digit segment numbers → Enter per step → Stop when done.

| Function | LCD Display | Behavior | Status |
|----------|-------------|----------|--------|
| Song Select | `Song 00` | Arrow keys or keypad to select song 00-99. | OK |
| Song Edit | _(Record + Run)_ | Chain segments by typing 2-digit numbers, Enter per step. Stop when done. | OK |
| Mix Change | `Mix Change` / `Select Mix 1-8` | Insert command to auto-switch to saved mixer snapshot at this step. Functions like MIDI program change. Can automate volume/pan changes throughout song. | OK |
| Tempo Change | `Tempo Change` / `1=Accel 2=Ritard` → `Change: XX BPM` / `Over: XX Beats` | Insert speed-up (Accelerando) or slow-down (Ritardando) over N beats (max 32). If "Over" = 0, change is instant. E.g., +10 BPM over 32 beats = gradual 8-bar speedup. | PARTIAL (instant only, no gradual accel/ritard) |
| Trigger | `Trigger Type` / `1/4, 1/8, 1/16...` | Insert command to send analog pulse out metronome jack at this step. Can trigger modular synths, arpeggiators, older drum machines. Types: 1/4, 1/8, 1/16, 1/32, 1/32T, Click (24PPQ), Tr Off. | OK |
| Repeat | `Repeat` / `Count: XX` | Place "Begin Repeat" `|:` and "End Repeat" `:|` loop brackets around sections. Repeat up to 99 times — saves huge amounts of memory. Foot switch can abort remaining repetitions. | OK |
| Sub Song | `Sub Song` / `Song #: XX` | Insert jump to another song arrangement. Plays that song, then returns and continues. Can loop current song by referencing itself (deliberate infinite loop until Stop). | MISSING |
| End | `End Mark Set` | Insert end-of-song marker. Song stops here. Dictates whether song stops completely, loops, or links to next song number. | OK |
| Insert | `Step Inserted` | Insert empty step, subsequent steps shift up by one. | OK |
| Delete | `Step Deleted` | Delete current step, subsequent steps shift down by one. | OK |
| Tab Song | `Tab Song` / `Step: XX Seg: YY` | Scroll through song arrangement to view steps without editing. | OK |
| First Step (Setup 21) | `Song 01` / `First Step: 01` | Change current song's starting step via arrow keys or keypad. | OK |

### Swing & Auto Correct

Both settings are **destructive** — they permanently alter timing of notes as you record them.

| Function | LCD Display | Values | Status |
|----------|-------------|--------|--------|
| Swing | `Swing: XX%` | 50% (off), 54%, 58%, 63%, 67%, 71%. Pushes groove mathematically off-grid. Values with 'T' apply swing to triplet grids. | OK |
| Auto Correct (Quantize) | `AutoCorrect: 1/16` | 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32, Hi-Res (unquantized). | OK |

### Step Program Mode

Press Step Program → Record LED on, Run LED off. Manual grid-editing mode.

| Function | LCD Display | Behavior | Status |
|----------|-------------|----------|--------|
| Step Edit | `M:01 B:01 S:01` / `[up to 4 pad names at this step]` | Arrow keys jog forward/backward through timeline. Hold Run to jog continuously. Hit pad to place sound at exact step. Hold Erase + hit pad to delete sound at that step. Display shows up to 4 pad names occupying each time slice. | PARTIAL (basic insert works; no erase-in-step-edit, no Run-jog, no multi-pad display per step) |

---

## 6. PADS, BANKS & PERFORMANCE CONTROLS

| Function | Behavior | Status |
|----------|----------|--------|
| 4 Banks (A/B/C/D) | Bank button cycles A→B→C→D→A. 32 total sounds (4×8). Bank LEDs show current. Each pad can hold up to 2.5 sec, but total memory is shared (Rossum: 20 sec, EMU: 10 sec). | OK |
| Tune/Mix Toggle | Left-side toggle switches faders between Tune (pitch ±semitones) and Mix (volume). Display shows readout of all 8 values. | OK |
| Per-pad Decay | Via Setup 18, trade individual pad's tune for decay envelope. Slider makes sound shorter/choppier. | OK |
| Velocity Sensitivity | Pad velocity based on hit dynamics. Toggleable via Setup 14 (Dynamic Buttons). | OK |
| Tap Repeat | Hold Tap Repeat + hold pad = auto re-trigger at Auto Correct rate. E.g., 1/16 Auto Correct + held pad = rapid hi-hat roll. | OK |

---

## 7. FADERS (8 Vertical Sliders)

| Mode | Range | Behavior | Status |
|------|-------|----------|--------|
| Volume (Mix LED) | 0–100% | Per-pad channel volume. | OK |
| Pitch (Tune LED) | -8 to +7 semitones | Per-pad pitch in semitone steps. 7 semitones up, 8 semitones down. | OK |
| Decay | 0–100% | Per-pad decay envelope (only for pads set to decay mode via Setup 18). Makes sound shorter/choppier. | OK |
| Multi-Pitch | varies | In Multi-Pitch mode (Setup 11): each fader tunes one of 8 pitch-mapped copies of source sample. | OK |
| Multi-Level | varies | In Multi-Level mode (Setup 12): each fader sets volume of one of 8 velocity-mapped copies. | OK |
| Sample Threshold (Sample 4) | 0–100% | Slider 1 sets threshold tripwire for arm sampling. | OK |
| Sample Length (Sample 5) | 0.1–2.5 sec | Slider 1 adjusts recording length in 100ms increments. | OK |
| Truncate (Setup 19) | sample points | Sliders 1-2: start (coarse/fine), 3-4: end (coarse/fine), 5-6: loop (coarse/fine). | PARTIAL |
| Disk Name (Disk 9) | A-Z, 0-9 | Slider 1 scrolls through character set for file naming. | OK |
| Catalog (Disk 7/8) | scroll | Slider 1 scrolls through file names. | OK |

---

## 8. KNOBS

| Knob | Function | Status |
|------|----------|--------|
| Gain | Input gain for sampling (physical pot on top right). | OK |
| Mix Volume | Master output volume. | OK |
| Metronome Volume | Metronome level in main mix. Dedicated rear output unaffected by this pot. Can use metronome output to trigger synths/modular gear at 24 PPQ. | OK |

---

## 9. AUDIO ARCHITECTURE (Emulated from Hardware)

These are the audio routing features from the original hardware, emulated in the DSP engine.

| Feature | Original Hardware | Emulation | Status |
|---------|-------------------|-----------|--------|
| Sample Input | 1/4" TS jack | Browser mic input + file drag-drop + right-click pad load | OK (no right-click yet) |
| Mix Output | 1/4" TRS main stereo sum | Web Audio API stereo output | OK |
| Filtered Channels 1-2 | Dynamic SSM2044 filtering with varying bandwidth | SSM2044Filter DSP class, per-channel cutoff + resonance | OK |
| Filtered Channels 3-6 | Static filtering | FixedFilter DSP class | OK |
| Unfiltered Channels 7-8 | No filtering applied | Direct pass-through | OK |
| 12-bit sampling | 26,040 Hz sample rate, 12-bit depth | Resampled from browser audio to SP-1200 specs | OK |
| Web MIDI | N/A on original (had DIN MIDI ports) | Web MIDI API for external controller support | MISSING |

---

## 10. PER-NOTE RECORDING (Emulator Enhancement)

When recording, each note event stores:

| Parameter | Description | Status |
|-----------|-------------|--------|
| Tick | Quantized position in pattern | OK |
| Velocity | Pad hit velocity (0-127) | OK |
| Sample Slot | Bank×8+Pad — which sample was playing | OK |
| Pitch | Exact pitch rate at record time | OK |
| Decay | Decay rate at record time | OK |
| Mix Volume | Channel volume at record time | OK |

On playback, stored per-note params override current fader positions. Fader changes only affect future/live notes.

---

## Summary of Gaps

| Feature | Priority | Notes |
|---------|----------|-------|
| **Truncate (Setup 19)** | HIGH | 6-fader coarse/fine editing for start/end/loop points. Display S=/E=/L= values in sample frames. "Make Truncation Permanent?" deletes excess audio and reclaims memory. Currently only basic truncate via 2-value start/end. |
| **Right-click pad loading** | HIGH | Right-click a pad → file picker → resample through gain → load to pad. Modern convenience shortcut. |
| **Project folder save/load** | HIGH | Disk module should save/load to a real project folder. Scratch cache for unsaved work, persists across restarts, saved to `.rec` on project save. |
| **Sub Song** | MEDIUM | Insert song-within-song reference. Plays referenced song then returns. Self-reference = infinite loop. Used for song looping and complex arrangements. |
| **Step Edit: multi-pad display** | MEDIUM | Step edit should show up to 4 pad names occupying each time slice. Currently shows position only. |
| **Step Edit: erase** | MEDIUM | Hold Erase + pad in step edit mode to delete notes at current step. |
| **Step Edit: Run-jog** | LOW | Hold Run to auto-advance through steps continuously. |
| **Name Sound (Special 21)** | LOW | Name individual samples. |
| **VU Peak Hold** | LOW | VU meter should have a peak-hold indicator that lingers at maximum level. |
| **Gradual Tempo Change** | LOW | Accel/Ritard over N beats (max 32). Currently only instant tempo change at step boundary. |
| **Dynamic Allocation (Special 22)** | LOW | Voice stealing: route to adjacent channel on rapid re-trigger so tail rings out. UI exists but no engine support. |
| **Copy-to-self (Segment)** | LOW | Copying segment to itself should append/double its length. |
| **Memory Remaining: seq %** | LOW | Special 13 should also show sequence memory percentage alongside sample seconds. |
| **Web MIDI** | LOW | Receive/send MIDI via Web MIDI API for external controller support. |
| **Create Folder (Disk 27)** | LOW | Create folder in project directory. |
