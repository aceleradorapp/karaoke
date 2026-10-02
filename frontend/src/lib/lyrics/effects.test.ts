import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@caraoke/shared';
import {
  LYRICS_EFFECT_LIST,
  LYRICS_EFFECTS,
  computeProgress,
  nominalTime,
  splitWords,
  tokensOf,
  wordShares,
  type LyricsEffectSettings,
} from './effects';

const LINE: LyricLine = { start: 10, end: 20, text: 'Eu quero amar você' };

const settings = (overrides: Partial<LyricsEffectSettings> = {}): LyricsEffectSettings => ({
  enabled: true,
  id: 'smooth',
  fillPercent: 100,
  ...overrides,
});

const progressAt = (time: number, overrides: Partial<LyricsEffectSettings> = {}, line: LyricLine = LINE) =>
  computeProgress(settings(overrides), { line, tokens: tokensOf(line), time });

describe('tokens', () => {
  it('splits a text into words, ignoring extra spaces', () => {
    expect(splitWords('  Eu   quero\tamar ')).toEqual(['Eu', 'quero', 'amar']);
    expect(splitWords('   ')).toEqual([]);
  });

  it('uses the words with their own times when the line has them', () => {
    const withWords: LyricLine = { ...LINE, words: [{ start: 10, end: 12, text: 'Eu' }] };
    expect(tokensOf(withWords)).toEqual([{ text: 'Eu', start: 10, end: 12 }]);
  });

  it('otherwise splits the text, with no times', () => {
    expect(tokensOf(LINE)).toEqual([{ text: 'Eu' }, { text: 'quero' }, { text: 'amar' }, { text: 'você' }]);
  });
});

describe('wordShares', () => {
  it('gives each word a share of the line in proportion to its letters', () => {
    const shares = wordShares([{ text: 'aa' }, { text: 'bbbb' }, { text: 'cc' }]);
    expect(shares.map((share) => share.from)).toEqual([0, 0.25, 0.75]);
    expect(shares.map((share) => share.to)).toEqual([0.25, 0.75, 1]);
  });

  it('handles no words', () => {
    expect(wordShares([])).toEqual([]);
    expect(wordShares([{ text: '' }])).toEqual([{ from: 0, to: 0 }]);
  });
});

describe('nominalTime', () => {
  it('keeps the start where it is and stretches or shrinks the rest', () => {
    expect(nominalTime(LINE, 10, 50)).toBe(10);
    expect(nominalTime(LINE, 15, 50)).toBe(20);
    expect(nominalTime(LINE, 15, 100)).toBe(15);
    expect(nominalTime(LINE, 15, 200)).toBe(12.5);
  });

  it('does not break with a zero percent', () => {
    expect(Number.isFinite(nominalTime(LINE, 15, 0))).toBe(true);
  });
});

describe('smooth effect (fills little by little)', () => {
  it('is the default model and is listed first', () => {
    expect(LYRICS_EFFECT_LIST[0]?.id).toBe('smooth');
    expect(LYRICS_EFFECTS.smooth.label).toBe('Preencher aos poucos');
  });

  it('fills the words in order, as one continuous bar across the line', () => {
    const progress = progressAt(15);
    expect(progress[0]).toBe(1);
    expect(progress[1]).toBe(1);
    expect(progress[2]).toBeGreaterThan(0);
    expect(progress[2]).toBeLessThan(1);
    expect(progress[3]).toBe(0);
  });

  it('starts empty and ends full', () => {
    expect(progressAt(10)).toEqual([0, 0, 0, 0]);
    expect(progressAt(20)).toEqual([1, 1, 1, 1]);
    expect(progressAt(99)).toEqual([1, 1, 1, 1]);
  });

  it('finishes earlier with a smaller percent, and later with a bigger one', () => {
    expect(progressAt(15, { fillPercent: 50 })).toEqual([1, 1, 1, 1]);
    expect(
      progressAt(15, { fillPercent: 200 })
        .slice(2)
        .every((value) => value < 1),
    ).toBe(true);
    expect(progressAt(10, { fillPercent: 50 })).toEqual([0, 0, 0, 0]);
  });

  it('follows the times of each word when the line has them, also scaled by the percent', () => {
    const line: LyricLine = {
      start: 10,
      end: 14,
      text: 'Eu sei',
      words: [
        { start: 10, end: 12, text: 'Eu' },
        { start: 12, end: 14, text: 'sei' },
      ],
    };
    expect(progressAt(11, {}, line)).toEqual([0.5, 0]);
    expect(progressAt(11, { fillPercent: 50 }, line)).toEqual([1, 0]);
    expect(progressAt(12, { fillPercent: 50 }, line)).toEqual([1, 1]);
  });
});

describe('words effect (paints whole words)', () => {
  const words = (time: number, overrides: Partial<LyricsEffectSettings> = {}, line: LyricLine = LINE) =>
    progressAt(time, { id: 'words', ...overrides }, line);

  it('is offered with a clear name', () => {
    expect(LYRICS_EFFECTS.words.label).toBe('Palavra por palavra');
  });

  it('paints the first word as soon as the line starts, and never a half word', () => {
    expect(words(10)).toEqual([1, 0, 0, 0]);
    for (let time = 10; time <= 20; time += 0.25) {
      expect(words(time).every((value) => value === 0 || value === 1)).toBe(true);
    }
  });

  it('paints the next words one by one, in order, as their share of the line arrives', () => {
    const states = [10, 12, 15, 18, 20].map((time) => words(time).join(''));
    expect(states).toEqual(['1000', '1100', '1110', '1111', '1111']);
  });

  it('never paints a word before the previous ones', () => {
    for (let time = 10; time <= 20; time += 0.1) {
      const result = words(time);
      expect(result).toEqual([...result].sort((a, b) => b - a));
    }
  });

  it('paints nothing before the line starts', () => {
    expect(words(5)).toEqual([0, 0, 0, 0]);
  });

  it('paints sooner with a smaller percent and later with a bigger one', () => {
    expect(words(15, { fillPercent: 50 }).join('')).toBe('1111');
    expect(words(15, { fillPercent: 150 }).join('')).toBe('1100');
  });

  it('uses the start of each word when the line has its own times', () => {
    const line: LyricLine = {
      start: 10,
      end: 14,
      text: 'Eu sei',
      words: [
        { start: 10, end: 12, text: 'Eu' },
        { start: 12, end: 14, text: 'sei' },
      ],
    };
    expect(words(11, {}, line)).toEqual([1, 0]);
    expect(words(12, {}, line)).toEqual([1, 1]);
  });
});

describe('effect turned off', () => {
  it('shows every word fully painted from the first instant, for any model', () => {
    for (const id of ['smooth', 'words'] as const) {
      expect(progressAt(10, { enabled: false, id })).toEqual([1, 1, 1, 1]);
    }
  });
});
