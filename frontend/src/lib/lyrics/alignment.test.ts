import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@caraoke/shared';
import {
  alignLinesWithVoice,
  fitShift,
  nearestOnsetIndex,
  snapLineToNearestOnset,
  snapStarts,
} from './alignment';
import { HOP_SECONDS } from './vocalAnalysis';

const ONSETS = [30, 38, 47, 60, 68, 80];

function voice(phrases: Array<[number, number]>, total: number): Float32Array {
  const envelope = new Float32Array(Math.round(total / HOP_SECONDS));
  for (const [start, end] of phrases)
    envelope.fill(0.4, Math.round(start / HOP_SECONDS), Math.round(end / HOP_SECONDS));
  return envelope;
}

function linesAt(starts: number[], length = 4): LyricLine[] {
  return starts.map((start, index) => ({ start, end: start + length, text: `Linha ${index}` }));
}

describe('nearestOnsetIndex', () => {
  it('finds the closest onset on either side', () => {
    expect(nearestOnsetIndex(ONSETS, 31)).toBe(0);
    expect(nearestOnsetIndex(ONSETS, 36)).toBe(1);
    expect(nearestOnsetIndex(ONSETS, 1)).toBe(0);
    expect(nearestOnsetIndex(ONSETS, 500)).toBe(5);
  });
});

describe('fitShift', () => {
  it('finds a constant delay between the lyrics and the voice', () => {
    expect(
      fitShift(
        ONSETS.map((onset) => onset - 15),
        ONSETS,
      ),
    ).toBeCloseTo(15, 1);
  });

  it('finds an advance as well', () => {
    expect(
      fitShift(
        ONSETS.map((onset) => onset + 8),
        ONSETS,
      ),
    ).toBeCloseTo(-8, 1);
  });

  it('ignores a line that has no voice at all', () => {
    expect(fitShift([...ONSETS.map((onset) => onset - 15), 500], ONSETS)).toBeCloseTo(15, 1);
  });

  it('is not fooled by a few lines that are far off', () => {
    expect(fitShift([15, 23, 32, 45, 53, 71], ONSETS)).toBeCloseTo(15, 1);
  });

  it('prefers the smaller shift when two fit equally', () => {
    expect(fitShift([10, 20, 30, 40, 50, 60], [10, 20, 30, 40, 50, 60])).toBeCloseTo(0, 1);
  });

  it('accepts a fit when the voice has fewer pauses than the lyrics has lines', () => {
    const starts = Array.from({ length: 20 }, (_, index) => 10 + 4 * index);
    expect(fitShift(starts, [14, 30, 46, 62, 78])).toBeCloseTo(0, 1);
  });

  it('gives up with too few lines, no voice, or lines that match nothing', () => {
    expect(fitShift([10, 20], ONSETS)).toBeNull();
    expect(fitShift(ONSETS, [])).toBeNull();
    expect(fitShift([1, 3.7, 6.1, 9.3, 12.9, 15.3, 18.7, 21.1, 24.9, 27.7], [100, 150, 200])).toBeNull();
  });
});

describe('snapStarts', () => {
  it('pulls each line to the phrase that starts near it', () => {
    expect(snapStarts([30.4, 37.5, 47.9], ONSETS)).toEqual([30, 38, 47]);
  });

  it('leaves a line alone when no phrase is close', () => {
    expect(snapStarts([30, 53, 60], ONSETS)).toEqual([30, 53, 60]);
  });

  it('uses each phrase only once and keeps the order', () => {
    const [first, second] = snapStarts([37.6, 38.4], ONSETS) as [number, number];
    expect(first).toBe(38);
    expect(second).toBeGreaterThan(first);
  });

  it('keeps the order even when snapping would cross the lines', () => {
    const [first, second] = snapStarts([47, 46], ONSETS) as [number, number];
    expect(second).toBeGreaterThan(first);
  });

  it('works without phrases', () => {
    expect(snapStarts([5, 9], [])).toEqual([5, 9]);
  });
});

describe('alignLinesWithVoice', () => {
  it('shifts and snaps the lines to the voice', () => {
    const envelope = voice(
      [
        [30, 36],
        [38, 44],
        [47, 53],
        [60, 66],
        [68, 74],
        [80, 86],
      ],
      100,
    );

    const result = alignLinesWithVoice(linesAt([15, 23, 32.2, 45, 52, 65]), envelope);

    expect(result?.lines.map((line) => line.start)).toEqual([30, 38, 47, 60, 68, 80]);
    expect(result?.lines.map((line) => line.text)).toEqual([
      'Linha 0',
      'Linha 1',
      'Linha 2',
      'Linha 3',
      'Linha 4',
      'Linha 5',
    ]);
    expect(result?.shiftSeconds).toBeCloseTo(15, 1);
    expect(result?.snappedCount).toBeGreaterThan(0);
  });

  it('keeps the length of each line but never past the next one', () => {
    const envelope = voice(
      [
        [30, 36],
        [38, 44],
        [47, 53],
      ],
      60,
    );
    const lines: LyricLine[] = [
      { start: 15, end: 19, text: 'A' },
      { start: 23, end: 40, text: 'B' },
      { start: 32, end: 36, text: 'C' },
    ];

    const aligned = alignLinesWithVoice(lines, envelope)?.lines as LyricLine[];

    expect(aligned[0]?.end).toBeCloseTo((aligned[0]?.start ?? 0) + 4, 2);
    expect(aligned[1]?.end).toBeLessThanOrEqual(aligned[2]?.start ?? 0);
    expect(aligned[2]?.end).toBeCloseTo((aligned[2]?.start ?? 0) + 4, 2);
  });

  it('moves the words together with their lines', () => {
    const envelope = voice(
      [
        [30, 36],
        [38, 44],
        [47, 53],
      ],
      60,
    );
    const lines = linesAt([15, 23, 32]).map((line) => ({
      ...line,
      words: [{ start: line.start, end: line.end, text: 'x' }],
    }));

    const aligned = alignLinesWithVoice(lines, envelope)?.lines as LyricLine[];

    expect(aligned.every((line) => line.words?.[0]?.start === line.start)).toBe(true);
  });

  it('falls back to the first voice when there are too few lines', () => {
    const result = alignLinesWithVoice(linesAt([10, 18]), voice([[30, 40]], 60));
    expect(result?.lines.map((line) => line.start)).toEqual([30, 38]);
    expect(result?.snappedCount).toBe(0);
  });

  it('leaves alone a small difference when falling back to the first voice', () => {
    expect(alignLinesWithVoice(linesAt([30, 38]), voice([[30.5, 40]], 60))).toBeNull();
  });

  it('does not invent times without voice or without lines', () => {
    expect(alignLinesWithVoice(linesAt([10, 20, 30]), new Float32Array(1000))).toBeNull();
    expect(alignLinesWithVoice([], voice([[1, 2]], 5))).toBeNull();
  });

  it('never produces negative times', () => {
    const envelope = voice(
      [
        [1, 5],
        [8, 12],
        [15, 19],
        [22, 26],
      ],
      40,
    );
    const result = alignLinesWithVoice(linesAt([12, 20, 27, 34]), envelope);
    expect(Math.min(...(result?.lines.map((line) => line.start) ?? [0]))).toBeGreaterThanOrEqual(0);
  });
});

describe('snapLineToNearestOnset', () => {
  const lines = linesAt([29.5, 40, 70]);

  it('moves one line to the nearest start of voice, keeping its length', () => {
    const result = snapLineToNearestOnset(lines, 0, ONSETS);
    expect(result?.[0]).toMatchObject({ start: 30, end: 34 });
    expect(result?.[1]).toEqual(lines[1]);
  });

  it('does nothing when no voice starts close enough', () => {
    expect(snapLineToNearestOnset(lines, 1, ONSETS)).toBeNull();
  });

  it('does not cross the neighbor lines', () => {
    expect(snapLineToNearestOnset(linesAt([29.9, 30.1]), 1, ONSETS)).toBeNull();
    expect(snapLineToNearestOnset(linesAt([29.9, 30.2]), 0, [30.1, 60])).toBeNull();
  });

  it('does nothing for a missing line or without voice', () => {
    expect(snapLineToNearestOnset(lines, 9, ONSETS)).toBeNull();
    expect(snapLineToNearestOnset(lines, 0, [])).toBeNull();
  });
});
