export function bindMasterControl(s) {
  s.bindBtn('btn-tempo', () => {
    s.editParam = 'bpm';
    s.numericBuffer = '';
    s.display.setMode('TEMPO');
    document.getElementById('btn-tempo').classList.add('active');
  });

  s.bindBtn('btn-nav-left', () => handleNav(s, -1));
  s.bindBtn('btn-nav-right', () => handleNav(s, 1));
  s.bindBtn('btn-enter', () => confirmEntry(s));
}

export function confirmEntry(s) {
  if (s.numericBuffer.length > 0) {
    const val = parseInt(s.numericBuffer, 10);

    switch (s.editParam) {
      case 'bpm':
        s.display.unlock();
        if (val >= 30 && val <= 250) {
          s.bpm = val;
          s.engine.setBpm(s.bpm);
          s.display.setBpm(s.bpm);
          s.display.flash('Tempo ' + Math.round(s.bpm), 'BPM set');
        } else {
          s.display.flash('Invalid BPM', '30-250 only');
        }
        break;

      case 'segment':
      case 'pattern':
        s.display.unlock();
        if (val >= 0 && val <= 99) {
          s.currentSegment = val;
          s.engine.selectPattern(s.currentSegment);
          s.display.setPattern(s.currentSegment);
          s.display.flash('Seg ' + String(val + 1).padStart(2, '0'), 'Selected');
        } else {
          s.display.flash('Invalid Seg', '0-99 only');
        }
        break;

      case 'seg-length':
        s.display.unlock();
        if (val >= 1 && val <= 99) {
          s.segmentLength = val;
          s.engine.send({ type: 'set-bars', bars: val });
          s.display.flash('Seg Length', val + ' Bars');
        } else {
          s.display.flash('Invalid', '1-99 bars');
        }
        break;

      case 'copy':
        s.display.unlock();
        if (val >= 0 && val <= 99) {
          s.engine.send({ type: 'copy-segment', from: s.currentSegment, to: val });
          s.display.flash('Copied', 'Seg ' + (s.currentSegment + 1) + ' > ' + (val + 1));
        } else {
          s.display.flash('Invalid Seg', '0-99 only');
        }
        break;

      case 'erase-seg':
        s.display.unlock();
        if (val >= 0 && val <= 99) {
          s.engine.send({ type: 'erase-segment', segment: val });
          s.display.flash('Erased', 'Seg ' + (val + 1));
        } else {
          s.display.flash('Invalid Seg', '0-99 only');
        }
        break;

      case 'swing':
        s.display.unlock();
        if (val >= 50 && val <= 75) {
          s.swingAmount = val;
          s.engine.setSwing(s.swingAmount);
          s.display.flash('Swing', val + '%');
        } else {
          s.display.flash('Invalid', '50-75% only');
        }
        break;

      case 'define-mix':
        s.display.unlock();
        if (val >= 1 && val <= 8) {
          s.engine.send({ type: 'define-mix', slot: val - 1 });
          s.display.flash('Mix ' + val, 'Saved');
        }
        break;
      case 'select-mix':
        s.display.unlock();
        if (val >= 1 && val <= 8) {
          s.engine.send({ type: 'select-mix', slot: val - 1 });
          s.display.flash('Mix ' + val, 'Recalled');
        }
        break;

      case 'channel-assign-num':
        if (s.numericBuffer.length > 0) {
          const ch = parseInt(s.numericBuffer, 10);
          if (ch >= 1 && ch <= 6) {
            s.engine.send({ type: 'channel-assign', pad: s._pendingPad, channel: ch });
            s.display.flash('Ch ' + ch, 'Pad ' + (s._pendingPad + 1));
          }
        }
        s._pendingPad = null;
        s.editParam = 'module-func';
        break;

      case 'click-divisor':
        if (s.numericBuffer.length > 0) {
          const div = parseInt(s.numericBuffer, 10);
          s.engine.send({ type: 'set-click-divisor', divisor: div });
          s.display.flash('Click Div', div.toString());
        }
        s.editParam = 'module-func';
        break;

      case 'disk-seg-num':
        if (s.numericBuffer.length > 0) {
          const segNum = parseInt(s.numericBuffer, 10);
          s.display.flash('Load Seg', String(segNum).padStart(2, '0'));
        }
        s.editParam = 'module-func';
        break;

      default:
        // No active edit param — treat as segment selection
        if (val >= 0 && val <= 99) {
          s.currentSegment = val;
          s.engine.selectPattern(s.currentSegment);
          s.display.setPattern(s.currentSegment);
        }
        break;
    }

    s.numericBuffer = '';
  } else {
    // No numeric buffer — handle confirm for non-numeric editParam states
    switch (s.editParam) {
      case 'sample-level':
        s.editParam = 'module-func';
        s.display.setLine1(s.vuPadLabel());
        document.dispatchEvent(new Event('sample-start-vu'));
        break;
      case 'smpte-rate':
        s.editParam = 'module-func';
        s.display.flash('SMPTE Set', s.smpteLabel());
        break;
    }
  }

  // Return to module-func if module is active, otherwise clear
  if (s.editParam !== 'module-func') {
    s.editParam = s.activeModule ? 'module-func' : null;
  }
  const tempoBtn = document.getElementById('btn-tempo');
  if (tempoBtn) tempoBtn.classList.remove('active');
  s.flashDisplay();
}

export function handleNav(s, dir) {
  const QUANT_GRIDS  = [96, 48, 32, 24, 16, 12, 1];
  const QUANT_LABELS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'HiRes'];
  const TIME_SIGS = ['4/4', '3/4', '6/8', '5/4', '7/8'];

  switch (s.editParam) {
    case 'bpm':
      s.bpm = Math.max(30, Math.min(250, s.bpm + dir));
      s.engine.setBpm(s.bpm);
      s.display.setBpm(s.bpm);
      s.moduleDisplay('Tempo ' + Math.round(s.bpm), 'BPM');
      break;
    case 'swing': {
      const SW = [50, 54, 58, 63, 67, 71];
      let si = SW.indexOf(s.swingAmount);
      if (si === -1) si = 0;
      si = Math.max(0, Math.min(SW.length - 1, si + dir));
      s.swingAmount = SW[si];
      s.engine.setSwing(s.swingAmount);
      s.moduleDisplay('Swing ' + s.swingAmount + '%', s.swingAmount === 50 ? 'No swing' : 'Swing active');
      break;
    }
    case 'quantize':
      s.quantizeIndex = Math.max(0, Math.min(QUANT_GRIDS.length - 1, s.quantizeIndex + dir));
      s.quantizeGrid = QUANT_GRIDS[s.quantizeIndex];
      s.engine.setQuantize(s.quantizeGrid);
      s.moduleDisplay('Auto-Correct', QUANT_LABELS[s.quantizeIndex]);
      break;
    case 'seg-length':
      s.segmentLength = Math.max(1, Math.min(99, s.segmentLength + dir));
      s.engine.send({ type: 'set-bars', bars: s.segmentLength });
      s.moduleDisplay('Seg Length', s.segmentLength + ' Bars');
      break;
    case 'time-sig': {
      const curIdx = TIME_SIGS.indexOf(s.timeSig);
      const newIdx = Math.max(0, Math.min(TIME_SIGS.length - 1, (curIdx === -1 ? 0 : curIdx) + dir));
      s.timeSig = TIME_SIGS[newIdx];
      s.engine.send({ type: 'set-time-sig', timeSig: s.timeSig });
      s.moduleDisplay('Time Sig', s.timeSig);
      break;
    }
    case 'sample-level': {
      const gains = ['0dB', '+20dB', '+40dB'];
      s.sampleGainIndex = Math.max(0, Math.min(gains.length - 1, s.sampleGainIndex + dir));
      s.moduleDisplay('Input Level', 'Gain: ' + gains[s.sampleGainIndex]);
      break;
    }
    case 'smpte-rate': {
      const rates = ['24fps', '25fps', '30fps', '30-drop'];
      s.smpteIndex = Math.max(0, Math.min(rates.length - 1, s.smpteIndex + dir));
      s.moduleDisplay('SMPTE Format is', rates[s.smpteIndex]);
      break;
    }
    case 'threshold':
    case 'sample-length':
    case 'disk-browse':
    case 'disk-name':
      break;
    default:
      if (s.mode === 'song') {
        s.currentSong = Math.max(0, Math.min(99, s.currentSong + dir));
        s.display.setSong(s.currentSong);
      } else {
        s.currentSegment = Math.max(0, Math.min(99, s.currentSegment + dir));
        s.engine.selectPattern(s.currentSegment);
        s.display.setPattern(s.currentSegment);
      }
      break;
  }
}
