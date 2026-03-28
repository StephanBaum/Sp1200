export function bindProgramming(s) {
  s.led('led-segment', true);

  document.querySelectorAll('.prog').forEach(btn => {
    const upper = btn.dataset.upper;
    const lower = btn.dataset.lower;
    s.progStates[btn.id] = 'lower'; // start on lower so first click → upper

    btn.addEventListener('click', () => {
      // Clear previous edit state
      if (s.editParam && s.editParam !== 'module-func') {
        s.editParam = null;
        s.display.unlock();
      }

      // Toggle which function
      const state = s.progStates[btn.id];
      const newState = state === 'upper' ? 'lower' : 'upper';
      s.progStates[btn.id] = newState;
      const func = newState === 'upper' ? upper : lower;

      // Clear all prog active states, set this one
      document.querySelectorAll('.prog').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Toggle Song/Segment LEDs for prog-1
      if (btn.id === 'prog-1') {
        s.led('led-song', newState === 'upper');
        s.led('led-segment', newState === 'lower');
      }

      execProgFunction(s, func, btn);
    });
  });
}

export function execProgFunction(s, func, btn) {
  const QUANT_GRIDS  = [96, 48, 32, 24, 16, 12, 1];
  const QUANT_LABELS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'HiRes'];

  switch (func) {
    case 'song':
      s.mode = 'song';
      s.engine.setMode('song');
      s.display.setSong(s.currentSong);
      s.display.setMode('song');
      break;

    case 'segment':
      s.mode = 'segment';
      s.engine.setMode('segment');
      s.editParam = 'segment';
      s.numericBuffer = '';
      s.display.setMode('segment');
      break;

    case 'trigger':
      btn.classList.toggle('active');
      break;

    case 'metronome':
      s.metronomeOn = !s.metronomeOn;
      s.engine.send({ type: 'set-metronome', enabled: s.metronomeOn });
      s.display.flash(
        s.metronomeOn ? 'Click On' : 'Click Off',
        s.metronomeOn ? 'Metronome on' : 'Metronome off'
      );
      break;

    case 'repeat':
      btn.classList.toggle('active');
      break;

    case 'swing':
      s.editParam = 'swing';
      s.moduleDisplay('Swing ' + s.swingAmount + '%', 'Use +/- arrows');
      break;

    case 'tabsong':
      s.display.setMode('TABSONG');
      break;

    case 'copy':
      s.editParam = 'copy';
      s.numericBuffer = '';
      s.moduleDisplay('Copy to?', 'Enter seg number');
      break;

    case 'end':
      s.engine.send({ type: 'song-end-mark' });
      s.display.flash('End Mark', 'Song end set');
      break;

    case 'time-sig':
      s.editParam = 'time-sig';
      s.numericBuffer = '';
      s.moduleDisplay('Time Sig', s.timeSig);
      break;

    case 'insert':
      s.engine.send({ type: 'song-insert', segment: s.currentSegment });
      s.display.flash('Insert', 'Seg inserted');
      break;

    case 'seg-length':
      s.editParam = 'seg-length';
      s.numericBuffer = '';
      s.moduleDisplay('Seg Length', s.segmentLength + ' Bars');
      break;

    case 'delete':
      s.engine.send({ type: 'song-delete' });
      s.display.flash('Delete', 'Step removed');
      break;

    case 'erase':
      if (s.playing) {
        s.eraseMode = !s.eraseMode;
        s.moduleDisplay(
          s.eraseMode ? 'Erase On' : 'Erase Off',
          s.eraseMode ? 'Hold pad' : ''
        );
      } else {
        s.editParam = 'erase-seg';
        s.numericBuffer = '';
        s.moduleDisplay('Erase Seg?', 'Enter seg number');
      }
      break;

    case 'tempo-change':
      s.editParam = 'bpm';
      s.numericBuffer = '';
      s.moduleDisplay('Tempo ' + Math.round(s.bpm), 'Use +/- or keys');
      break;

    case 'auto-correct':
      s.editParam = 'quantize';
      s.moduleDisplay('Auto-Correct', QUANT_LABELS[s.quantizeIndex]);
      break;

    case 'mix-change':
      s.display.setMode('MIX CHG');
      break;

    case 'step-program':
      s.stepProgramMode = !s.stepProgramMode;
      if (s.stepProgramMode) {
        s.mode = 'step-edit';
        s.engine.setMode('step-edit');
        s.led('led-record', true);
        s.led('led-run', false);
        document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: true, quantize: s.quantizeGrid, bars: s.segmentLength } }));
      } else {
        s.mode = 'segment';
        s.engine.setMode('segment');
        s.led('led-record', false);
        document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: false } }));
        s.display.setMode('segment');
      }
      break;
  }
}
