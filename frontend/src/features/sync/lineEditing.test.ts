import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@caraoke/shared';
import {
  deleteLine,
  distributeEvenly,
  insertLineAfter,
  isReadyToSave,
  lineIndexAt,
  markLineStart,
  moveLine,
  setLineEnd,
  setLineStart,
  shiftAll,
  tidy,
  updateLineText,
} from './lineEditing';

function lines(): LyricLine[] {
  return [
    { start: 10, end: 14, text: 'A' },
    { start: 20, end: 26, text: 'B' },
    { start: 30, end: 34, text: 'C' },
    { start: 40, end: 44, text: 'D' },
  ];
}

const starts = (items: LyricLine[]) => items.map((line) => line.start);

describe('moveLine', () => {
  it('moves one line, with its end, and leaves the others alone', () => {
    const moved = moveLine(lines(), 1, 2, false);
    expect(moved[1]).toMatchObject({ start: 22, end: 28 });
    expect(moved[0]).toEqual(lines()[0]);
    expect(moved[2]).toEqual(lines()[2]);
  });

  it('does not push the line over the next or the previous one', () => {
    expect(moveLine(lines(), 1, 50, false)[1]?.start).toBeCloseTo(29.7, 5);
    expect(moveLine(lines(), 1, -50, false)[1]?.start).toBeCloseTo(10.3, 5);
  });

  it('shortens the end so it never passes the next line', () => {
    const moved = moveLine(lines(), 1, 8, false);
    expect(moved[1]?.end).toBeLessThanOrEqual(30);
  });

  it('can take the following lines along', () => {
    expect(starts(moveLine(lines(), 1, 5, true))).toEqual([10, 25, 35, 45]);
  });

  it('never moves the first line before zero, even when taking the rest along', () => {
    expect(starts(moveLine(lines(), 0, -50, true))).toEqual([0, 10, 20, 30]);
  });

  it('moves the words of the lines it moved, and leaves the others alone', () => {
    const withWords = lines().map((line) => ({
      ...line,
      words: [{ start: line.start, end: line.end, text: line.text }],
    }));
    const moved = moveLine(withWords, 1, 1, false);
    expect(moved[1]?.words).toEqual([{ start: 21, end: 27, text: 'B' }]);
    expect(moved[0]?.words).toEqual(withWords[0]?.words);
  });

  it('ignores a line that does not exist', () => {
    expect(moveLine(lines(), 9, 1, false)).toEqual(lines());
  });
});

describe('setLineStart', () => {
  it('moves only the start and keeps the line at least as long as before', () => {
    const changed = setLineStart(lines(), 1, 22);
    expect(changed[1]).toMatchObject({ start: 22 });
    expect((changed[1]?.end ?? 0) - 22).toBeGreaterThanOrEqual(4);
  });

  it('stays between the neighbors', () => {
    expect(setLineStart(lines(), 1, 1)[1]?.start).toBeCloseTo(10.3, 5);
    expect(setLineStart(lines(), 1, 99)[1]?.start).toBeCloseTo(29.7, 5);
  });

  it('rounds to hundredths of a second', () => {
    expect(setLineStart(lines(), 1, 21.23456)[1]?.start).toBe(21.23);
  });
});

describe('keeping the times of the words', () => {
  const withWords = (): LyricLine[] =>
    lines().map((line) => ({
      ...line,
      words: [
        { start: line.start, end: line.start + 1, text: 'a' },
        { start: line.start + 2, end: line.end, text: 'b' },
      ],
    }));

  it('stretches the words when the end of the line moves', () => {
    const changed = setLineEnd(withWords(), 0, 18);
    expect(changed[0]?.words?.map((word) => [word.start, word.end])).toEqual([
      [10, 12],
      [14, 18],
    ]);
  });

  it('moves the words along when the start of the line changes', () => {
    const changed = setLineStart(withWords(), 1, 22);
    expect(changed[1]?.words?.[0]?.start).toBe(22);
  });

  it('moves every word when the whole lyrics move', () => {
    const moved = shiftAll(withWords(), 1);
    expect(moved.map((line) => line.words?.[0]?.start)).toEqual([11, 21, 31, 41]);
  });

  it('moves the words of the marked line and of the lines it pushed', () => {
    const marked = markLineStart(withWords(), 1, 33);
    expect(marked[1]?.words?.[0]?.start).toBe(33);
    expect(marked[2]?.words?.[0]?.start).toBeCloseTo(33.3, 5);
  });
});

describe('setLineEnd', () => {
  it('changes only the end, never before the start or after the next line', () => {
    expect(setLineEnd(lines(), 1, 25)[1]).toMatchObject({ start: 20, end: 25 });
    expect(setLineEnd(lines(), 1, 20.1)[1]?.end).toBe(20.5);
    expect(setLineEnd(lines(), 1, 99)[1]?.end).toBe(30);
  });

  it('lets the last line end anywhere after its start', () => {
    expect(setLineEnd(lines(), 3, 99)[3]?.end).toBe(99);
  });
});

describe('shiftAll', () => {
  it('moves every line by the same amount', () => {
    expect(starts(shiftAll(lines(), 2.5))).toEqual([12.5, 22.5, 32.5, 42.5]);
  });

  it('stops when the first line reaches zero', () => {
    expect(starts(shiftAll(lines(), -50))).toEqual([0, 10, 20, 30]);
  });

  it('does nothing without lines', () => {
    expect(shiftAll([], 5)).toEqual([]);
  });
});

describe('markLineStart', () => {
  it('puts the line start at the marked time', () => {
    expect(markLineStart(lines(), 1, 22.4)[1]?.start).toBe(22.4);
  });

  it('pushes the following lines when the mark goes past them', () => {
    const marked = markLineStart(lines(), 1, 33);
    expect(marked[1]?.start).toBe(33);
    expect(marked[2]?.start).toBeCloseTo(33.3, 5);
    expect(marked[3]?.start).toBeGreaterThan(marked[2]?.start ?? 0);
  });

  it('leaves the following lines when there is room', () => {
    expect(starts(markLineStart(lines(), 1, 22))).toEqual([10, 22, 30, 40]);
  });

  it('never goes before the previous line', () => {
    expect(markLineStart(lines(), 1, 5)[1]?.start).toBeCloseTo(10.3, 5);
  });
});

describe('text and structure', () => {
  it('changes the text of one line and forgets its words', () => {
    const withWords = lines().map((line) => ({ ...line, words: [{ start: 0, end: 1, text: 'x' }] }));
    const updated = updateLineText(withWords, 1, 'Novo');
    expect(updated[1]).toMatchObject({ text: 'Novo' });
    expect(updated[1]?.words).toBeUndefined();
    expect(updated[0]?.words).toBeDefined();
  });

  it('removes a line', () => {
    expect(deleteLine(lines(), 1).map((line) => line.text)).toEqual(['A', 'C', 'D']);
  });

  it('adds an empty line in the middle of the gap after a line', () => {
    const inserted = insertLineAfter(lines(), 1);
    expect(inserted).toHaveLength(5);
    expect(inserted[2]?.text).toBe('');
    expect(inserted[2]?.start).toBeGreaterThan(20);
    expect(inserted[2]?.start).toBeLessThan(30);
  });

  it('adds a line after the last one', () => {
    const inserted = insertLineAfter(lines(), 3);
    expect(inserted[4]?.start).toBeGreaterThan(40);
  });

  it('is ready to save only with text on every line, in order', () => {
    expect(isReadyToSave(lines())).toBe(true);
    expect(isReadyToSave(insertLineAfter(lines(), 0))).toBe(false);
    expect(isReadyToSave([])).toBe(false);
    expect(isReadyToSave([...lines()].reverse())).toBe(false);
  });
});

describe('distributeEvenly', () => {
  it('spreads the lines between two moments', () => {
    const spread = distributeEvenly(lines(), 20, 100);
    expect(starts(spread)).toEqual([20, 40, 60, 80]);
    expect(spread[3]?.end).toBe(100);
  });

  it('keeps a small gap even in a very short span', () => {
    expect(starts(distributeEvenly(lines(), 0, 0.4))).toEqual([0, 0.3, 0.6, 0.9]);
  });

  it('handles an empty list', () => {
    expect(distributeEvenly([], 0, 10)).toEqual([]);
  });
});

describe('tidy and lineIndexAt', () => {
  it('rounds the times and keeps every end between its start and the next start', () => {
    const messy: LyricLine[] = [
      { start: 1.234, end: 99, text: 'A' },
      { start: 5, end: 3, text: 'B' },
    ];
    expect(tidy(messy)).toEqual([
      { start: 1.23, end: 5, text: 'A' },
      { start: 5, end: 5, text: 'B' },
    ]);
  });

  it('finds the line that is being sung at a time', () => {
    expect(lineIndexAt(lines(), 5)).toBe(-1);
    expect(lineIndexAt(lines(), 10)).toBe(0);
    expect(lineIndexAt(lines(), 33)).toBe(2);
    expect(lineIndexAt(lines(), 500)).toBe(3);
  });
});
