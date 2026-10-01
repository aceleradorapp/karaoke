import type { SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { ListPlus } from 'lucide-react';
import { usePlaylistPickerStore } from '../../stores/usePlaylistPickerStore';

interface AddToPlaylistButtonProps {
  song: Pick<SongDTO, 'id' | 'title'>;
  labeled?: boolean;
  className?: string;
}

export function AddToPlaylistButton({ song, labeled = false, className }: AddToPlaylistButtonProps) {
  const open = usePlaylistPickerStore((state) => state.open);

  return (
    <button
      type="button"
      onClick={() => open(song)}
      aria-label={`Adicionar ${song.title} a uma playlist`}
      className={clsx(
        'inline-flex items-center justify-center gap-2 transition',
        labeled
          ? 'min-h-12 rounded-lg bg-surface-2 px-5 text-lg font-semibold hover:bg-surface-2/70'
          : 'size-11 rounded-full bg-black/70 text-white hover:bg-black',
        className,
      )}
    >
      <ListPlus aria-hidden="true" className="size-5" />
      {labeled && 'Playlist'}
    </button>
  );
}
