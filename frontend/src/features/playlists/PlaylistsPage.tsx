import { PLAYLIST_NAME_MAX_LENGTH } from '@caraoke/shared';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { useCreatePlaylistMutation, usePlaylistsQuery } from '../../api/playlists';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { useProfileStore } from '../../stores/useProfileStore';
import { PlaylistCover } from './PlaylistCover';

function describeCount(count: number): string {
  if (count === 0) return 'Vazia';
  return count === 1 ? '1 música' : `${count} músicas`;
}

function NewPlaylistModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.currentProfile?.id);
  const createPlaylist = useCreatePlaylistMutation(profileId);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Informe o nome da playlist');
      return;
    }
    try {
      const created = await createPlaylist.mutateAsync(trimmed);
      setName('');
      onClose();
      navigate(`/playlists/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível criar a playlist');
    }
  }

  return (
    <Modal isOpen={isOpen} title="Nova playlist" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label htmlFor="playlist-name" className="flex flex-col gap-1 text-sm text-muted">
          Nome da playlist
          <input
            id="playlist-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            maxLength={PLAYLIST_NAME_MAX_LENGTH}
            placeholder="Ex.: Sertanejo raiz"
            autoFocus
            className="min-h-12 rounded-lg bg-surface-2 px-3 text-lg text-text"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" isLoading={createPlaylist.isPending}>
          Criar playlist
        </Button>
      </form>
    </Modal>
  );
}

export function PlaylistsPage() {
  const profileId = useProfileStore((state) => state.currentProfile?.id);
  const playlists = usePlaylistsQuery(profileId);
  const [isCreating, setIsCreating] = useState(false);
  const items = playlists.data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl sm:text-5xl">Minhas playlists</h1>
        <Button onClick={() => setIsCreating(true)}>
          <Plus aria-hidden="true" className="size-5" />
          Nova playlist
        </Button>
      </div>

      {playlists.isLoading && <Spinner className="mx-auto mt-10 size-10" />}
      {playlists.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as playlists.
        </p>
      )}

      {playlists.isSuccess && items.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <h2 className="text-xl font-semibold">Você ainda não tem playlists</h2>
          <p className="text-base text-muted">
            Crie uma playlist e use o botão de playlist em qualquer música para montar seu repertório.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((playlist) => (
            <li key={playlist.id} className="group relative flex flex-col gap-2">
              <PlaylistCover
                playlistId={playlist.id}
                coverUrls={playlist.coverUrls}
                className="shadow-md transition duration-200 group-hover:scale-105 group-hover:shadow-xl"
              />
              <div className="min-w-0">
                <Link
                  to={`/playlists/${playlist.id}`}
                  className="block truncate text-lg font-semibold after:absolute after:inset-0"
                >
                  {playlist.name}
                </Link>
                <p className="text-sm text-muted">{describeCount(playlist.count)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewPlaylistModal isOpen={isCreating} onClose={() => setIsCreating(false)} />
    </div>
  );
}
