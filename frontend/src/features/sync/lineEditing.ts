import type { LyricLine } from '@caraoke/shared';
import { MIN_LINE_GAP_SECONDS } from '../../lib/lyrics/alignment';

export const MIN_LINE_LENGTH_SECONDS = 0.5;
const DEFAULT_LAST_LINE_SECONDS = 4;
const CENTISECONDS = 100;

function round(value: number): number {
  return Math.round(value * CENTISECONDS) / CENTISECONDS;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}

function lowerBound(lines: readonly LyricLine[], index: number): number {
  const previous = lines[index - 1];
  return previous ? previous.start + MIN_LINE_GAP_SECONDS : 0;
}

function upperBound(lines: readonly LyricLine[], index: number): number {
  const next = lines[index + 1];
  return next ? next.start - MIN_LINE_GAP_SECONDS : Infinity;
}

export function tidy(lines: readonly LyricLine[]): LyricLine[] {
  return lines.map((line, index) => {
    const next = lines[index + 1];
    const start = round(Math.max(0, line.start));
    const longest = next ? Math.max(start, next.start) : Infinity;
    const end = round(Math.min(Math.max(line.end, start), longest));
    return line.start === start && line.end === end ? line : { ...line, start, end };
  });
}

function stripWords({ words: _words, ...line }: LyricLine): LyricLine {
  return line;
}

function replaceAt(lines: readonly LyricLine[], index: number, replacement: LyricLine): LyricLine[] {
  return lines.map((line, position) => (position === index ? replacement : line));
}

export function moveLine(
  lines: readonly LyricLine[],
  index: number,
  deltaSeconds: number,
  ripple: boolean,
): LyricLine[] {
  const line = lines[index];
  if (!line) return [...lines];

  const lowest = lowerBound(lines, index) - line.start;
  const highest = ripple ? Infinity : upperBound(lines, index) - line.start;
  const delta = clamp(deltaSeconds, lowest, highest);

  const moved = lines.map((item, position) => {
    const isMoved = position === index || (ripple && position > index);
    return isMoved ? { ...stripWords(item), start: item.start + delta, end: item.end + delta } : item;
  });
  return tidy(moved);
}

export function setLineStart(lines: readonly LyricLine[], index: number, time: number): LyricLine[] {
  const line = lines[index];
  if (!line) return [...lines];

  const start = clamp(time, lowerBound(lines, index), upperBound(lines, index));
  const length = Math.max(line.end - line.start, MIN_LINE_LENGTH_SECONDS);
  return tidy(
    replaceAt(lines, index, { ...stripWords(line), start, end: Math.max(line.end, start + length) }),
  );
}

export function setLineEnd(lines: readonly LyricLine[], index: number, time: number): LyricLine[] {
  const line = lines[index];
  if (!line) return [...lines];

  const next = lines[index + 1];
  const end = clamp(time, line.start + MIN_LINE_LENGTH_SECONDS, next ? next.start : Infinity);
  return tidy(replaceAt(lines, index, { ...line, end }));
}

export function shiftAll(lines: readonly LyricLine[], deltaSeconds: number): LyricLine[] {
  const first = lines[0];
  if (!first) return [];
  const delta = Math.max(deltaSeconds, -first.start);
  return tidy(
    lines.map((line) => ({ ...stripWords(line), start: line.start + delta, end: line.end + delta })),
  );
}

export function markLineStart(lines: readonly LyricLine[], index: number, time: number): LyricLine[] {
  const line = lines[index];
  if (!line) return [...lines];

  const start = Math.max(time, lowerBound(lines, index));
  const deficit = Math.max(0, start + MIN_LINE_GAP_SECONDS - (lines[index + 1]?.start ?? -Infinity));
  const length = Math.max(line.end - line.start, MIN_LINE_LENGTH_SECONDS);

  const marked = lines.map((item, position) => {
    if (position === index) return { ...stripWords(item), start, end: start + length };
    if (position > index && deficit > 0) {
      return { ...stripWords(item), start: item.start + deficit, end: item.end + deficit };
    }
    return item;
  });
  return tidy(marked);
}

export function updateLineText(lines: readonly LyricLine[], index: number, text: string): LyricLine[] {
  const line = lines[index];
  if (!line || line.text === text) return [...lines];
  return replaceAt(lines, index, { ...stripWords(line), text });
}

export function deleteLine(lines: readonly LyricLine[], index: number): LyricLine[] {
  return lines.filter((_, position) => position !== index);
}

export function insertLineAfter(lines: readonly LyricLine[], index: number): LyricLine[] {
  const line = lines[index];
  if (!line) return [...lines];

  const next = lines[index + 1];
  const room = next ? next.start - line.start : DEFAULT_LAST_LINE_SECONDS * 2;
  const start = round(line.start + room / 2);
  const end = next ? round(Math.min(start + room / 2, next.start)) : round(start + DEFAULT_LAST_LINE_SECONDS);
  const inserted: LyricLine = { start, end, text: '' };
  return tidy([...lines.slice(0, index + 1), inserted, ...lines.slice(index + 1)]);
}

export function distributeEvenly(lines: readonly LyricLine[], from: number, to: number): LyricLine[] {
  if (lines.length === 0) return [];
  const step = Math.max(MIN_LINE_GAP_SECONDS, (to - from) / lines.length);
  return lines.map((line, index) => {
    const start = round(from + index * step);
    return { ...stripWords(line), start, end: round(start + step) };
  });
}

export function isReadyToSave(lines: readonly LyricLine[]): boolean {
  return (
    lines.length > 0 &&
    lines.every((line, index) => {
      const previous = lines[index - 1];
      return (
        line.text.trim().length > 0 && line.end >= line.start && (!previous || line.start >= previous.start)
      );
    })
  );
}

export function lineIndexAt(lines: readonly LyricLine[], time: number): number {
  let found = -1;
  lines.forEach((line, index) => {
    if (line.start <= time) found = index;
  });
  return found;
}
