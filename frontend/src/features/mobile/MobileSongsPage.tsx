import type { SongDTO } from '@caraoke/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSingQueueQuery } from '../../api/singQueue';
import { useSongsInfiniteQuery } from '../../api/songs';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { coverUrlForDevice } from '../../lib/deviceMedia';
import { coverGradient } from '../../lib/gradient';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { SingRequestButton } from './SingRequestButton';

const SEARCH_DEBOUNCE_MS = 300;

function SongCover({ song }: { song: SongDTO }) {
  const coverUrl = coverUrlForDevice(song.coverUrl);
  if (coverUrl) return <img src={coverUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />;
  return (
    <div
      aria-hidden="true"
      style={{ background: coverGradient(song.id) }}
      className="size-14 shrink-0 rounded-lg"
    />
  );
}

export function MobileSongsPage() {
  const profileId = useMobileProfileStore((state) => state.profile?.id);
  const [draft, setDraft] = useState('');
  const query = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS).trim();
  const songs = useSongsInfiniteQuery({ q: query || undefined, sort: 'title' });
  const queue = useSingQueueQuery();

  const visibleSongs = useMemo(
    () => (songs.data?.pages ?? []).flatMap((page) => page.items).filter((song) => song.status !== 'ERROR'),
    [songs.data],
  );
  const myRequests = useMemo(
    () =>
      new Map(
        (queue.data ?? [])
          .filter((request) => request.profile.id === profileId)
          .map((request) => [request.song.id, request]),
      ),
    [queue.data, profileId],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Músicas</h1>

      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-2 px-4">
        <Search aria-hidden="true" className="size-5 shrink-0 text-muted" />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Buscar na biblioteca"
          placeholder="Buscar música ou artista…"
          className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
        />
      </label>

      {songs.isLoading && <Spinner className="mx-auto size-8" />}
      {songs.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as músicas.
        </p>
      )}

      {songs.isSuccess && visibleSongs.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-2xl bg-surface p-4">
          <p className="text-base">
            {query ? `Nenhuma música para “${query}”.` : 'A biblioteca ainda está vazia.'}
          </p>
          <Link to="/m/buscar" className="min-h-11 content-center text-base text-primary underline">
            Buscar no YouTube
          </Link>
        </div>
      )}

      {visibleSongs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visibleSongs.map((song) => (
            <li key={song.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
              <SongCover song={song} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-base leading-snug font-semibold break-words">{song.title}</p>
                <p className="truncate text-sm text-muted">{song.artist}</p>
                {song.status !== 'READY' && <p className="text-sm text-primary">preparando…</p>}
              </div>
              {profileId && (
                <SingRequestButton
                  songId={song.id}
                  songTitle={song.title}
                  songArtist={song.artist}
                  profileId={profileId}
                  myRequest={myRequests.get(song.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {songs.hasNextPage && (
        <Button
          variant="secondary"
          onClick={() => void songs.fetchNextPage()}
          isLoading={songs.isFetchingNextPage}
        >
          Carregar mais
        </Button>
      )}
    </div>
  );
}
