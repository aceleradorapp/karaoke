import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@caraoke/shared';
import { retimeLine, shiftLine } from './wordTiming';

const LINE: LyricLine = {
  start: 10,
  end: 14,
  text: 'Eu sei',
  words: [
    { start: 10, end: 11, text: 'Eu' },
    { start: 12, end: 14, text: 'sei' },
  ],
};

describe('shiftLine', () => {
  it('moves the line and every word by the same amount', () => {
    expect(shiftLine(LINE, 2.5)).toEqual({
      start: 12.5,
      end: 16.5,
      text: 'Eu sei',
      words: [
        { start: 12.5, end: 13.5, text: 'Eu' },
        { start: 14.5, end: 16.5, text: 'sei' },
      ],
    });
  });

  it('moves a line without words too', () => {
    expect(shiftLine({ start: 1, end: 2, text: 'x' }, -0.5)).toEqual({ start: 0.5, end: 1.5, text: 'x' });
  });
});

describe('retimeLine', () => {
  it('stretches the words to fit a longer line, keeping their proportions', () => {
    const stretched = retimeLine(LINE, 10, 18);
    expect(stretched.words?.map((word) => [word.start, word.end])).toEqual([
      [10, 12],
      [14, 18],
    ]);
  });

  it('squeezes and moves the words with a new start', () => {
    const squeezed = retimeLine(LINE, 11, 13);
    expect(squeezed.words?.map((word) => [word.start, word.end])).toEqual([
      [11, 11.5],
      [12, 13],
    ]);
  });

  it('only moves the words when the old line had no length', () => {
    const flat: LyricLine = { start: 5, end: 5, text: 'a', words: [{ start: 5, end: 5.4, text: 'a' }] };
    expect(retimeLine(flat, 7, 9).words).toEqual([{ start: 7, end: 7.4, text: 'a' }]);
  });

  it('just sets the times of a line without words', () => {
    expect(retimeLine({ start: 1, end: 2, text: 'x' }, 3, 5)).toEqual({ start: 3, end: 5, text: 'x' });
  });
});
