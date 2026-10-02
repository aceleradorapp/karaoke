import clsx from 'clsx';
import { Maximize, Mic, Minimize, Minus, Pause, Play, Plus, Volume2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { formatDuration } from '../../lib/format';

const TIME_REFRESH_MS = 250;
const SEEK_RESOLUTION = 1000;
const ICON_BUTTON = 'inline-flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-white/10';

interface PlayerControlsProps {
  isPlaying: boolean;
  voiceGuide: boolean;
  hasVocals: boolean;
  volume: number;
  duration: number;
  lyricsOffsetMs: number;
  isFullscreen: boolean;
  getTime: () => number;
  onTogglePlay: () => void;
  onSeekTo: (seconds: number) => void;
  onToggleVoiceGuide: () => void;
  onVolumeChange: (volume: number) => void;
  onAdjustLyricsOffset: (deltaMs: number) => void;
  onToggleFullscreen: () => void;
  onExit: () => void;
  lyricsEffect?: ReactNode;
}

function useCurrentTime(getTime: () => number): number {
  const [time, setTime] = useState(getTime());
  useEffect(() => {
    const timer = setInterval(() => setTime(getTime()), TIME_REFRESH_MS);
    return () => clearInterval(timer);
  }, [getTime]);
  return time;
}

function formatOffset(offsetMs: number): string {
  if (offsetMs === 0) return '0 ms';
  return `${offsetMs > 0 ? '+' : ''}${offsetMs} ms`;
}

export function PlayerControls(props: PlayerControlsProps) {
  const time = useCurrentTime(props.getTime);
  const sliderValue = props.duration > 0 ? Math.round((time / props.duration) * SEEK_RESOLUTION) : 0;

  return (
    <div className="flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 text-white sm:px-8">
      <div className="flex items-center gap-3">
        <span className="w-12 text-right text-sm tabular-nums">{formatDuration(time)}</span>
        <input
          type="range"
          min={0}
          max={SEEK_RESOLUTION}
          value={sliderValue}
          onChange={(event) =>
            props.onSeekTo((Number(event.target.value) / SEEK_RESOLUTION) * props.duration)
          }
          aria-label="Posição da música"
          className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
        />
        <span className="w-12 text-sm tabular-nums">{formatDuration(props.duration)}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onTogglePlay}
            aria-label={props.isPlaying ? 'Pausar' : 'Continuar'}
            className={clsx(ICON_BUTTON, 'size-14 bg-white/15')}
          >
            {props.isPlaying ? (
              <Pause aria-hidden="true" className="size-7 fill-current" />
            ) : (
              <Play aria-hidden="true" className="size-7 fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={props.onToggleVoiceGuide}
            disabled={!props.hasVocals}
            aria-pressed={props.voiceGuide}
            title={props.hasVocals ? undefined : 'Esta música não tem a faixa de voz'}
            className={clsx(
              'inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold transition',
              'disabled:cursor-not-allowed disabled:opacity-40',
              props.voiceGuide ? 'bg-primary text-primary-contrast' : 'bg-white/15 hover:bg-white/25',
            )}
          >
            <Mic aria-hidden="true" className="size-5" />
            Voz guia: {props.voiceGuide ? 'ligada' : 'desligada'}
          </button>
          {props.lyricsEffect}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-sm sm:inline">Atraso da letra</span>
          <button
            type="button"
            onClick={() => props.onAdjustLyricsOffset(-100)}
            aria-label="Adiantar a letra 100 ms"
            className={ICON_BUTTON}
          >
            <Minus aria-hidden="true" className="size-5" />
          </button>
          <span aria-label="Atraso da letra" className="w-20 text-center text-sm tabular-nums">
            {formatOffset(props.lyricsOffsetMs)}
          </span>
          <button
            type="button"
            onClick={() => props.onAdjustLyricsOffset(100)}
            aria-label="Atrasar a letra 100 ms"
            className={ICON_BUTTON}
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 aria-hidden="true" className="size-5" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(props.volume * 100)}
            onChange={(event) => props.onVolumeChange(Number(event.target.value) / 100)}
            aria-label="Volume"
            className="w-24 cursor-pointer accent-[var(--primary)] sm:w-32"
          />
          <button
            type="button"
            onClick={props.onToggleFullscreen}
            aria-label={props.isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            className={ICON_BUTTON}
          >
            {props.isFullscreen ? (
              <Minimize aria-hidden="true" className="size-5" />
            ) : (
              <Maximize aria-hidden="true" className="size-5" />
            )}
          </button>
          <button type="button" onClick={props.onExit} aria-label="Sair" className={ICON_BUTTON}>
            <X aria-hidden="true" className="size-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
