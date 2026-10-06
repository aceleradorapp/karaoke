import { CheckSquare, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDeleteSongsMutation, useSongsInfiniteQuery, type SongSort, type SongStatusFilter } from '../../api/songs';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';
import { SongCard } from '../songs/SongCard';
import { SelectableSongCard } from './SelectableSongCard';

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

function songsLabel(count: number): string {
  return count === 1 ? '1 música' : `${count} músicas`;
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
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteSongs = useDeleteSongsMutation();

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
  const selectedCount = selectedIds.size;
  const areAllSelected = items.length > 0 && items.every((song) => selectedIds.has(song.id));

  function stopSelecting() {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSong(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(areAllSelected ? new Set() : new Set(items.map((song) => song.id)));
  }

  function confirmDelete() {
    setIsConfirmingDelete(false);
    deleteSongs.mutate([...selectedIds], {
      onSuccess: (result) => {
        if (result.deleted.length > 0) toast.success(`${songsLabel(result.deleted.length)} excluída(s)`);
        for (const skipped of result.skipped) {
          toast.error(`Não excluí “${skipped.title ?? 'uma música'}”: ${skipped.reason}`);
        }
        stopSelecting();
      },
      onError: () => toast.error('Não foi possível excluir as músicas'),
    });
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl sm:text-5xl">Biblioteca</h1>
        {items.length > 0 && !isSelecting && (
          <Button variant="secondary" onClick={() => setIsSelecting(true)}>
            <CheckSquare aria-hidden="true" className="size-5" />
            Selecionar
          </Button>
        )}
      </div>

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
              {isSelecting ? (
                <SelectableSongCard
                  song={song}
                  isSelected={selectedIds.has(song.id)}
                  onToggle={() => toggleSong(song.id)}
                />
              ) : (
                <SongCard song={song} />
              )}
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
      {isSelecting && (
        <div
          role="toolbar"
          aria-label="Músicas selecionadas"
          className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-white/10"
        >
          <span className="mr-auto px-2 text-base font-semibold" aria-live="polite">
            {selectedCount === 0 ? 'Toque nas músicas para marcar' : `${songsLabel(selectedCount)} selecionada(s)`}
          </span>
          <Button variant="ghost" onClick={toggleAll}>
            {areAllSelected ? 'Desmarcar todas' : 'Marcar todas'}
          </Button>
          <Button
            variant="danger"
            onClick={() => setIsConfirmingDelete(true)}
            disabled={selectedCount === 0}
            isLoading={deleteSongs.isPending}
          >
            <Trash2 aria-hidden="true" className="size-5" />
            Excluir
          </Button>
          <Button variant="secondary" onClick={stopSelecting}>
            <X aria-hidden="true" className="size-5" />
            Cancelar
          </Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Excluir músicas"
        message={`Excluir ${songsLabel(selectedCount)}? O áudio, a letra e o histórico delas serão apagados. Não dá para desfazer.`}
        confirmLabel="Excluir"
        dismissLabel="Voltar"
        onConfirm={confirmDelete}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}
