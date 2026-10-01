import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSongsInfiniteQuery, type SongSort, type SongStatusFilter } from '../../api/songs';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useProfileStore } from '../../stores/useProfileStore';
import { SongCard } from '../songs/SongCard';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_SORT: SongSort = 'recent';

const SORT_OPTIONS: Array<{ value: SongSort; label: string }> = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'title', label: 'Título (A–Z)' },
  { value: 'artist', label: 'Artista (A–Z)' },
  { value: 'popular', label: 'Mais cantadas' },
];

const STATUS_OPTIONS: Array<{ value: SongStatusFilter | ''; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'READY', label: 'Prontas' },
  { value: 'QUEUED', label: 'Na fila' },
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'ERROR', label: 'Com erro' },
];

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((option) => option.value));
const STATUS_VALUES = new Set<string>(STATUS_OPTIONS.map((option) => option.value).filter(Boolean));

const SELECT_CLASSES = 'min-h-11 rounded-lg bg-surface-2 px-3 text-base text-text';

function readSort(value: string | null): SongSort {
  return value && SORT_VALUES.has(value) ? (value as SongSort) : DEFAULT_SORT;
}

function readStatus(value: string | null): SongStatusFilter | undefined {
  return value && STATUS_VALUES.has(value) ? (value as SongStatusFilter) : undefined;
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const profileId = useProfileStore((state) => state.currentProfile?.id);

  const query = (searchParams.get('q') ?? '').trim();
  const sort = readSort(searchParams.get('sort'));
  const status = readStatus(searchParams.get('status'));
  const artist = searchParams.get('artist') ?? undefined;

  const [draft, setDraft] = useState(query);
  const debouncedDraft = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS).trim();
  const sentinel = useRef<HTMLDivElement>(null);

  function updateParam(key: string, value: string | undefined) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if (debouncedDraft !== query) updateParam('q', debouncedDraft || undefined);
  }, [debouncedDraft]);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  const songs = useSongsInfiniteQuery({ q: query || undefined, status, artist, sort, profileId });
  const items = songs.data?.pages.flatMap((page) => page.items) ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = songs;
  const hasFilters = Boolean(query || status || artist);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl sm:text-5xl">Biblioteca</h1>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex min-h-11 flex-1 items-center gap-3 rounded-xl bg-surface-2 px-4">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted" />
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Buscar na biblioteca"
            placeholder="Buscar por título ou artista…"
            className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Situação
            <select
              value={status ?? ''}
              onChange={(event) => updateParam('status', event.target.value || undefined)}
              className={SELECT_CLASSES}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted">
            Ordenar por
            <select
              value={sort}
              onChange={(event) =>
                updateParam('sort', event.target.value === DEFAULT_SORT ? undefined : event.target.value)
              }
              className={SELECT_CLASSES}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {artist && (
        <button
          type="button"
          onClick={() => updateParam('artist', undefined)}
          aria-label={`Remover filtro de artista ${artist}`}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-surface-2 px-4 text-sm hover:bg-surface"
        >
          Artista: {artist}
          <X aria-hidden="true" className="size-4" />
        </button>
      )}

      {songs.isLoading && <Spinner className="size-8" />}

      {songs.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as músicas.
        </p>
      )}

      {songs.isSuccess && items.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <p className="text-lg">
            {hasFilters ? 'Nenhuma música encontrada.' : 'Nenhuma música na biblioteca ainda.'}
          </p>
          {!hasFilters && (
            <Link
              to="/youtube"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
            >
              Buscar no YouTube
            </Link>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((song) => (
            <li key={song.id}>
              <SongCard song={song} />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinel} className="flex justify-center">
        {hasNextPage && (
          <Button variant="secondary" onClick={() => void fetchNextPage()} isLoading={isFetchingNextPage}>
            Carregar mais
          </Button>
        )}
      </div>
    </div>
  );
}
