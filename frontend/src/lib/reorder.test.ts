import { describe, expect, it } from 'vitest';
import { moveItem } from './reorder';

describe('moveItem', () => {
  const letters = ['a', 'b', 'c', 'd'];

  it('moves an item forward and backward', () => {
    expect(moveItem(letters, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(letters, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves to the first and last positions', () => {
    expect(moveItem(letters, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveItem(letters, 1, 3)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('returns an equal copy when nothing changes or the indexes are invalid', () => {
    for (const [from, to] of [
      [1, 1],
      [-1, 2],
      [0, 9],
    ] as const) {
      const result = moveItem(letters, from, to);
      expect(result).toEqual(letters);
      expect(result).not.toBe(letters);
    }
  });

  it('never changes the original list', () => {
    const original = ['a', 'b'];
    moveItem(original, 0, 1);
    expect(original).toEqual(['a', 'b']);
  });
});
