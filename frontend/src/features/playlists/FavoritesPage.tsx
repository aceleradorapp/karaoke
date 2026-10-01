import { Link } from 'react-router';
import { useFavoritesQuery } from '../../api/favorites';
import { Spinner } from '../../components/Spinner';
import { useProfileStore } from '../../stores/useProfileStore';
import { SongCard } from '../songs/SongCard';

export function FavoritesPage() {
  const profile = useProfileStore((state) => state.currentProfile);
  const favorites = useFavoritesQuery(profile?.id);
  const songs = favorites.data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl">Favoritas</h1>
        {profile && (
          <p className="text-base text-muted">As músicas que {profile.name} mais gosta de cantar</p>
        )}
      </div>

      {favorites.isLoading && <Spinner className="mx-auto mt-10 size-10" />}
      {favorites.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as favoritas.
        </p>
      )}

      {favorites.isSuccess && songs.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <h2 className="text-xl font-semibold">Nenhuma favorita ainda</h2>
          <p className="text-base text-muted">
            Toque no coração de uma música para ela aparecer aqui. Procure na{' '}
            <Link to="/biblioteca" className="underline">
              biblioteca
            </Link>
            .
          </p>
        </div>
      )}

      {songs.length > 0 && (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {songs.map((song) => (
            <li key={song.id}>
              <SongCard song={song} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
