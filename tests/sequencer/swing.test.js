import { describe, it, expect } from 'vitest';
import { applySwing, getSwingOffset } from '../../js/sequencer/swing.js';
import { PPQN } from '../../js/constants.js';

describe('swing', () => {
  const ticksPer16th = PPQN / 4;
  it('returns 0 offset at 50% swing (straight)', () => {
    expect(getSwingOffset(0, 50)).toBe(0);
    expect(getSwingOffset(ticksPer16th, 50)).toBe(0);
    expect(getSwingOffset(ticksPer16th * 2, 50)).toBe(0);
  });
  it('delays even-numbered 16th notes at swing > 50%', () => {
    const offset = getSwingOffset(ticksPer16th, 66);
    expect(offset).toBeGreaterThan(0);
  });
  it('does not delay odd-numbered 16th notes', () => {
    expect(getSwingOffset(0, 66)).toBe(0);
    expect(getSwingOffset(ticksPer16th * 2, 66)).toBe(0);
  });
  it('applies maximum delay at 75% swing', () => {
    const offset = getSwingOffset(ticksPer16th, 75);
    expect(offset).toBe(Math.round(ticksPer16th * 0.5));
  });
  it('applySwing adjusts a tick position', () => {
    const adjusted = applySwing(ticksPer16th, 66);
    expect(adjusted).toBeGreaterThan(ticksPer16th);
  });
});
