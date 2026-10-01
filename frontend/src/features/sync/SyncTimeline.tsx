import type { LyricLine } from '@caraoke/shared';
import { useEffect, useRef } from 'react';
import { formatDuration } from '../../lib/format';
import { HOP_SECONDS } from '../../lib/lyrics/vocalAnalysis';
import type { DragMode } from './useLyricsEditor';
import {
  centerOn,
  clampViewStart,
  followPlayhead,
  timeToX,
  xToTime,
  type TimelineView,
} from './timelineMath';

const HEIGHT_PX = 240;
const WAVE_HEIGHT_FRACTION = 0.58;
const LANE_PADDING_PX = 6;
const TICK_AREA_PX = 18;
const CLICK_TOLERANCE_PX = 4;
const EDGE_GRAB_PX = 9;
const ONSET_MARK_PX = 6;

interface SyncTimelineProps {
  envelope: Float32Array;
  duration: number;
  lines: readonly LyricLine[];
  onsets: readonly number[];
  selectedIndex: number;
  zoomSeconds: number;
  isPlaying: boolean;
  recenterSignal: number;
  getTime: () => number;
  onSelect: (index: number) => void;
  onSeek: (seconds: number) => void;
  onDragStart: () => void;
  onDrag: (index: number, mode: DragMode, deltaSeconds: number) => void;
  onDragEnd: () => void;
}

type DragState =
  | { kind: 'line'; index: number; mode: DragMode; startX: number }
  | { kind: 'pan'; startX: number; startViewStart: number; moved: boolean };

interface Palette {
  surface: string;
  voice: string;
  lyric: string;
  lyricActive: string;
  text: string;
  muted: string;
}

function readPalette(element: HTMLElement): Palette {
  const styles = getComputedStyle(element);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    surface: read('--surface', '#16161d'),
    voice: read('--accent', '#f5c518'),
    lyric: read('--primary', '#e50914'),
    lyricActive: read('--lyric-sung', '#f5c518'),
    text: read('--text', '#ffffff'),
    muted: read('--text-muted', '#a0a0ab'),
  };
}

function tickStep(visibleSeconds: number): number {
  if (visibleSeconds <= 20) return 1;
  if (visibleSeconds <= 40) return 5;
  return 10;
}

function laneGeometry() {
  const top = HEIGHT_PX * WAVE_HEIGHT_FRACTION + LANE_PADDING_PX;
  return { top, height: HEIGHT_PX - top - LANE_PADDING_PX };
}

function drawTicks(context: CanvasRenderingContext2D, view: TimelineView, palette: Palette): void {
  const step = tickStep(view.visibleSeconds);
  const first = Math.ceil(view.start / step) * step;
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  for (let time = first; time <= view.start + view.visibleSeconds; time += step) {
    const x = timeToX(time, view);
    context.fillStyle = palette.muted;
    context.globalAlpha = 0.35;
    context.fillRect(x, 0, 1, HEIGHT_PX);
    context.globalAlpha = 1;
    context.fillText(formatDuration(time), x + 3, 2);
  }
}

function drawVoice(
  context: CanvasRenderingContext2D,
  view: TimelineView,
  envelope: Float32Array,
  onsets: readonly number[],
  palette: Palette,
): void {
  const waveHeight = HEIGHT_PX * WAVE_HEIGHT_FRACTION - TICK_AREA_PX;
  const middle = TICK_AREA_PX + waveHeight / 2;
  context.fillStyle = palette.voice;
  for (let x = 0; x < view.width; x++) {
    const amplitude = envelope[Math.floor(xToTime(x, view) / HOP_SECONDS)];
    if (amplitude === undefined) continue;
    const barHeight = Math.max(1, amplitude * waveHeight);
    context.fillRect(x, middle - barHeight / 2, 1, barHeight);
  }

  const baseline = HEIGHT_PX * WAVE_HEIGHT_FRACTION;
  context.fillStyle = palette.text;
  for (const onset of onsets) {
    const x = timeToX(onset, view);
    if (x < -ONSET_MARK_PX || x > view.width + ONSET_MARK_PX) continue;
    context.beginPath();
    context.moveTo(x, baseline - ONSET_MARK_PX);
    context.lineTo(x - ONSET_MARK_PX / 2, baseline);
    context.lineTo(x + ONSET_MARK_PX / 2, baseline);
    context.closePath();
    context.fill();
  }
}

function drawLines(
  context: CanvasRenderingContext2D,
  view: TimelineView,
  lines: readonly LyricLine[],
  selectedIndex: number,
  time: number,
  palette: Palette,
): void {
  const { top, height } = laneGeometry();
  const to = view.start + view.visibleSeconds;

  context.font = '14px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => {
    if (line.end < view.start || line.start > to) return;

    const left = timeToX(line.start, view);
    const width = Math.max(3, timeToX(line.end, view) - left - 2);
    const isActive = time >= line.start && time < line.end;
    const isSelected = index === selectedIndex;
    const color = isActive ? palette.lyricActive : palette.lyric;

    context.fillStyle = color;
    context.globalAlpha = isSelected ? 0.6 : isActive ? 0.45 : 0.28;
    context.fillRect(left, top, width, height);
    context.globalAlpha = 1;
    context.fillRect(left, top, 3, height);

    if (isSelected) {
      context.strokeStyle = palette.text;
      context.lineWidth = 2;
      context.strokeRect(left + 1, top + 1, width - 2, height - 2);
      context.fillStyle = palette.text;
      context.fillRect(left - 2, top + height / 2 - 12, 5, 24);
      context.fillRect(left + width - 3, top + height / 2 - 12, 5, 24);
    }

    context.save();
    context.beginPath();
    context.rect(left, top, Math.max(0, width - 4), height);
    context.clip();
    context.fillStyle = palette.text;
    context.fillText(`${index + 1}. ${line.text}`, left + 8, top + height / 2);
    context.restore();
  });
}

function draw(
  canvas: HTMLCanvasElement,
  props: SyncTimelineProps,
  view: TimelineView,
  time: number,
  pixelRatio: number,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const palette = readPalette(canvas);

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, view.width, HEIGHT_PX);
  context.fillStyle = palette.surface;
  context.fillRect(0, 0, view.width, HEIGHT_PX);

  drawTicks(context, view, palette);
  drawVoice(context, view, props.envelope, props.onsets, palette);
  drawLines(context, view, props.lines, props.selectedIndex, time, palette);

  const playheadX = timeToX(time, view);
  if (playheadX >= 0 && playheadX <= view.width) {
    context.fillStyle = palette.text;
    context.fillRect(playheadX - 1, 0, 2, HEIGHT_PX);
  }
}

export function SyncTimeline(props: SyncTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const viewStartRef = useRef(0);
  const widthRef = useRef(0);
  const pixelRatioRef = useRef(1);
  const dragRef = useRef<DragState | null>(null);
  const lastZoomRef = useRef(props.zoomSeconds);

  propsRef.current = props;

  const currentView = (): TimelineView => ({
    start: viewStartRef.current,
    visibleSeconds: propsRef.current.zoomSeconds,
    width: widthRef.current,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const width = canvas.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      widthRef.current = width;
      pixelRatioRef.current = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(HEIGHT_PX * ratio);
    };
    resize();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);

    let frame = 0;
    const tick = () => {
      const latest = propsRef.current;
      const time = latest.getTime();
      if (latest.isPlaying && !dragRef.current) {
        viewStartRef.current = followPlayhead(
          time,
          viewStartRef.current,
          latest.zoomSeconds,
          latest.duration,
        );
      }
      if (widthRef.current > 0) draw(canvas, latest, currentView(), time, pixelRatioRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const center = viewStartRef.current + lastZoomRef.current / 2;
    lastZoomRef.current = props.zoomSeconds;
    viewStartRef.current = centerOn(center, props.zoomSeconds, props.duration);
  }, [props.zoomSeconds, props.duration]);

  useEffect(() => {
    const latest = propsRef.current;
    const target = latest.lines[latest.selectedIndex]?.start ?? latest.getTime();
    viewStartRef.current = centerOn(Math.max(target, 0), latest.zoomSeconds, latest.duration);
  }, [props.recenterSignal]);

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hitTest = (x: number, y: number): { index: number; mode: DragMode } | null => {
    if (y <= HEIGHT_PX * WAVE_HEIGHT_FRACTION) return null;
    const view = currentView();
    const { lines, selectedIndex } = propsRef.current;
    const edge = Math.min(EDGE_GRAB_PX, view.width / 12);

    const candidates = lines
      .map((line, index) => ({ index, left: timeToX(line.start, view), right: timeToX(line.end, view) }))
      .filter((item) => x >= item.left - edge && x <= item.right + edge);
    if (candidates.length === 0) return null;

    const chosen = candidates.find((item) => item.index === selectedIndex) ?? candidates[0];
    if (!chosen) return null;
    if (Math.abs(x - chosen.left) <= edge) return { index: chosen.index, mode: 'start' };
    if (Math.abs(x - chosen.right) <= edge && chosen.right - chosen.left > edge * 2) {
      return { index: chosen.index, mode: 'end' };
    }
    return { index: chosen.index, mode: 'move' };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = localPoint(event);
    const hit = hitTest(x, y);

    if (hit) {
      propsRef.current.onSelect(hit.index);
      propsRef.current.onDragStart();
      dragRef.current = { kind: 'line', index: hit.index, mode: hit.mode, startX: event.clientX };
      return;
    }
    dragRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startViewStart: viewStartRef.current,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = event.currentTarget;
    if (!drag) {
      const { x, y } = localPoint(event);
      const hit = hitTest(x, y);
      canvas.style.cursor = hit ? (hit.mode === 'move' ? 'grab' : 'ew-resize') : 'pointer';
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const secondsPerPixel = propsRef.current.zoomSeconds / widthRef.current;

    if (drag.kind === 'line') {
      propsRef.current.onDrag(drag.index, drag.mode, deltaX * secondsPerPixel);
      return;
    }
    if (Math.abs(deltaX) > CLICK_TOLERANCE_PX) drag.moved = true;
    viewStartRef.current = clampViewStart(
      drag.startViewStart - deltaX * secondsPerPixel,
      propsRef.current.zoomSeconds,
      propsRef.current.duration,
    );
  };

  const finishDrag = (event: React.PointerEvent<HTMLCanvasElement>, isCanceled: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === 'line') {
      propsRef.current.onDragEnd();
      return;
    }
    if (isCanceled || drag.moved) return;
    const { x } = localPoint(event);
    propsRef.current.onSeek(xToTime(x, currentView()));
  };

  const ariaLabel =
    'Linha do tempo: a onda amarela é a voz, os triângulos são os inícios de frase e as faixas coloridas são as linhas da letra. ' +
    'Arraste uma faixa para mover a linha, as bordas para mudar o começo ou o fim, ou toque na onda para escolher o ponto da música.';

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishDrag(event, false)}
      onPointerCancel={(event) => finishDrag(event, true)}
      style={{ height: HEIGHT_PX, touchAction: 'pan-y' }}
      className="block w-full rounded-xl"
    />
  );
}
