import { describe, expect, it } from 'vitest';
import {
  centerOn,
  clampViewStart,
  followPlayhead,
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
