export const LYRICS_EFFECT_IDS = ['smooth', 'words'] as const;

export type LyricsEffectId = (typeof LYRICS_EFFECT_IDS)[number];

export const DEFAULT_LYRICS_EFFECT_ID: LyricsEffectId = 'smooth';

export const FILL_PERCENT_MIN = 20;
export const FILL_PERCENT_MAX = 150;
export const FILL_PERCENT_DEFAULT = 100;
export const FILL_PERCENT_STEP = 5;
