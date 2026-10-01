import type { LyricLine, LyricWord } from '@caraoke/shared';

const COUNTDOWN_WINDOW_SECONDS = 3;
const MIN_SILENCE_BEFORE_COUNTDOWN_SECONDS = 4;

export function findLineIndex(lines: readonly LyricLine[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((lines[middle] as LyricLine).start <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function progressBetween(start: number, end: number, time: number): number {
  if (end <= start) return time >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (time - start) / (end - start)));
}

export function lineProgress(line: LyricLine, time: number): number {
  return progressBetween(line.start, line.end, time);
}

export function wordProgress(word: LyricWord, time: number): number {
  return progressBetween(word.start, word.end, time);
}

export function countdownDots(lines: readonly LyricLine[], time: number): number | null {
  const currentIndex = findLineIndex(lines, time);
  const next = lines[currentIndex + 1];
  if (!next) return null;

  const secondsUntilNext = next.start - time;
  if (secondsUntilNext > COUNTDOWN_WINDOW_SECONDS) return null;

  const previous = lines[currentIndex];
  const silentFor = previous ? time - previous.end : Infinity;
  if (silentFor < MIN_SILENCE_BEFORE_COUNTDOWN_SECONDS) return null;

  return Math.min(COUNTDOWN_WINDOW_SECONDS, Math.ceil(secondsUntilNext));
}
