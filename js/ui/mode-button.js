export function bindModeButton(s) {
  const modes = ['volume', 'pitch'];
  const labels = ['MIX', 'TUNE'];
  const ledIds = ['led-mix', 'led-tune'];
  let modeIndex = 0;
  s.led('led-mix', true); // MIX active by default

  const btn = document.getElementById('btn-mode');
  if (!btn) return;

  btn.addEventListener('click', () => {
    modeIndex = (modeIndex + 1) % modes.length;
    s.faderMode = modes[modeIndex];
    document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: s.faderMode } }));
    s.display.flash(labels[modeIndex], 'Mode selected');
    ledIds.forEach(id => s.led(id, false));
    s.led(ledIds[modeIndex], true);
  });
}
