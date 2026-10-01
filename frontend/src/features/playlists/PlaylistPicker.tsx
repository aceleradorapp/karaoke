import { PLAYLIST_NAME_MAX_LENGTH } from '@caraoke/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import {
  useChangePlaylistSongMutation,
  useCreatePlaylistMutation,
  usePlaylistsQuery,
} from '../../api/playlists';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { usePlaylistPickerStore } from '../../stores/usePlaylistPickerStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';

interface PickerBodyProps {
  song: { id: string; title: string };
}

function describeCount(count: number): string {
  return count === 1 ? '1 música' : `${count} músicas`;
}

function PickerBody({ song }: PickerBodyProps) {
  const profileId = useProfileStore((state) => state.currentProfile?.id);
  const playlists = usePlaylistsQuery(profileId, song.id);
  const changeSong = useChangePlaylistSongMutation(profileId, song.id);
  const createPlaylist = useCreatePlaylistMutation(profileId);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  function toggle(playlistId: string, playlistName: string, isAdding: boolean) {
    changeSong.mutate(
      { playlistId, songId: song.id, isAdding },
      {
        onSuccess: () =>
          toast.success(isAdding ? `Adicionada a ${playlistName}` : `Removida de ${playlistName}`),
        onError: () => toast.error('Não foi possível atualizar a playlist'),
      },
    );
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setCreateError('Informe o nome da playlist');
      return;
    }
    setCreateError(null);
    try {
      const created = await createPlaylist.mutateAsync(name);
      setNewName('');
      toggle(created.id, created.name, true);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : 'Não foi possível criar a playlist');
    }
  }

  const items = playlists.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-muted">
        Adicionar <strong className="text-text">{song.title}</strong> a…
      </p>

      {playlists.isLoading && <Spinner className="mx-auto size-8" />}
      {playlists.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as playlists.
        </p>
      )}
      {playlists.isSuccess && items.length === 0 && (
        <p className="text-base text-muted">Você ainda não tem playlists. Crie a primeira abaixo.</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((playlist) => (
            <li key={playlist.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={Boolean(playlist.containsSong)}
                  onChange={() => toggle(playlist.id, playlist.name, !playlist.containsSong)}
                  className="size-5 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1 truncate text-base">{playlist.name}</span>
                <span className="text-sm text-muted">{describeCount(playlist.count)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="flex flex-col gap-2 border-t border-surface-2 pt-4">
        <label htmlFor="new-playlist-name" className="text-sm text-muted">
          Nova playlist
        </label>
        <div className="flex gap-2">
          <input
            id="new-playlist-name"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setCreateError(null);
            }}
            maxLength={PLAYLIST_NAME_MAX_LENGTH}
            placeholder="Ex.: Festa de sábado"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 text-base text-text"
          />
          <Button type="submit" isLoading={createPlaylist.isPending}>
            Criar
          </Button>
        </div>
        {createError && (
          <p role="alert" className="text-sm text-danger">
            {createError}
          </p>
        )}
      </form>
    </div>
  );
}

export function PlaylistPicker() {
  const song = usePlaylistPickerStore((state) => state.song);
  const close = usePlaylistPickerStore((state) => state.close);

  return (
    <Modal
      isOpen={song !== null}
      title="Adicionar à playlist"
      onClose={close}
      footer={<Button onClick={close}>Pronto</Button>}
    >
      {song && <PickerBody key={song.id} song={song} />}
    </Modal>
  );
}
