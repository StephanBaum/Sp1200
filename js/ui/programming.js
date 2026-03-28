export function bindProgramming(s) {
  s.led('led-segment', true);

  document.querySelectorAll('.prog').forEach(btn => {
    const upper = btn.dataset.upper;
    const lower = btn.dataset.lower;
    s.progStates[btn.id] = 'lower';

    btn.addEventListener('click', () => {
      // Clear previous edit state
      if (s.editParam && s.editParam !== 'module-func') {
        s.editParam = null;
        s.display.unlock();
      }

      const state = s.progStates[btn.id];
      const newState = state === 'upper' ? 'lower' : 'upper';
      s.progStates[btn.id] = newState;
      const func = newState === 'upper' ? upper : lower;

      document.querySelectorAll('.prog').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

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
      // Tab Song — view/edit song arrangement (list of segments)
      if (s.mode === 'song') {
        s.editParam = 'tabsong';
        s._tabSongStep = 0;
        s.moduleDisplay('Song ' + String(s.currentSong + 1).padStart(2, '0'),
          'Step 01: Seg ' + String(s.currentSegment + 1).padStart(2, '0'));
      } else {
        s.display.flash('Song Mode', 'Required');
      }
      break;

    case 'copy':
      s.editParam = 'copy';
      s.numericBuffer = '';
      s.moduleDisplay('Copy Seg ' + String(s.currentSegment + 1).padStart(2, '0'), 'To seg #?');
      break;

    case 'end':
      // End mark — only in song mode
      if (s.mode === 'song') {
        s.engine.send({ type: 'song-end-mark', song: s.currentSong });
        s.display.flash('End Mark', 'Song end set');
      } else {
        s.display.flash('Song Mode', 'Required');
      }
      break;

    case 'time-sig':
      s.editParam = 'time-sig';
      s.numericBuffer = '';
      s.moduleDisplay('Time Sig', s.timeSig);
      break;

    case 'insert':
      // Insert — only in song mode
      if (s.mode === 'song') {
        s.engine.send({ type: 'song-insert', song: s.currentSong, segment: s.currentSegment });
        s.display.flash('Insert', 'Seg inserted');
      } else {
        s.display.flash('Song Mode', 'Required');
      }
      break;

    case 'seg-length':
      s.editParam = 'seg-length';
      s.numericBuffer = '';
      s.moduleDisplay('Seg Length', s.segmentLength + ' Bars');
      break;

    case 'delete':
      // Delete — only in song mode
      if (s.mode === 'song') {
        s.engine.send({ type: 'song-delete', song: s.currentSong });
        s.display.flash('Delete', 'Step removed');
      } else {
        s.display.flash('Song Mode', 'Required');
      }
      break;

    case 'erase':
      if (s.playing) {
        // Real-time erase: hold erase + hold pad to delete hits as playhead passes
        s.eraseMode = !s.eraseMode;
        s.moduleDisplay(
          s.eraseMode ? 'Erase On' : 'Erase Off',
          s.eraseMode ? 'Hold pad' : ''
        );
      } else {
        // Stopped: prompt for segment number to erase
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
      // Mix Change — in song mode, insert a mix-change step
      if (s.mode === 'song') {
        s.editParam = 'mix-change';
        s.numericBuffer = '';
        s.moduleDisplay('Mix Change', 'Enter mix # 1-8');
      } else {
        s.display.flash('Song Mode', 'Required');
      }
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
