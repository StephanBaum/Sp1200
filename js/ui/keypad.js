import { handleModuleFunction } from './modules.js';
import { confirmEntry } from './master-control.js';

export function bindKeypad(s) {
  // Digits 0-9. Key 7 also = No, Key 9 also = Yes (dual function)
  document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;

      // If a module is active, route digits to module functions
      // This takes priority over any other numeric entry
      if (s.activeModule && (s.editParam === 'module-func' || !s.editParam || s.editParam === 'select-pad')) {
        // If we're in a sub-flow (select-pad, confirmation, etc.),
        // the sub-flow handlers below will catch it.
        // Only route to module-func if editParam allows it.
        if (s.editParam === 'module-func' || !s.editParam) {
          s.editParam = 'module-func';
          s.numericBuffer += key;
          s.moduleDisplay(s.activeModule.toUpperCase() + ' ' + s.numericBuffer, 'Enter option #');
          // Setup uses 2-digit numbers (11-23), others use 1 digit
          if (s.activeModule === 'setup' && s.numericBuffer.length >= 2) {
            handleModuleFunction(s, parseInt(s.numericBuffer, 10));
          } else if (s.activeModule !== 'setup') {
            handleModuleFunction(s, parseInt(s.numericBuffer, 10));
          }
          return;
        }
      }

      // Yes/No confirmation flows (Key 9 = Yes, Key 7 = No)
      if (s.editParam === 'exit-multi-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'exit-multi' });
          s.multiMode = null;
          s.led('led-multi', false);
          s.display.flash('Exit Multi', 'Done');
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'dynamic-confirm') {
        if (key === '9') {
          s.dynamicButtons = true;
          s.engine.send({ type: 'dynamic-buttons', enabled: true });
          s.display.flash('Dynamic Btns', 'On');
        } else if (key === '7') {
          s.dynamicButtons = false;
          s.engine.send({ type: 'dynamic-buttons', enabled: false });
          s.display.flash('Dynamic Btns', 'Off');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'dynamic-alloc-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'dynamic-alloc', enabled: true });
          s.display.flash('Dyn Alloc', 'On');
        } else if (key === '7') {
          s.engine.send({ type: 'dynamic-alloc', enabled: false });
          s.display.flash('Dyn Alloc', 'Off');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'reverse-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'reverse-sound', pad: s._pendingPad });
          s.display.flash('Reversed', 'Pad ' + (s._pendingPad + 1));
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        s._pendingPad = null;
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'decay-tune-select') {
        if (key === '1') {
          s.engine.send({ type: 'set-pad-mode', pad: s._pendingPad, mode: 'tune' });
          s.display.flash('Pad ' + (s._pendingPad + 1), 'Tune');
        } else if (key === '2') {
          s.engine.send({ type: 'set-pad-mode', pad: s._pendingPad, mode: 'decay' });
          s.display.flash('Pad ' + (s._pendingPad + 1), 'Decay');
        }
        s._pendingPad = null;
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'channel-assign-num') {
        if (key >= '1' && key <= '6') {
          s.numericBuffer = key;
          s.moduleDisplay('Ch ' + key + ' assigned', 'Pad ' + (s._pendingPad + 1));
        }
        return;
      }

      if (s.editParam === 'sample-level' || s.editParam === 'smpte-rate' || s.editParam === 'threshold' || s.editParam === 'sample-length') {
        return;
      }

      if (s.editParam === 'click-divisor') {
        s.numericBuffer += key;
        s.moduleDisplay('Click Divisor', s.numericBuffer);
        return;
      }

      if (s.editParam === 'disk-browse' || s.editParam === 'disk-name') {
        return;
      }

      if (s.editParam === 'disk-seg-num') {
        s.numericBuffer += key;
        s.moduleDisplay('Load Segment #', s.numericBuffer);
        if (s.numericBuffer.length >= 2) confirmEntry(s);
        return;
      }

      // Normal numeric entry
      s.numericBuffer += key;
      if (s.editParam === 'bpm') {
        s.moduleDisplay('Tempo ' + s.numericBuffer, 'Enter to confirm');
        if (s.numericBuffer.length >= 3) confirmEntry(s);
      } else if (s.editParam === 'segment' || s.editParam === 'copy' || s.editParam === 'erase-seg') {
        s.moduleDisplay('Seg ' + s.numericBuffer, 'Enter to confirm');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      } else if (s.editParam === 'seg-length') {
        s.moduleDisplay('Bars: ' + s.numericBuffer, 'Enter to confirm');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      } else if (s.editParam === 'swing') {
        s.moduleDisplay('Swing ' + s.numericBuffer + '%', 'Enter to confirm');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      } else {
        // No active edit — treat as segment selection
        if (!s.editParam) s.editParam = 'segment';
        s.moduleDisplay('Seg ' + s.numericBuffer, '');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      }
    });
  });
}
