import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

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
