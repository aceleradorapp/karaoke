import { LYRICS_OFFSET_LIMIT_MS, type LyricLine } from '@caraoke/shared';

export const ZOOM_LEVELS = [10, 20, 40, 80] as const;
export const DEFAULT_ZOOM_SECONDS = 20;
export const OFFSET_SNAP_MS = 10;
export const PLAYHEAD_LEAD_FRACTION = 0.25;
const PLAYHEAD_SAFE_MARGIN = 0.1;
const MILLISECONDS_PER_SECOND = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface TimelineView {
  start: number;
  visibleSeconds: number;
  width: number;
}

export function timeToX(time: number, view: TimelineView): number {
  return ((time - view.start) / view.visibleSeconds) * view.width;
}

export function xToTime(x: number, view: TimelineView): number {
  return view.start + (x / view.width) * view.visibleSeconds;
}

export function clampViewStart(start: number, visibleSeconds: number, duration: number): number {
  return clamp(start, 0, Math.max(0, duration - visibleSeconds));
}

export function centerOn(time: number, visibleSeconds: number, duration: number): number {
  return clampViewStart(time - visibleSeconds / 2, visibleSeconds, duration);
}

export function followPlayhead(
  time: number,
  start: number,
  visibleSeconds: number,
  duration: number,
): number {
  const earliest = start + visibleSeconds * PLAYHEAD_SAFE_MARGIN;
  const latest = start + visibleSeconds * (1 - PLAYHEAD_SAFE_MARGIN);
  if (time >= earliest && time <= latest) return start;
  return clampViewStart(time - visibleSeconds * PLAYHEAD_LEAD_FRACTION, visibleSeconds, duration);
}

export function clampOffset(offsetMs: number): number {
  return clamp(Math.round(offsetMs), -LYRICS_OFFSET_LIMIT_MS, LYRICS_OFFSET_LIMIT_MS);
}

export function snapOffset(offsetMs: number): number {
  return clampOffset(Math.round(offsetMs / OFFSET_SNAP_MS) * OFFSET_SNAP_MS);
}

export function offsetAfterDrag(startOffsetMs: number, deltaX: number, view: TimelineView): number {
  const deltaMs = (deltaX / view.width) * view.visibleSeconds * MILLISECONDS_PER_SECOND;
  return snapOffset(startOffsetMs + deltaMs);
}

export function offsetToMarkLine(line: LyricLine, markedTime: number): number {
  return snapOffset((markedTime - line.start) * MILLISECONDS_PER_SECOND);
}

export function shiftedLines(
  lines: readonly LyricLine[],
  offsetMs: number,
  from: number,
  to: number,
): Array<{ line: LyricLine; index: number; start: number; end: number }> {
  const shift = offsetMs / MILLISECONDS_PER_SECOND;
  const visible: Array<{ line: LyricLine; index: number; start: number; end: number }> = [];
  lines.forEach((line, index) => {
    const start = line.start + shift;
    const end = line.end + shift;
    if (end >= from && start <= to) visible.push({ line, index, start, end });
  });
  return visible;
}
