export function bindPadActions(s) {
  document.querySelectorAll('.pad').forEach(el => {
    el.addEventListener('mousedown', () => {
      const pad = parseInt(el.dataset.pad, 10);
      if (s.editParam === 'select-pad' && s.pendingAction) {
        switch (s.pendingAction) {
          case 'multi-pitch':
            s.engine.send({ type: 'multi-pitch', pad });
            s.multiMode = 'pitch';
            s.led('led-multi', true);
            s.led('led-tune', true);
            s.led('led-mix', false);
            s.faderMode = 'pitch';
            document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'pitch' } }));
            s.display.flash('Multi Pitch', 'Pad ' + (pad + 1));
            break;
          case 'multi-level':
            s.engine.send({ type: 'multi-level', pad });
            s.multiMode = 'level';
            s.led('led-multi', true);
            s.led('led-mix', true);
            s.led('led-tune', false);
            s.faderMode = 'volume';
            document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'volume' } }));
            s.display.flash('Multi Level', 'Pad ' + (pad + 1));
            break;
          case 'delete-sound':
            s.engine.send({ type: 'delete-sound', pad });
            s.display.flash('Deleted', 'Pad ' + (pad + 1));
            break;
          case 'decay-tune':
            s._pendingPad = pad;
            s.editParam = 'decay-tune-select';
            s.pendingAction = null;
            s.moduleDisplay('Pad ' + (pad + 1), '1=Tune 2=Decay');
            break;
          case 'truncate':
            s.display.flash('Truncate', 'Pad ' + (pad + 1) + ' Use faders');
            break;
          case 'channel-assign':
            s._pendingPad = pad;
            s.editParam = 'channel-assign-num';
            s.pendingAction = null;
            s.moduleDisplay('Pad ' + (pad + 1), 'Enter ch 1-6');
            break;
          case 'reverse-sound':
            s._pendingPad = pad;
            s.editParam = 'reverse-confirm';
            s.pendingAction = null;
            s.moduleDisplay('Reverse ' + ['A','B','C','D'][s.currentBank] + (pad + 1), 'Yes=9 No=7');
            break;
          case 'assign-voice':
            s.selectedSamplePad = pad;
            s.display.flash('Sampling', ['A','B','C','D'][s.currentBank] + (pad + 1));
            s.editParam = 'module-func';
            s.pendingAction = null;
            break;
          case 'load-sound-pad':
            s.display.flash('Load Sound', 'Pad ' + (pad + 1));
            s.editParam = 'module-func';
            s.pendingAction = null;
            break;
        }
        // Return to module-func if still in a module, otherwise clear
        if (s.editParam === 'select-pad') {
          s.editParam = s.activeModule ? 'module-func' : null;
        }
        if (s.pendingAction && s.editParam !== 'select-pad') s.pendingAction = null;
      } else if (s.eraseMode && s.playing) {
        // Real-time erase: pad held while playing erases that pad's events
        s.engine.send({ type: 'erase-track', pad });
      } else if (s.tapRepeatHeld) {
        // Tap/Repeat held + pad → retrigger at autocorrect rate
        const repeatPad = pad;
        const msPerQuarter = 60000 / s.bpm;
        const msPerStep = msPerQuarter * s.quantizeGrid / 96;
        if (s._repeatInterval) clearInterval(s._repeatInterval);
        s._repeatInterval = setInterval(() => {
          if (!s.tapRepeatHeld) { clearInterval(s._repeatInterval); s._repeatInterval = null; return; }
          s.engine.trigger(repeatPad, 100);
        }, Math.max(30, msPerStep));
      } else if (s.activeModule && !s.pendingAction) {
        // Pad clicked while module active but no pending action → exit module
        s.exitModule();
      }
    });
  });
}
