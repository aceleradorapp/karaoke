import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLyricsQuery } from '../../api/lyrics';
import { usePlayerStateQuery } from '../../api/playerState';
import { Avatar } from '../../components/Avatar';
import { Spinner } from '../../components/Spinner';
import { mediaUrlForDevice } from '../../lib/deviceMedia';
import { measureClockOffset, positionAt } from '../../lib/serverClock';
import { useKeepAwake } from '../../lib/useKeepAwake';
import {
  LYRICS_ADJUST_LIMIT_MS,
  LYRICS_ADJUST_STEP_MS,
  useMobileLyricsStore,
} from '../../stores/useMobileLyricsStore';
import { LyricsEffectToggle } from '../player/LyricsEffectControls';
import { LyricsView } from '../player/LyricsView';

const RESYNC_INTERVAL_MS = 60_000;
const MS_PER_SECOND = 1000;

function useClockOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    const measure = () =>
      measureClockOffset()
        .then((measured) => isCurrent && setOffset(measured))
        .catch(() => undefined);
    void measure();
    const timer = setInterval(() => void measure(), RESYNC_INTERVAL_MS);
    return () => {
      isCurrent = false;
      clearInterval(timer);
    };
  }, []);
  return offset;
}

export function MobileLyricsPage() {
  const player = usePlayerStateQuery();
  const state = player.data ?? null;
  const clockOffset = useClockOffset();
  const lyrics = useLyricsQuery(mediaUrlForDevice(state?.song.lyricsUrl ?? null));
  const keepAwake = useKeepAwake(state !== null);
  const isEffectEnabled = useMobileLyricsStore((store) => store.isEffectEnabled);
  const setEffectEnabled = useMobileLyricsStore((store) => store.setEffectEnabled);
  const adjustMs = useMobileLyricsStore((store) => store.adjustMs);
  const adjustBy = useMobileLyricsStore((store) => store.adjustBy);
  const latest = useRef({ state, clockOffset, adjustMs });
  latest.current = { state, clockOffset, adjustMs };

  if (player.isLoading) return <Spinner className="mx-auto mt-10 size-8" />;

  if (!state) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-4">
        <h1 className="font-display text-3xl">Letra</h1>
        <p className="text-base">
          Nenhuma música tocando agora. Quando a TV começar a próxima, a letra aparece aqui.
        </p>
        <Link to="/m/fila" className="min-h-11 content-center text-base text-primary underline">
          Ver quem vai cantar
        </Link>
      </div>
    );
  }

  const getTime = () => {
    const current = latest.current.state;
    if (!current) return 0;
    return positionAt(current, latest.current.clockOffset) + latest.current.adjustMs / MS_PER_SECOND;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        {state.singer && <Avatar avatarId={state.singer.avatar} size="sm" />}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">
            {state.singer ? `${state.singer.name} canta` : 'Tocando agora'}
          </p>
          <p className="truncate text-sm text-muted">
            {state.song.title} — {state.song.artist}
          </p>
        </div>
        {!state.playing && (
          <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-3 text-sm">pausado</span>
        )}
      </header>

      <div className="flex min-h-[50vh] items-center">
        {lyrics.isLoading ? (
          <Spinner className="mx-auto size-8" />
        ) : (
          <div className="w-full">
            <LyricsView
              doc={lyrics.data ?? null}
              getTime={getTime}
              offsetMs={state.offsetMs}
              durationSec={state.song.durationSec ?? 0}
              effect={{ ...state.effect, enabled: state.effect.enabled && isEffectEnabled }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <LyricsEffectToggle enabled={isEffectEnabled} onEnabledChange={setEffectEnabled} />
        <div role="group" aria-label="Ajuste da letra neste celular" className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => adjustBy(-LYRICS_ADJUST_STEP_MS)}
            disabled={adjustMs <= -LYRICS_ADJUST_LIMIT_MS}
            aria-label="Atrasar a letra"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
          >
            <Minus aria-hidden="true" className="size-5" />
          </button>
          <span className="w-24 text-center text-sm tabular-nums">
            Letra {adjustMs > 0 ? '+' : ''}
            {(adjustMs / MS_PER_SECOND).toFixed(1).replace('.', ',')} s
          </span>
          <button
            type="button"
            onClick={() => adjustBy(LYRICS_ADJUST_STEP_MS)}
            disabled={adjustMs >= LYRICS_ADJUST_LIMIT_MS}
            aria-label="Adiantar a letra"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      <p className="text-center text-sm text-muted">
        A letra está atrasada em relação à TV? Toque em + para adiantar. Ou desligue o efeito para a frase
        ficar toda colorida de uma vez.
      </p>

      {keepAwake === 'unavailable' && (
        <p className="text-sm text-muted">
          Se a tela apagar, aumente o tempo de "tela apagada" nas configurações do celular.
        </p>
      )}
    </div>
  );
}
