import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLyricsQuery } from '../../api/lyrics';
import { usePlayerStateQuery } from '../../api/playerState';
import { Avatar } from '../../components/Avatar';
import { Spinner } from '../../components/Spinner';
import { mediaUrlForDevice } from '../../lib/deviceMedia';
import { measureClockOffset, positionAt } from '../../lib/serverClock';
import { useKeepAwake } from '../../lib/useKeepAwake';
import { LyricsView } from '../player/LyricsView';

function useClockOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    measureClockOffset()
      .then((measured) => isCurrent && setOffset(measured))
      .catch(() => undefined);
    return () => {
      isCurrent = false;
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
  const latest = useRef({ state, clockOffset });
  latest.current = { state, clockOffset };

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
    return current ? positionAt(current, latest.current.clockOffset) : 0;
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
              effect={state.effect}
            />
          </div>
        )}
      </div>

      {keepAwake === 'unavailable' && (
        <p className="text-sm text-muted">
          Se a tela apagar, aumente o tempo de "tela apagada" nas configurações do celular.
        </p>
      )}
    </div>
  );
}
