import type { LyricLine } from '@caraoke/shared';
import { useEffect, useRef } from 'react';
import { formatDuration } from '../../lib/format';
import { HOP_SECONDS } from '../../lib/lyrics/vocalAnalysis';
import {
  centerOn,
  clampViewStart,
  followPlayhead,
  offsetAfterDrag,
  shiftedLines,
  timeToX,
  xToTime,
  type TimelineView,
} from './timelineMath';

const HEIGHT_PX = 240;
const WAVE_HEIGHT_FRACTION = 0.58;
const LANE_PADDING_PX = 6;
const TICK_AREA_PX = 18;
const CLICK_TOLERANCE_PX = 4;
const MILLISECONDS_PER_SECOND = 1000;

interface SyncTimelineProps {
  envelope: Float32Array;
  duration: number;
  lines: readonly LyricLine[];
  offsetMs: number;
  zoomSeconds: number;
  isPlaying: boolean;
  recenterSignal: number;
  getTime: () => number;
  onOffsetChange: (offsetMs: number) => void;
  onSeek: (seconds: number) => void;
}

interface DragState {
  mode: 'lyrics' | 'pan';
  startX: number;
  startOffsetMs: number;
  startViewStart: number;
  moved: boolean;
}

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

function drawTicks(context: CanvasRenderingContext2D, view: TimelineView, palette: Palette): void {
  const step = tickStep(view.visibleSeconds);
  const first = Math.ceil(view.start / step) * step;
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  for (let time = first; time <= view.start + view.visibleSeconds; time += step) {
    const x = timeToX(time, view);
    const isMajor = time % (step * 5) === 0 || step >= 5;
    context.fillStyle = palette.muted;
    context.globalAlpha = 0.35;
    context.fillRect(x, 0, 1, HEIGHT_PX);
    context.globalAlpha = 1;
    if (isMajor) context.fillText(formatDuration(time), x + 3, 2);
  }
}

function drawVoice(
  context: CanvasRenderingContext2D,
  view: TimelineView,
  envelope: Float32Array,
  palette: Palette,
): void {
  const waveHeight = HEIGHT_PX * WAVE_HEIGHT_FRACTION - TICK_AREA_PX;
  const middle = TICK_AREA_PX + waveHeight / 2;
  context.fillStyle = palette.voice;
  for (let x = 0; x < view.width; x++) {
    const index = Math.floor(xToTime(x, view) / HOP_SECONDS);
    const amplitude = envelope[index];
    if (amplitude === undefined) continue;
    const barHeight = Math.max(1, amplitude * waveHeight);
    context.fillRect(x, middle - barHeight / 2, 1, barHeight);
  }
}

function drawLyrics(
  context: CanvasRenderingContext2D,
  view: TimelineView,
  lines: readonly LyricLine[],
  offsetMs: number,
  time: number,
  palette: Palette,
): void {
  const laneTop = HEIGHT_PX * WAVE_HEIGHT_FRACTION + LANE_PADDING_PX;
  const laneHeight = HEIGHT_PX - laneTop - LANE_PADDING_PX;
  const visible = shiftedLines(lines, offsetMs, view.start, view.start + view.visibleSeconds);

  context.font = '14px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  for (const { line, start, end } of visible) {
    const left = timeToX(start, view);
    const right = timeToX(end, view);
    const isActive = time >= start && time < end;

    context.fillStyle = isActive ? palette.lyricActive : palette.lyric;
    context.globalAlpha = isActive ? 0.45 : 0.28;
    context.fillRect(left, laneTop, Math.max(2, right - left - 2), laneHeight);
    context.globalAlpha = 1;
    context.fillStyle = isActive ? palette.lyricActive : palette.lyric;
    context.fillRect(left, laneTop, 3, laneHeight);

    context.save();
    context.beginPath();
    context.rect(left, laneTop, Math.max(0, right - left - 4), laneHeight);
    context.clip();
    context.fillStyle = palette.text;
    context.fillText(line.text, left + 8, laneTop + laneHeight / 2);
    context.restore();
  }
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
  drawVoice(context, view, props.envelope, palette);
  drawLyrics(context, view, props.lines, props.offsetMs, time, palette);

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
    const previousZoom = lastZoomRef.current;
    const center = viewStartRef.current + previousZoom / 2;
    lastZoomRef.current = props.zoomSeconds;
    viewStartRef.current = centerOn(center, props.zoomSeconds, props.duration);
  }, [props.zoomSeconds, props.duration]);

  useEffect(() => {
    viewStartRef.current = centerOn(
      propsRef.current.getTime(),
      propsRef.current.zoomSeconds,
      propsRef.current.duration,
    );
  }, [props.recenterSignal]);

  const isOverLyrics = (clientY: number): boolean => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientY - rect.top > HEIGHT_PX * WAVE_HEIGHT_FRACTION;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode: isOverLyrics(event.clientY) ? 'lyrics' : 'pan',
      startX: event.clientX,
      startOffsetMs: propsRef.current.offsetMs,
      startViewStart: viewStartRef.current,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = event.currentTarget;
    if (!drag) {
      canvas.style.cursor = isOverLyrics(event.clientY) ? 'ew-resize' : 'pointer';
      return;
    }

    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > CLICK_TOLERANCE_PX) drag.moved = true;

    if (drag.mode === 'lyrics') {
      const view = { ...currentView(), start: drag.startViewStart };
      propsRef.current.onOffsetChange(offsetAfterDrag(drag.startOffsetMs, deltaX, view));
      return;
    }

    const secondsMoved = (deltaX / widthRef.current) * propsRef.current.zoomSeconds;
    viewStartRef.current = clampViewStart(
      drag.startViewStart - secondsMoved,
      propsRef.current.zoomSeconds,
      propsRef.current.duration,
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved || drag.mode !== 'pan') return;
    const rect = event.currentTarget.getBoundingClientRect();
    propsRef.current.onSeek(xToTime(event.clientX - rect.left, currentView()));
  };

  const ariaLabel =
    `Linha do tempo: a onda amarela é a voz e as faixas coloridas são as linhas da letra, adiantadas ou atrasadas em ${props.offsetMs / MILLISECONDS_PER_SECOND} segundos. ` +
    'Arraste as faixas para mover a letra, ou toque na onda para escolher o ponto da música.';

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (dragRef.current = null)}
      style={{ height: HEIGHT_PX, touchAction: 'pan-y' }}
      className="block w-full rounded-xl"
    />
  );
}
