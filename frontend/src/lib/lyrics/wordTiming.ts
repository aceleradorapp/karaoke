import type { LyricLine } from '@caraoke/shared';

const CENTISECONDS = 100;

function round(value: number): number {
  return Math.round(value * CENTISECONDS) / CENTISECONDS;
}

export function retimeLine(line: LyricLine, start: number, end: number): LyricLine {
  if (!line.words?.length) return { ...line, start, end };

  const oldLength = line.end - line.start;
  const newLength = end - start;
  const map = (time: number) =>
    oldLength > 0 ? start + ((time - line.start) * newLength) / oldLength : time + (start - line.start);

  return {
    ...line,
    start,
    end,
    words: line.words.map((word) => ({ ...word, start: round(map(word.start)), end: round(map(word.end)) })),
  };
}

export function shiftLine(line: LyricLine, deltaSeconds: number): LyricLine {
  if (!line.words?.length) return { ...line, start: line.start + deltaSeconds, end: line.end + deltaSeconds };
  return {
    ...line,
    start: line.start + deltaSeconds,
    end: line.end + deltaSeconds,
    words: line.words.map((word) => ({
      ...word,
      start: round(word.start + deltaSeconds),
      end: round(word.end + deltaSeconds),
    })),
  };
}
