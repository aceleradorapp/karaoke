import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@caraoke/shared';
import {
  centerOn,
  clampOffset,
  clampViewStart,
  followPlayhead,
  offsetAfterDrag,
  offsetToMarkLine,
  shiftedLines,
  snapOffset,
  timeToX,
  xToTime,
  type TimelineView,
} from './timelineMath';

const VIEW: TimelineView = { start: 10, visibleSeconds: 20, width: 1000 };

describe('time and pixel conversion', () => {
  it('maps the edges of the window to the edges of the canvas', () => {
    expect(timeToX(10, VIEW)).toBe(0);
    expect(timeToX(30, VIEW)).toBe(1000);
    expect(timeToX(20, VIEW)).toBe(500);
  });

  it('is reversible', () => {
    expect(xToTime(timeToX(23.4, VIEW), VIEW)).toBeCloseTo(23.4, 6);
  });
});

describe('window position', () => {
  it('never scrolls before the start or past the end of the song', () => {
    expect(clampViewStart(-5, 20, 200)).toBe(0);
    expect(clampViewStart(250, 20, 200)).toBe(180);
    expect(clampViewStart(10, 20, 15)).toBe(0);
  });

  it('centers on a time while staying inside the song', () => {
    expect(centerOn(100, 20, 200)).toBe(90);
    expect(centerOn(2, 20, 200)).toBe(0);
  });

  it('keeps the window still while the playhead is comfortably inside it', () => {
    expect(followPlayhead(20, 10, 20, 200)).toBe(10);
  });

  it('moves the window when the playhead nears or leaves the edge', () => {
    expect(followPlayhead(29.5, 10, 20, 200)).toBe(24.5);
    expect(followPlayhead(5, 10, 20, 200)).toBe(0);
  });
});

describe('lyrics offset', () => {
  it('snaps to 10 ms steps', () => {
    expect(snapOffset(1234)).toBe(1230);
    expect(snapOffset(-1236)).toBe(-1240);
  });

  it('stays within the limit', () => {
    expect(clampOffset(90000)).toBe(60000);
    expect(clampOffset(-90000)).toBe(-60000);
  });

  it('follows the finger while dragging the lyrics', () => {
    expect(offsetAfterDrag(0, 500, VIEW)).toBe(10000);
    expect(offsetAfterDrag(2000, -100, VIEW)).toBe(0);
  });

  it('computes the offset that makes a line start at the marked time', () => {
    const line: LyricLine = { start: 19.24, end: 24, text: 'x' };
    expect(offsetToMarkLine(line, 34.7)).toBe(15460);
    expect(offsetToMarkLine(line, 10)).toBe(-9240);
  });
});

describe('shiftedLines', () => {
  const lines: LyricLine[] = [
    { start: 5, end: 10, text: 'a' },
    { start: 10, end: 15, text: 'b' },
    { start: 40, end: 45, text: 'c' },
  ];

  it('moves every line by the offset and keeps only the visible ones', () => {
    const visible = shiftedLines(lines, 10000, 12, 30);
    expect(visible.map((item) => [item.index, item.start])).toEqual([
      [0, 15],
      [1, 20],
    ]);
  });

  it('can move lines earlier with a negative offset', () => {
    expect(shiftedLines(lines, -3000, 0, 8).map((item) => item.index)).toEqual([0, 1]);
  });
});
