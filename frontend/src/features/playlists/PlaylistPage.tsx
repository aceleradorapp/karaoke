import { PLAYLIST_NAME_MAX_LENGTH, type PlaylistDetailDTO, type SongDTO } from '@caraoke/shared';
import { ArrowLeft, Play, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import {
  useDeletePlaylistMutation,
  usePlaylistQuery,
  useRemovePlaylistItemMutation,
  useRenamePlaylistMutation,
  useReorderPlaylistMutation,
} from '../../api/playlists';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SaveIndicator } from '../../components/SaveIndicator';
import { Spinner } from '../../components/Spinner';
import { buildPlayQueue, newShuffleSeed, playerRoute } from '../../lib/playQueue';
import { useAutoSave } from '../../lib/useAutoSave';
import { toast } from '../../stores/useToastStore';
import { PlaylistSongList } from './PlaylistSongList';

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <h1 className="font-display text-4xl">Playlist não encontrada</h1>
      <Link
        to="/playlists"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
      >
        Voltar para as playlists
      </Link>
    </div>
  );
}

function PlaylistEditor({ playlist }: { playlist: PlaylistDetailDTO }) {
  const navigate = useNavigate();
  const rename = useRenamePlaylistMutation(playlist.id);
  const removeItem = useRemovePlaylistItemMutation(playlist.id);
  const reorder = useReorderPlaylistMutation(playlist.id);
  const deletePlaylist = useDeletePlaylistMutation();
  const [name, setName] = useState(playlist.name);
  const [songToRemove, setSongToRemove] = useState<SongDTO | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const trimmedName = name.trim();
  const isNameEmpty = trimmedName.length === 0;
  const autoSave = useAutoSave(trimmedName, (value) => rename.mutateAsync(value), {
    isValid: (value) => value.length > 0 && value.length <= PLAYLIST_NAME_MAX_LENGTH,
  });
  const nameError =
    rename.error instanceof ApiError && trimmedName !== playlist.name ? rename.error.message : null;

  const queue = buildPlayQueue(playlist.items, null);
  const canPlay = queue.length > 0;

  function playAll(isShuffled: boolean) {
    const seed = isShuffled ? newShuffleSeed() : null;
    const first = buildPlayQueue(playlist.items, seed)[0];
    if (first) navigate(playerRoute(first.id, playlist.id, seed));
  }

  function playSong(song: SongDTO) {
    navigate(playerRoute(song.id, playlist.id, null));
  }

  function confirmRemove() {
    const song = songToRemove;
    if (!song) return;
    removeItem.mutate(song.id, {
      onSuccess: () => toast.success(`${song.title} saiu da playlist`),
      onError: () => toast.error('Não foi possível tirar a música da playlist'),
      onSettled: () => setSongToRemove(null),
    });
  }

  function confirmDelete() {
    deletePlaylist.mutate(playlist.id, {
      onSuccess: () => {
        toast.success('Playlist excluída');
        navigate('/playlists');
      },
      onError: () => {
        setIsConfirmingDelete(false);
        toast.error('Não foi possível excluir a playlist');
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        to="/playlists"
        className="inline-flex min-h-11 items-center gap-2 self-start text-base text-muted hover:text-text"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        Minhas playlists
      </Link>

      <div className="flex flex-col gap-2">
        <label htmlFor="playlist-title" className="text-sm text-muted">
          Nome da playlist
        </label>
        <input
          id="playlist-title"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={PLAYLIST_NAME_MAX_LENGTH}
          aria-invalid={isNameEmpty || nameError !== null}
          className="min-h-14 w-full rounded-lg bg-surface px-4 font-display text-3xl sm:text-4xl"
        />
        <div className="flex min-h-6 flex-wrap items-center gap-3">
          <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
          {isNameEmpty && (
            <p role="alert" className="text-sm text-danger">
              Informe o nome da playlist
            </p>
          )}
          {nameError && (
            <p role="alert" className="text-sm text-danger">
              {nameError}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => playAll(false)} disabled={!canPlay}>
          <Play aria-hidden="true" className="size-5 fill-current" />
          Cantar tudo
        </Button>
        <Button size="lg" variant="secondary" onClick={() => playAll(true)} disabled={!canPlay}>
          <Shuffle aria-hidden="true" className="size-5" />
          Aleatório
        </Button>
        <p className="text-base text-muted">
          {playlist.items.length === 1 ? '1 música' : `${playlist.items.length} músicas`}
          {playlist.items.length > queue.length && ` · ${queue.length} prontas para cantar`}
        </p>
      </div>

      {playlist.items.length === 0 ? (
        <div className="rounded-2xl bg-surface p-6">
          <h2 className="text-xl font-semibold">Esta playlist está vazia</h2>
          <p className="mt-1 text-base text-muted">
            Use o botão de playlist em qualquer música da{' '}
            <Link to="/biblioteca" className="underline">
              biblioteca
            </Link>{' '}
            para colocá-la aqui.
          </p>
        </div>
      ) : (
        <PlaylistSongList
          songs={playlist.items}
          onPlay={playSong}
          onReorder={(songIds) => reorder.mutate(songIds)}
          onRemove={setSongToRemove}
        />
      )}

      <section aria-label="Zona de risco" className="flex flex-col items-start gap-3 pt-4">
        <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>
          <Trash2 aria-hidden="true" className="size-5" />
          Excluir playlist
        </Button>
      </section>

      <ConfirmDialog
        isOpen={songToRemove !== null}
        title="Tirar da playlist"
        message={`Tirar “${songToRemove?.title ?? ''}” desta playlist? A música continua na biblioteca.`}
        confirmLabel="Tirar"
        onConfirm={confirmRemove}
        onCancel={() => setSongToRemove(null)}
        isLoading={removeItem.isPending}
      />
      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Excluir playlist"
        message={`Excluir a playlist “${playlist.name}”? As músicas continuam na biblioteca. Não dá para desfazer.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setIsConfirmingDelete(false)}
        isLoading={deletePlaylist.isPending}
      />
    </div>
  );
}

export function PlaylistPage() {
  const { id } = useParams();
  const playlist = usePlaylistQuery(id);

  if (playlist.isLoading) return <Spinner className="mx-auto mt-10 size-10" />;
  if (playlist.isError) {
    const isMissing = playlist.error instanceof ApiError && playlist.error.status === 404;
    return isMissing ? (
      <NotFound />
    ) : (
      <p role="alert" className="text-danger">
        Não foi possível carregar a playlist.
      </p>
    );
  }
  if (!playlist.data) return null;

  return <PlaylistEditor key={playlist.data.id} playlist={playlist.data} />;
}
