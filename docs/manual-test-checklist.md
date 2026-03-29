# SP-1200 Manual Test Checklist

Run through this after any UI changes. Each item is a specific action → expected result.

## Transport
- [ ] Press Run → sequencer plays, Run LED on, bar/beat display updates
- [ ] Press Stop → silence, LEDs off, display shows Seg XX
- [ ] Press Record then Run → both LEDs on, pads record notes
- [ ] While playing: press Record → record LED toggles, pad hits stop recording when LED off
- [ ] Press Stop → both LEDs off, recording stops
- [ ] Play recorded pattern → notes play back with correct sounds
- [ ] Tap Tempo → tap 4+ times, BPM updates

## Segment Mode
- [ ] Type 2-digit number → selects that segment (1-indexed: type 05 = Seg 05)
- [ ] Arrows change segment ±1
- [ ] Tempo button → shows BPM, arrows adjust, Enter confirms
- [ ] Segment Length → type bars, Enter confirms. Shorten = Truncate? Y/N
- [ ] Copy → type destination segment number
- [ ] Erase while stopped → type segment number to erase
- [ ] Erase while playing → toggle on, hold pad, notes erased as playhead passes
- [ ] Swing → arrows cycle 50/54/58/63/67/71%
- [ ] Auto-Correct → arrows cycle 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32, HiRes
- [ ] Metronome → toggles click on/off
- [ ] Time Sig → arrows cycle 4/4, 3/4, 6/8, 5/4, 7/8

## Song Mode
- [ ] Press Song/Segment → toggles mode, LEDs switch
- [ ] Record in song mode → enters song edit (type segment numbers)
- [ ] Type segment numbers → adds steps, stays in edit for more
- [ ] Record again → exits song edit
- [ ] Press Run in song mode → plays chained segments

## Banks
- [ ] Bank button cycles A→B→C→D→A, LEDs update
- [ ] Load sample to Bank B via right-click → plays on Bank B pads only
- [ ] Switch banks while playing → recorded notes keep playing, pads switch
- [ ] Record on Bank B → notes play Bank B sounds on playback

## Pads & Recording
- [ ] Hit pad → sound plays with velocity
- [ ] Record + hit pads → notes recorded at correct positions
- [ ] Play back → recorded notes play with correct pitch/volume/decay
- [ ] Different pitch per note → pitch stored per-event, plays back correctly
- [ ] Right-click pad → file picker → loads sample to that pad + bank

## Sample Module
- [ ] Press Sample → VU mode with pad label + meter
- [ ] Hit pads → selects pad, shows briefly, returns to VU with new pad label
- [ ] Press 2 → Assign Voice, select pad, type channel
- [ ] Press 3 → Input Gain, arrows cycle +00/+20/+40
- [ ] Press 4 → Threshold, slider adjusts marker on live VU, arrows adjust ±5%
- [ ] Press 5 → Sample Length, slider adjusts 0.1-2.5s, arrows adjust ±0.1s
- [ ] Press 6 → Resample Y/N
- [ ] Press 7 → Arm Sampling (waits for threshold)
- [ ] Press 8 → System Audio share prompt, returns to VU after
- [ ] Press 9 → Force Sample, records immediately
- [ ] After recording → "Sample is Good", returns to VU mode
- [ ] All functions accessible via single digit in VU mode

## Setup Module
- [ ] Press Setup → "SET UP Enter option #"
- [ ] Type 11 → Multi-Pitch: select pad → all pads play that sample at different pitches
- [ ] Type 12 → Multi-Level: select pad → all pads play at different volumes
- [ ] Type 13 → Exit Multi Mode: Y/N
- [ ] Type 14 → Dynamic Buttons: Y/N toggles velocity
- [ ] Type 15 → Define Mix: type 1-8 saves mix, flash confirms
- [ ] Type 16 → Select Mix: type 1-8 recalls mix, flash confirms
- [ ] Type 17 → Channel Assign: tap pads to see channel, type # to change, Enter exits
- [ ] Type 18 → Decay/Tune: tap pads to see TUNED/DECAYED, type 1/2 to change, Enter exits
- [ ] Type 19 → Truncate: tap pads to switch, faders adjust S/E/L, Enter → permanent Y/N
- [ ] Type 20 → Delete: tap pad → Y/N, tap next pad → shows new Y/N
- [ ] Type 21 → First Song Step: type 2-digit step
- [ ] Type 22 → MIDI Params: type channel, then 1/2 for omni/poly
- [ ] Type 23 → Special Menu: slider/arrows browse, Enter selects, type number works
- [ ] Type 25 → Reverse: tap pad → Y/N, tap next pad
- [ ] All Y/N confirmations auto-return to module home after flash
- [ ] All per-pad functions: pads switch samples, never exit the function
- [ ] Enter exits any function back to module home
- [ ] Setup button exits module entirely

## Special Menu (Setup 23)
- [ ] 11 → Catalog: returns to browsable list
- [ ] 12 → Clear All: Y/N
- [ ] 13 → Memory Remaining: shows seconds + seq %
- [ ] 15 → Clear Sounds: Y/N
- [ ] 16 → Clear Sequences: Y/N
- [ ] 17 → Copy Sound: source pad → dest pad
- [ ] 18 → Swap Sounds: first pad → second pad
- [ ] 19 → Default Decay: slider/arrows adjust
- [ ] 21 → Name Sound: select pad → character entry
- [ ] 22 → Dynamic Alloc: Y/N
- [ ] 25 → Reverse: Y/N per pad

## Sync Module
- [ ] 1 → Internal: flash confirms
- [ ] 2 → MIDI: flash confirms
- [ ] 3 → SMPTE: arrows select fps, Enter confirms
- [ ] 4 → Click Divisor: type number

## Disk Module
- [ ] Enter Disk → prompts folder selection (first time)
- [ ] 0 → Load All: browse → enter project folder → loads
- [ ] 1 → Save Sequences: browse → saves
- [ ] 2 → Save Sounds: browse → saves
- [ ] 3 → Load Sequences: browse → loads
- [ ] 5 → Load Sounds: browse → loads
- [ ] 7 → Catalog Sequences: slider/arrows browse entries
- [ ] 8 → Catalog Sounds: slider/arrows browse entries
- [ ] 9 → Save All As: character entry → saves to root folder
- [ ] 27 → Create Folder: character entry → creates
- [ ] Navigate into folders with Enter, ../ to go up
- [ ] Project auto-detected when entering folder with project.json

## Display
- [ ] Default: Seg XX ♪BPM
- [ ] Playing: Bar:X Beat:Y (wraps at segment length)
- [ ] Module active: function screen stays, never flashes to default
- [ ] Flash messages auto-revert to current function screen
- [ ] Fader visuals (mix/tune bars) only show when no module active
- [ ] VU meter: CSS bar with peak hold line + optional threshold marker

## Mute Groups
- [ ] Assign two pads to same channel (Setup 17)
- [ ] Hit one → hit the other → first cuts off
