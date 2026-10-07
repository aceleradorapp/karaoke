import type { LyricLine } from '@caraoke/shared';
import { findPhraseOnsets, findVocalOnset } from './vocalAnalysis';
import { shiftLine } from './wordTiming';

export const SHIFT_LIMIT_SECONDS = 60;
export const SNAP_TOLERANCE_SECONDS = 1.8;
export const MIN_LINE_GAP_SECONDS = 0.3;

const SHIFT_STEP_SECONDS = 0.05;
const TRUNCATION_SECONDS = 2;
const MATCH_TOLERANCE_SECONDS = 0.5;
const MIN_MATCHED_FRACTION = 0.3;
const MIN_LINES_FOR_FIT = 3;
const MIN_SHIFT_SECONDS = 1;
const CENTISECONDS = 100;

export interface AlignmentResult {
  lines: LyricLine[];
  shiftSeconds: number;
  snappedCount: number;
}

function roundCentiseconds(value: number): number {
  return Math.round(value * CENTISECONDS) / CENTISECONDS;
}

export function nearestOnsetIndex(onsets: readonly number[], time: number): number {
  let low = 0;
  let high = onsets.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((onsets[middle] as number) < time) low = middle + 1;
    else high = middle;
  }
  const after = low;
  const before = Math.max(0, low - 1);
  return Math.abs((onsets[before] as number) - time) <= Math.abs((onsets[after] as number) - time)
    ? before
    : after;
}

function distanceToNearest(onsets: readonly number[], time: number): number {
  return Math.abs((onsets[nearestOnsetIndex(onsets, time)] as number) - time);
}

export function fitShift(starts: readonly number[], onsets: readonly number[]): number | null {
  if (starts.length < MIN_LINES_FOR_FIT || onsets.length === 0) return null;

  const steps = Math.round((2 * SHIFT_LIMIT_SECONDS) / SHIFT_STEP_SECONDS);
  let bestCost = Infinity;
  let bestShift = 0;

  for (let step = 0; step <= steps; step++) {
    const shift = roundCentiseconds(-SHIFT_LIMIT_SECONDS + step * SHIFT_STEP_SECONDS);
    let total = 0;
    for (const start of starts)
      total += Math.min(distanceToNearest(onsets, start + shift), TRUNCATION_SECONDS);
    const cost = total / starts.length;
    const isBetter = cost < bestCost - 1e-9;
    const isTieWithSmallerShift = Math.abs(cost - bestCost) <= 1e-9 && Math.abs(shift) < Math.abs(bestShift);
    if (isBetter || isTieWithSmallerShift) {
      bestCost = cost;
      bestShift = shift;
    }
  }

  const matched = starts.filter(
    (start) => distanceToNearest(onsets, start + bestShift) <= MATCH_TOLERANCE_SECONDS,
  ).length;
  const matchable = Math.min(starts.length, onsets.length);
  return matched < Math.max(2, MIN_MATCHED_FRACTION * matchable) ? null : bestShift;
}

export function snapStarts(starts: readonly number[], onsets: readonly number[]): number[] {
  const snapped = [...starts];
  const used = new Set<number>();
  let previous = -Infinity;

  starts.forEach((start, index) => {
    const position = onsets.length > 0 ? nearestOnsetIndex(onsets, start) : -1;
    const candidate = position >= 0 ? (onsets[position] as number) : 0;
    const canSnap =
      position >= 0 &&
      !used.has(position) &&
      Math.abs(candidate - start) <= SNAP_TOLERANCE_SECONDS &&
      candidate > previous + MIN_LINE_GAP_SECONDS;
    if (canSnap) {
      snapped[index] = candidate;
      used.add(position);
    }
    snapped[index] = Math.max(snapped[index] as number, previous + MIN_LINE_GAP_SECONDS);
    previous = snapped[index] as number;
  });
  return snapped;
}

export function withNewStarts(lines: readonly LyricLine[], starts: readonly number[]): LyricLine[] {
  return lines.map((line, index) => {
    const start = starts[index] as number;
    const nextStart = starts[index + 1];
    const end = start + Math.max(0, line.end - line.start);
    const clampedEnd = nextStart === undefined ? end : Math.min(end, nextStart);
    const moved = shiftLine(line, roundCentiseconds(start) - line.start);
    return { ...moved, start: roundCentiseconds(start), end: roundCentiseconds(Math.max(clampedEnd, start)) };
  });
}

export function alignLinesWithVoice(
  lines: readonly LyricLine[],
  envelope: Float32Array,
): AlignmentResult | null {
  if (lines.length === 0) return null;

  const starts = lines.map((line) => line.start);
  const onsets = findPhraseOnsets(envelope);
  const shift = fitShift(starts, onsets);

  if (shift === null) {
    const onset = findVocalOnset(envelope);
    if (onset === null) return null;
    const fallback = onset - (starts[0] as number);
    const isUsable = Math.abs(fallback) >= MIN_SHIFT_SECONDS && Math.abs(fallback) <= SHIFT_LIMIT_SECONDS;
    if (!isUsable) return null;
    const moved = starts.map((start) => Math.max(0, start + fallback));
    return { lines: withNewStarts(lines, moved), shiftSeconds: fallback, snappedCount: 0 };
  }

  const shifted = starts.map((start) => Math.max(0, start + shift));
  const snapped = snapStarts(shifted, onsets);
  const snappedCount = snapped.filter((value, index) => value !== shifted[index]).length;
  return { lines: withNewStarts(lines, snapped), shiftSeconds: shift, snappedCount };
}

export function snapLineToNearestOnset(
  lines: readonly LyricLine[],
  index: number,
  onsets: readonly number[],
): LyricLine[] | null {
  const line = lines[index];
  if (!line || onsets.length === 0) return null;

  const target = onsets[nearestOnsetIndex(onsets, line.start)] as number;
  if (Math.abs(target - line.start) > SNAP_TOLERANCE_SECONDS) return null;

  const previous = lines[index - 1];
  const next = lines[index + 1];
  if (previous && target <= previous.start + MIN_LINE_GAP_SECONDS) return null;
  if (next && target >= next.start - MIN_LINE_GAP_SECONDS) return null;

  const duration = Math.max(0, line.end - line.start);
  const end = next ? Math.min(target + duration, next.start) : target + duration;
  return lines.map((item, position) =>
    position === index
      ? {
          ...shiftLine(item, roundCentiseconds(target) - item.start),
          start: roundCentiseconds(target),
          end: roundCentiseconds(end),
        }
      : item,
  );
}
