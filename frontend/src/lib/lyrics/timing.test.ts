import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@caraoke/shared';
import { countdownDots, findLineIndex, lineProgress, wordProgress } from './timing';

const line = (start: number, end: number, text = `${start}`): LyricLine => ({ start, end, text });

const LINES = [line(10, 14), line(14, 20), line(40, 44), line(44, 50)];

describe('findLineIndex', () => {
  it('is -1 before the first line and for an empty list', () => {
    expect(findLineIndex(LINES, 0)).toBe(-1);
    expect(findLineIndex(LINES, 9.99)).toBe(-1);
    expect(findLineIndex([], 5)).toBe(-1);
  });

  it('finds the line that has already started, switching exactly at its start time', () => {
    expect(findLineIndex(LINES, 10)).toBe(0);
    expect(findLineIndex(LINES, 13.99)).toBe(0);
    expect(findLineIndex(LINES, 14)).toBe(1);
    expect(findLineIndex(LINES, 44)).toBe(3);
  });

  it('stays on the previous line during a pause between lines', () => {
    expect(findLineIndex(LINES, 25)).toBe(1);
    expect(findLineIndex(LINES, 39.9)).toBe(1);
  });

  it('stays on the last line after the end', () => {
    expect(findLineIndex(LINES, 9999)).toBe(3);
  });

  it('works with a single line', () => {
    expect(findLineIndex([line(5, 8)], 4)).toBe(-1);
    expect(findLineIndex([line(5, 8)], 5)).toBe(0);
  });

  it('agrees with a simple scan on every time of a larger song', () => {
    const many = Array.from({ length: 200 }, (_, index) => line(index * 3 + 1, index * 3 + 3));
    const scan = (time: number) =>
      many.reduce((found, item, index) => (item.start <= time ? index : found), -1);

    for (let time = 0; time < 610; time += 0.37) expect(findLineIndex(many, time)).toBe(scan(time));
  });
});

describe('lineProgress and wordProgress', () => {
  it('goes from 0 to 1 across the line', () => {
    const current = line(10, 14);
    expect(lineProgress(current, 9)).toBe(0);
    expect(lineProgress(current, 10)).toBe(0);
    expect(lineProgress(current, 12)).toBe(0.5);
    expect(lineProgress(current, 14)).toBe(1);
    expect(lineProgress(current, 99)).toBe(1);
  });

  it('treats a zero length line as filled as soon as it starts', () => {
    expect(lineProgress(line(5, 5), 4.9)).toBe(0);
    expect(lineProgress(line(5, 5), 5)).toBe(1);
  });

  it('measures a single word', () => {
    const word = { start: 1, end: 2, text: 'oi' };
    expect(wordProgress(word, 0.5)).toBe(0);
    expect(wordProgress(word, 1.25)).toBe(0.25);
    expect(wordProgress(word, 3)).toBe(1);
  });
});

describe('countdownDots', () => {
  it('counts down the last three seconds of the intro', () => {
    const song = [line(20, 24)];

    expect(countdownDots(song, 10)).toBeNull();
    expect(countdownDots(song, 17)).toBe(3);
    expect(countdownDots(song, 18.5)).toBe(2);
    expect(countdownDots(song, 19.5)).toBe(1);
    expect(countdownDots(song, 20)).toBeNull();
  });

  it('counts down before a line that follows a long instrumental pause', () => {
    expect(countdownDots(LINES, 37)).toBe(3);
    expect(countdownDots(LINES, 38.2)).toBe(2);
    expect(countdownDots(LINES, 39.1)).toBe(1);
  });

  it('stays quiet while the next line is far away', () => {
    expect(countdownDots(LINES, 30)).toBeNull();
  });

  it('stays quiet between lines that follow each other closely', () => {
    expect(countdownDots([line(10, 14), line(15, 19)], 13)).toBeNull();
    expect(countdownDots([line(10, 14), line(16, 19)], 14.5)).toBeNull();
  });

  it('only counts down when the previous line ended at least four seconds ago', () => {
    const song = [line(10, 14), line(20, 24)];

    expect(countdownDots(song, 17.9)).toBeNull();
    expect(countdownDots(song, 18)).toBe(2);
  });

  it('has nothing to count down after the last line', () => {
    expect(countdownDots(LINES, 60)).toBeNull();
    expect(countdownDots([], 5)).toBeNull();
  });

  it('never shows more than three dots', () => {
    for (let time = 0; time < 40; time += 0.1) {
      const dots = countdownDots(LINES, time);
      if (dots !== null) expect(dots).toBeGreaterThanOrEqual(1);
      if (dots !== null) expect(dots).toBeLessThanOrEqual(3);
    }
  });
});
