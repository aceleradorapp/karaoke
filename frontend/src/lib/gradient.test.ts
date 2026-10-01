import { describe, expect, it } from 'vitest';
import { coverGradient } from './gradient';

describe('coverGradient', () => {
  it('always gives the same gradient for the same song', () => {
    expect(coverGradient('song-1')).toBe(coverGradient('song-1'));
  });

  it('gives different gradients to different songs', () => {
    const gradients = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(coverGradient));
    expect(gradients.size).toBeGreaterThan(3);
  });

  it('is a valid two-color css gradient', () => {
    expect(coverGradient('anything')).toMatch(
      /^linear-gradient\(135deg, hsl\(\d+ 55% 38%\), hsl\(\d+ 60% 22%\)\)$/,
    );
  });

  it('copes with an empty id', () => {
    expect(coverGradient('')).toContain('hsl(0 55% 38%)');
  });
});
