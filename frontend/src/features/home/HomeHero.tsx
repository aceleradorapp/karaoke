import type { SongDTO } from '@caraoke/shared';
import { Info, Play } from 'lucide-react';
import { Link } from 'react-router';
import { coverGradient } from '../../lib/gradient';
import { AddToPlaylistButton } from '../playlists/AddToPlaylistButton';
import { FavoriteButton } from '../playlists/FavoriteButton';

interface HomeHeroProps {
  song: SongDTO;
}

export function HomeHero({ song }: HomeHeroProps) {
  return (
    <section
      aria-label="Destaque"
      style={song.coverUrl ? undefined : { background: coverGradient(song.id) }}
      className="relative flex min-h-[42vh] items-end overflow-hidden rounded-2xl bg-surface-2 sm:min-h-[52vh]"
    >
      {song.coverUrl && (
        <img src={song.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/80 to-transparent" />

      <div className="relative flex max-w-2xl flex-col items-start gap-3 p-5 sm:p-10">
        <p className="text-base text-muted sm:text-lg">{song.artist}</p>
        <h1 className="font-display text-4xl leading-none drop-shadow sm:text-6xl lg:text-7xl">
          {song.title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            to={`/player/${song.id}`}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-lg font-semibold text-primary-contrast"
          >
            <Play aria-hidden="true" className="size-5 fill-current" />
            Cantar
          </Link>
          <Link
            to={`/musica/${song.id}`}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-surface-2/80 px-5 text-lg font-semibold backdrop-blur"
          >
            <Info aria-hidden="true" className="size-5" />
            Detalhes
          </Link>
          <AddToPlaylistButton song={song} labeled />
          <FavoriteButton song={song} labeled />
        </div>
      </div>
    </section>
  );
}
