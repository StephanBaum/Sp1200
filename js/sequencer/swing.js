import { PPQN } from '../constants.js';
const TICKS_PER_16TH = PPQN / 4;

export function getSwingOffset(tick, swingPercent) {
  if (swingPercent <= 50) return 0;
  const sixteenthIndex = Math.floor(tick / TICKS_PER_16TH);
  const posInSixteenth = tick % TICKS_PER_16TH;
  if (sixteenthIndex % 2 === 0 || posInSixteenth !== 0) return 0;
  const swingAmount = (swingPercent - 50) / 25;
  return Math.round(TICKS_PER_16TH * swingAmount * 0.5);
}

export function applySwing(tick, swingPercent) {
  return tick + getSwingOffset(tick, swingPercent);
}
