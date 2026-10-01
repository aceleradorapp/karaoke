import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimeAgo } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59.6, '1:00'],
    [298, '4:58'],
    [720, '12:00'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-4, '0:00'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatTimeAgo', () => {
  const now = new Date('2026-10-01T12:00:00.000Z').getTime();
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [0, 'agora'],
    [30, 'agora'],
    [60, 'há 1 min'],
    [5 * 60, 'há 5 min'],
    [59 * 60, 'há 59 min'],
    [3600, 'há 1 h'],
    [5 * 3600 + 120, 'há 5 h'],
    [86_400, 'há 1 dia'],
    [3 * 86_400, 'há 3 dias'],
  ])('formats %s seconds ago as "%s"', (seconds, expected) => {
    expect(formatTimeAgo(ago(seconds), now)).toBe(expected);
  });

  it('never goes negative for dates slightly in the future', () => {
    expect(formatTimeAgo(ago(-10), now)).toBe('agora');
  });
});
