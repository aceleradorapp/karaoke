import type { SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSetFavoriteMutation } from '../../api/favorites';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';

interface FavoriteButtonProps {
  song: Pick<SongDTO, 'id' | 'title' | 'isFavorite'>;
  labeled?: boolean;
  className?: string;
}

export function FavoriteButton({ song, labeled = false, className }: FavoriteButtonProps) {
  const profileId = useProfileStore((state) => state.currentProfile?.id);
  const setFavorite = useSetFavoriteMutation(profileId);
  const [pending, setPending] = useState<boolean | null>(null);
  const isFavorite = pending ?? Boolean(song.isFavorite);

  useEffect(() => setPending(null), [song.isFavorite]);

  function toggle() {
    const next = !isFavorite;
    setPending(next);
    setFavorite.mutate(
      { songId: song.id, isFavorite: next },
      {
        onError: () => {
          setPending(null);
          toast.error('Não foi possível atualizar as favoritas');
        },
      },
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Tirar ${song.title} das favoritas` : `Favoritar ${song.title}`}
      className={clsx(
        'inline-flex items-center justify-center gap-2 transition',
        labeled
          ? 'min-h-12 rounded-lg bg-surface-2 px-5 text-lg font-semibold hover:bg-surface-2/70'
          : 'size-11 rounded-full bg-black/70 text-white hover:bg-black',
        className,
      )}
    >
      <Heart aria-hidden="true" className={clsx('size-5', isFavorite && 'fill-primary text-primary')} />
      {labeled && (isFavorite ? 'Favorita' : 'Favoritar')}
    </button>
  );
}
