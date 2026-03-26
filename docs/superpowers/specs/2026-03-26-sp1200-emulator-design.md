# SP-1200 Web Emulator — Design Spec

## Overview

A browser-based emulation of the E-mu SP-1200 drum machine/sampler. Full DSP emulation of the 12-bit/26.04kHz audio path including SSM2044 analog filter modeling, skeuomorphic replica UI, complete sequencer (pattern + song mode), microphone sampling, and a built-in sample library. Zero runtime dependencies — vanilla JS with ES modules.

## Decisions

| Decision | Choice |
|----------|--------|
| Platform | Web app (HTML/CSS/JS, Web Audio API) |
| Audio fidelity | Full DSP emulation |
| UI style | Skeuomorphic hardware replica |
| Sequencer scope | Full (pattern, song, step edit, swing, auto-repeat) |
| Sample input | File upload + mic recording + built-in library |
| Architecture | AudioWorklet DSP engine + main-thread UI |
| Build tooling | Vite dev server only; no runtime dependencies |

---

## 1. Audio Engine (AudioWorklet)

A single `SP1200Processor` AudioWorklet handles all real-time audio and sequencer timing.

### Output
- AudioContext runs at 44.1kHz (browser default)
- All internal DSP operates on 26.04kHz-resampled data, output upsampled to 44.1kHz

### Sample Playback
- 8 voices (channels), each assigned to a pad
- Samples stored as Float32Arrays in worklet memory
- Variable-rate playback for pitch shifting

### 12-Bit / 26.04 kHz Emulation
- Input samples resampled to 26.04 kHz on load
- Quantized to 12-bit depth (4096 levels) on load
- Matches original hardware behavior (conversion happened at sample time, not playback)

### Pitch Shifting & Aliasing
- Pitch down = lower playback rate through the 26.04kHz buffer
- Nearest-neighbor interpolation only — produces authentic aliasing artifacts
- Pitch up = higher playback rate

### SSM2044 Filter Emulation
Per-channel filter routing matching the original hardware:
- **Channels 1-2:** 4-pole (24dB/oct) resonant low-pass filter, cutoff tracks pitch. Modeled as cascaded OTA ladder filter (SSM2044 topology).
- **Channels 3-6:** Fixed-frequency low-pass filters (~8-10kHz cutoff, gentle slope).
- **Channels 7-8:** No filtering — raw 12-bit output.

### Decay Envelope
- Linear or exponential decay per voice
- Controlled by per-pad decay parameter

### Mixer
- 8 channel faders (volume), summed to stereo output
- Per-channel pan (modern convenience replacing individual hardware outputs)

---

## 2. Sequencer (Inside AudioWorklet)

Runs in the AudioWorklet for sample-accurate timing — critical for authentic SP swing.

### Clock
- Internal tick counter at audio sample rate (44.1kHz output)
- BPM range: 30-250
- Resolution: 96 PPQN
- Tap tempo from UI messages

### Swing
- Delays even-numbered 16th notes by a percentage
- Range: 50% (straight) to ~75% (heavy swing)
- Applied at tick level — replicates SP-1200's specific timing grid

### Pattern Mode
- 99 patterns, up to 4 bars each
- 8 tracks (one per pad)
- Events: trigger on/off, velocity (0-127), pitch offset
- Real-time recording with quantization (swing-aware)
- Overdub recording

### Step Edit
- Step-by-step navigation through pattern
- Add/delete/modify events per step
- Edit velocity and pitch per step

### Song Mode
- Chain up to 99 entries (pattern number + repeat count)
- Linear playback
- Song position display

### Auto-Repeat
- Pad held = repeated triggers at quantize rate (1/8, 1/16, 1/32)
- Velocity follows initial hit or ramp

### Quantize Grid Options
- 1/4, 1/8, 1/8T (triplet), 1/16, 1/16T, 1/32

---

## 3. UI (Skeuomorphic Replica)

Vanilla JS + CSS. No framework. Communicates with AudioWorklet via MessagePort.

### Layout
- **Left panel:** 8 vertical faders (assignable: pitch or volume)
- **Center-top:** LED-style segmented display (BPM, pattern number, sample name, parameters)
- **Center:** Function buttons grid (Record, Play, Stop, Pattern, Song, Edit, etc.)
- **Right panel:** 8 drum pads (2x4 grid), velocity-sensitive
- **Bottom:** Bank select (A/B/C/D), quantize/swing controls

### LED Display
- Custom component mimicking green/amber segmented LED
- Context-dependent: BPM in play mode, sample name in edit, step position in step edit
- No waveform display (faithful to original)

### Pads
- Mouse: velocity mapped to click position (center = loud, edge = soft)
- Keyboard: A-S-D-F / Z-X-C-V for 8 pads
- Visual feedback on trigger
- Bank switching: 4 banks x 8 pads = 32 sample slots

### Faders
- Draggable vertical sliders styled as hardware faders
- Mode toggle: pitch vs. volume

### Transport & Mode Buttons
- Play, Stop, Record (with overdub)
- Pattern / Song mode toggle
- Step Edit enter/exit
- Sample Edit (truncate, loop, reverse)
- Tap Tempo

### Keyboard Shortcuts
- Spacebar: Play/Stop
- R: Record
- 1-8 or A-S-D-F / Z-X-C-V: Pads
- Arrow keys: Step edit navigation

### Responsive Behavior
Fixed aspect ratio, scales to fit viewport. No reflow — hardware replica.

---

## 4. Sampling & Sample Management

### File Upload
- Drag-and-drop (whole app surface or sample edit mode)
- File picker in sample edit mode
- Accepts WAV, MP3, OGG, FLAC
- On import: decode to PCM, resample to 26.04kHz, quantize to 12-bit, store in worklet

### Microphone Recording
- `getUserMedia()` for mic/line input
- Threshold trigger (recording starts when signal exceeds set level)
- Records into selected pad's sample slot
- Same 12-bit/26.04kHz processing on capture

### Memory Limitation (Authentic)
- 10.04 seconds total sample time
- ~2.5 seconds per bank (A/B/C/D)
- Remaining time shown in LED display during recording
- Enforced as part of the instrument's character

### Sample Editing
- **Truncate:** Start/end point adjustment by ear (no waveform view — faithful to original)
- **Loop:** Loop start/end with crossfade option
- **Reverse:** Flip sample buffer
- **Mix/Decay:** Per-pad volume and decay time

### Built-in Sample Library
- ~20-30 royalty-free drum sounds
- Categories: kicks, snares, hats, claps, percussion, bass hits
- Pre-processed through 12-bit/26.04kHz chain
- Loadable from menu to selected pad

### Storage & Persistence
- IndexedDB for local save/load (kits, patterns, projects)
- Export/Import as JSON bundles or full project files with embedded audio
- No cloud — everything local

---

## 5. Project Structure

```
sp1200/
├── index.html
├── css/
│   └── sp1200.css
├── js/
│   ├── main.js
│   ├── ui/
│   │   ├── pads.js
│   │   ├── faders.js
│   │   ├── display.js
│   │   ├── transport.js
│   │   └── sample-edit.js
│   ├── audio/
│   │   ├── sp1200-processor.js
│   │   ├── filters.js
│   │   └── sample-loader.js
│   ├── sequencer/
│   │   ├── pattern.js
│   │   ├── song.js
│   │   └── swing.js
│   └── storage/
│       ├── indexeddb.js
│       └── export.js
├── samples/
│   ├── kicks/
│   ├── snares/
│   ├── hats/
│   ├── claps/
│   ├── percussion/
│   └── bass/
└── assets/
    └── textures/
```

No build step for production. Vanilla JS with ES modules. Vite as dev server only (via pnpm). Zero runtime dependencies.

---

## 6. Communication Protocol (UI ↔ AudioWorklet)

Messages sent via `MessagePort.postMessage()`:

### UI → Worklet
- `{ type: 'trigger', pad, velocity }` — pad hit
- `{ type: 'stop-voice', pad }` — stop pad playback
- `{ type: 'load-sample', pad, buffer }` — load sample data (transferable)
- `{ type: 'set-param', param, pad, value }` — pitch, volume, decay, filter cutoff
- `{ type: 'transport', action }` — play, stop, record
- `{ type: 'set-bpm', bpm }` — tempo change
- `{ type: 'set-swing', amount }` — swing percentage
- `{ type: 'set-quantize', grid }` — quantize resolution
- `{ type: 'pattern-select', number }` — switch active pattern
- `{ type: 'step-edit', step, track, event }` — modify step data
- `{ type: 'song-chain', entries }` — set song arrangement
- `{ type: 'set-mode', mode }` — pattern/song/edit mode
- `{ type: 'auto-repeat', pad, enabled }` — toggle auto-repeat on pad hold

### Worklet → UI
- `{ type: 'tick', position, bar, beat, step }` — clock position for display
- `{ type: 'trigger-visual', pad }` — pad flash feedback
- `{ type: 'display-update', text, field }` — LED display content
- `{ type: 'pattern-end' }` — pattern looped
- `{ type: 'song-position', entry, pattern }` — song playback position
