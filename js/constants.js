export const SP_SAMPLE_RATE = 26040;
export const SP_BIT_DEPTH = 12;
export const SP_MAX_VALUE = 2 ** (SP_BIT_DEPTH - 1) - 1;
export const SP_MIN_VALUE = -(2 ** (SP_BIT_DEPTH - 1));
export const SP_LEVELS = 2 ** SP_BIT_DEPTH;

export const OUTPUT_SAMPLE_RATE = 44100;

export const NUM_PADS = 8;
export const NUM_BANKS = 4;
export const TOTAL_PADS = NUM_PADS * NUM_BANKS;

export const TOTAL_SAMPLE_TIME = 10.04;
export const BANK_SAMPLE_TIME = 2.51;

export const BANK_SAMPLE_FRAMES = Math.floor(BANK_SAMPLE_TIME * SP_SAMPLE_RATE);
export const TOTAL_SAMPLE_FRAMES = Math.floor(TOTAL_SAMPLE_TIME * SP_SAMPLE_RATE);

export const PPQN = 96;

export const QUANTIZE_GRIDS = {
  '1/4': PPQN,
  '1/8': PPQN / 2,
  '1/8T': PPQN / 3,
  '1/16': PPQN / 4,
  '1/16T': PPQN / 6,
  '1/32': PPQN / 8,
};

export const MAX_PATTERNS = 99;
export const MAX_BARS = 4;
export const MAX_SONG_ENTRIES = 99;

export const BPM_MIN = 30;
export const BPM_MAX = 250;
export const BPM_DEFAULT = 90;

export const SWING_MIN = 50;
export const SWING_MAX = 75;

export const BANK_NAMES = ['A', 'B', 'C', 'D'];

export const FILTER_DYNAMIC = [0, 1];
export const FILTER_FIXED = [2, 3, 4, 5];
export const FILTER_NONE = [6, 7];
