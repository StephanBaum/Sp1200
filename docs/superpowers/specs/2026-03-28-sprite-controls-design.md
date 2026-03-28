# SP-1200 Sprite-Based Controls UI Overhaul

## Goal
Replace magenta debug overlay buttons with real control sprites from `controls.png`, using `sp1200-panel_blank.png` as the background. Make the device larger on screen for readability.

## Background Image
- Switch from `sp1200-panel.png` to `sp1200-panel_blank.png`
- The blank panel has labels, LED holes, and surface graphics but no controls

## Sprite Sheet: `controls.png` (1000x1000)
Six control elements arranged left-to-right:

| Element | Approx Region | Usage |
|---|---|---|
| White button unlit | bottom-left ~80x80 | Default state for all white buttons |
| White button lit | top-left ~110x110 (with glow) | Active/pressed state |
| Red button unlit | bottom-left-center ~80x80 | Default state for record/sample |
| Red button lit | top-left-center ~110x110 (with glow) | Active state |
| Pad | center ~180x180 | 8 drum pads |
| Fader | center-right ~100x180 | 8 vertical faders (sprite rotated 90° for vertical use) |
| Knob | right ~170x170 | 3 rotary knobs |

## Control Mapping

### White Buttons (unlit/lit sprite swap)
- Module Select: btn-setup, btn-disk, btn-sync, btn-sample
- Master Control: btn-tempo, btn-nav-left, btn-nav-right, btn-enter
- Numeric Keypad: keys 0-9 (text labels rendered in HTML over sprite)
- Programming: prog-1 through prog-9 (dual-function text labels in HTML)
- Performance: btn-mode, btn-bank
- Transport: btn-tap-tempo, btn-run-stop

### Red Buttons (unlit/lit sprite swap)
- btn-record

### Pads (pad sprite)
- 8 pads, data-pad 0-7
- Press: slight translateY(1px) + scale(0.97)
- Triggered: brief brightness flash

### Faders (fader sprite as track, thumb moves via JS)
- 8 faders, vertical orientation
- Sprite provides the track visual
- Existing JS drag logic moves a thumb element on top
- Fader thumb: extract from sprite or use CSS-styled element

### Knobs (knob sprite, existing rotation logic)
- 3 knobs: knob-gain, knob-mix-vol, knob-metro-vol
- Sprite provides the knob visual
- Existing JS drag-to-rotate logic unchanged, applies CSS transform

## Press Animation
- Buttons: `translateY(1px) scale(0.97)` on `:active`
- Lit/glow sprite swaps in on `.active` class (toggle state)
- Transition: 50ms for snappy feel

## Button Labels
- Programming buttons: upper/lower function names rendered as HTML text over the sprite
- Keypad: digit text rendered in HTML
- All labels use the panel's gold/cream text color

## Device Sizing
- Increase from `min(98vw, 99vh)` to `min(98vw, 130vh)` or similar
- Increase `max-width` from 1800px to 2400px
- Allow vertical scrolling if needed on smaller screens

## Files Modified
- `index.html` — swap panel img src, add text labels to buttons
- `css/sp1200.css` — replace all debug styles with sprite-based styles, increase sizing
- No JS changes needed (existing event handlers work on the same element IDs)
