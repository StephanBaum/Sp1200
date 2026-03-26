import { describe, it, expect } from 'vitest';
import { SP_SAMPLE_RATE, SP_BIT_DEPTH } from '../js/constants.js';

describe('constants', () => {
  it('has correct SP-1200 sample rate', () => {
    expect(SP_SAMPLE_RATE).toBe(26040);
  });
  it('has correct bit depth', () => {
    expect(SP_BIT_DEPTH).toBe(12);
  });
});
