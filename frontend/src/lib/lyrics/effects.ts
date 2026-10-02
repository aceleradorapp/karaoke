import {
  FILL_PERCENT_DEFAULT,
  LYRICS_EFFECT_IDS,
  type LyricLine,
  type LyricsEffectId,
} from '@caraoke/shared';

export interface WordToken {
  text: string;
  start?: number;
  end?: number;
}

export interface EffectInput {
  line: LyricLine;
  tokens: readonly WordToken[];
  time: number;
  fillPercent: number;
}

export interface LyricsEffect {
  id: LyricsEffectId;
  label: string;
  description: string;
  progress: (input: EffectInput) => number[];
}

export interface LyricsEffectSettings {
  enabled: boolean;
  id: LyricsEffectId;
  fillPercent: number;
}

export const DEFAULT_EFFECT_SETTINGS: LyricsEffectSettings = {
  enabled: true,
  id: 'smooth',
  fillPercent: FILL_PERCENT_DEFAULT,
};

const PERCENT = 100;

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function tokensOf(line: LyricLine): WordToken[] {
  if (line.words?.length) {
    return line.words.map((word) => ({ text: word.text, start: word.start, end: word.end }));
  }
  return splitWords(line.text).map((text) => ({ text }));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function progressBetween(start: number, end: number, time: number): number {
  if (end <= start) return time >= start ? 1 : 0;
  return clamp01((time - start) / (end - start));
}

export function nominalTime(line: LyricLine, time: number, fillPercent: number): number {
  const percent = Math.max(fillPercent, 1);
  return line.start + ((time - line.start) * PERCENT) / percent;
}

export function wordShares(tokens: readonly WordToken[]): Array<{ from: number; to: number }> {
  const total = tokens.reduce((sum, token) => sum + token.text.length, 0);
  let passed = 0;
  return tokens.map((token) => {
    const from = total === 0 ? 0 : passed / total;
    passed += token.text.length;
    return { from, to: total === 0 ? 0 : passed / total };
  });
}

function hasOwnTimes(tokens: readonly WordToken[]): boolean {
  return tokens.length > 0 && tokens.every((token) => token.start !== undefined && token.end !== undefined);
}

const smooth: LyricsEffect = {
  id: 'smooth',
  label: 'Preencher aos poucos',
  description: 'A cor vai enchendo a letra da esquerda para a direita, como uma barra.',
  progress: ({ line, tokens, time, fillPercent }) => {
    const nominal = nominalTime(line, time, fillPercent);
    if (hasOwnTimes(tokens)) {
      return tokens.map((token) => progressBetween(token.start as number, token.end as number, nominal));
    }
    const lineProgress = progressBetween(line.start, line.end, nominal);
    return wordShares(tokens).map(({ from, to }) =>
      to <= from ? 0 : clamp01((lineProgress - from) / (to - from)),
    );
  },
};

const words: LyricsEffect = {
  id: 'words',
  label: 'Palavra por palavra',
  description: 'Cada palavra fica toda colorida de uma vez, na hora em que chega a vez dela.',
  progress: ({ line, tokens, time, fillPercent }) => {
    const nominal = nominalTime(line, time, fillPercent);
    if (hasOwnTimes(tokens)) return tokens.map((token) => (nominal >= (token.start as number) ? 1 : 0));
    const lineProgress = progressBetween(line.start, line.end, nominal);
    const reached = nominal >= line.start;
    return wordShares(tokens).map(({ from }) => (reached && lineProgress >= from ? 1 : 0));
  },
};

export const LYRICS_EFFECTS: Record<LyricsEffectId, LyricsEffect> = { smooth, words };

export const LYRICS_EFFECT_LIST: LyricsEffect[] = LYRICS_EFFECT_IDS.map((id) => LYRICS_EFFECTS[id]);

export function computeProgress(
  settings: LyricsEffectSettings,
  input: Omit<EffectInput, 'fillPercent'>,
): number[] {
  if (!settings.enabled) return input.tokens.map(() => 1);
  return LYRICS_EFFECTS[settings.id].progress({ ...input, fillPercent: settings.fillPercent });
}
