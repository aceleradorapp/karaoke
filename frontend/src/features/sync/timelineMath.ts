export const ZOOM_LEVELS = [10, 20, 40, 80] as const;
export const DEFAULT_ZOOM_SECONDS = 20;
export const PLAYHEAD_LEAD_FRACTION = 0.25;
const PLAYHEAD_SAFE_MARGIN = 0.1;

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
