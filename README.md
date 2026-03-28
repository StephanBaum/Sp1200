# SP-1200 Digital Replica

A browser-based 1:1 digital replica of the E-MU / Rossum SP-1200 Sampling Percussion drum machine, built with vanilla JavaScript and the Web Audio API.

The goal is to faithfully reproduce the original hardware's behavior, workflow, and interface — not a modern reinterpretation, but an accurate digital duplicate that functions exactly like the real unit.

## Features

### Audio Engine
- **12-bit, 26040 Hz** sampling — authentic SP-1200 DAC character
- 8 pads per bank, 4 banks (A-D), 32 total pads
- 10.04 seconds total sample memory (2.51s per bank)
- Bit-crushing and resampling pipeline matching the original hardware
- Real-time sample playback via AudioWorklet

### Sequencer
- 96 PPQN timing resolution
- Pattern-based recording (real-time and step program)
- 99 segments, 99 songs
- SP-1200 swing values (50%, 54%, 58%, 63%, 67%, 71%)
- Auto-correct quantize (1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32, Hi-Res)
- Tap tempo with repeat/retrigger

### Modules (matching hardware)
- **Sample** — VU meter monitoring, assign voice, input level, threshold, arm/force sampling, resample
- **Sync** — Internal clock, MIDI, SMPTE (24/25/30/30-drop fps), click divisor
- **Disk** — Load/save sequences, sounds, and complete projects
- **Set Up** — Multi-pitch, multi-level, dynamic buttons, channel assign, decay/tune select, dynamic allocation, reverse sound

### Interface
- Photo-realistic panel with sprite-based controls from the actual hardware
- 2-line 16-character LCD display with bar graph overlay
- 8 vertical faders with authentic absolute-on-touch behavior (values only written when fader is moved, mode switching preserves stored values)
- 3 rotary knobs (Gain, Mix Volume, Metronome Volume)
- Full keyboard mapping for all controls

### Keyboard Shortcuts

| Key | Function |
|-----|----------|
| 1-8 | Trigger pads |
| Space | Run/Stop |
| Ctrl+Space | Record + Play |
| Q-I / A-K | Faders up/down |
| Y | Mode (Mix/Tune) |
| [ ] | Mode/Bank cycle |
| Arrow keys | Navigate / adjust values |
| Numpad 0-9 | SP-1200 keypad |
| Enter | Confirm |
| Backtick | Tap tempo (hold for repeat) |
| F1-F4 | Set Up / Disk / Sync / Sample |
| Tab | Song/Segment toggle |
| Home | Tempo |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in Chrome. Click anywhere to initialize the audio engine.

## Sampling

Enter the Sample module (F4) and use:
- **Option 7** (Arm) — waits for audio threshold, then records
- **Option 9** (Force) — records immediately

The browser will prompt for audio source — select a tab or screen to capture system audio, or use the microphone.

Drag and drop audio files onto the device to load samples directly.

## Testing

```bash
pnpm test:run
```

## Tech Stack

- Vanilla JavaScript (no framework)
- Web Audio API with AudioWorklet
- Vite (dev server + build)
- Vitest (testing)

## Project Structure

```
js/
  audio/       Audio engine, sample loader, AudioWorklet processor
  dsp/         Bitcrusher, filters, mixer, resampler, voice
  sequencer/   Clock, pattern, song, swing
  storage/     Export, IndexedDB persistence
  ui/          Display, faders, keyboard, pads, transport, step-edit
assets/        Panel image, control sprites
css/           Styling
samples/       Default sample kit
screens/       Reference screenshots from real hardware
docs/          Manual, function reference, design docs
tests/         Vitest test suite
```

## License

ISC
