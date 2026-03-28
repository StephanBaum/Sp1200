export function bindBanks(s) {
  // Quantize select dropdown
  const sel = document.getElementById('quantize-select');
  if (sel) sel.addEventListener('change', (e) => {
    s.quantizeGrid = parseInt(e.target.value, 10);
    s.engine.setQuantize(s.quantizeGrid);
  });

  // Swing slider
  const slider = document.getElementById('swing-slider');
  const label = document.getElementById('swing-value');
  if (slider) slider.addEventListener('input', () => {
    s.swingAmount = parseInt(slider.value, 10);
    if (label) label.textContent = s.swingAmount + '%';
    s.engine.setSwing(s.swingAmount);
  });

  // Single cycling bank button (A → B → C → D → A)
  let currentBank = 0;
  const bankLeds = ['led-bank-a', 'led-bank-b', 'led-bank-c', 'led-bank-d'];
  s.led('led-bank-a', true); // Bank A active by default
  const bankBtn = document.getElementById('btn-bank');
  if (bankBtn) {
    bankBtn.addEventListener('click', () => {
      currentBank = (currentBank + 1) % 4;
      s.display.setBank(currentBank);
      document.dispatchEvent(new CustomEvent('bank-change', { detail: { bank: currentBank } }));
      bankLeds.forEach(id => s.led(id, false));
      s.led(bankLeds[currentBank], true);
    });
  }
}
