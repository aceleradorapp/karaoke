import type { SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { coverGradient } from '../../lib/gradient';

interface SelectableSongCardProps {
  song: SongDTO;
  isSelected: boolean;
  onToggle: () => void;
}

export function SelectableSongCard({ song, isSelected, onToggle }: SelectableSongCardProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`${song.title} — ${song.artist}`}
      onClick={onToggle}
      className="group flex w-full flex-col gap-2 text-left"
    >
      <div
        className={clsx(
          'relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2 shadow-md ring-4 transition',
          isSelected ? 'ring-primary' : 'ring-transparent',
        )}
      >
        {song.coverUrl ? (
          <img src={song.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div style={{ background: coverGradient(song.id) }} aria-hidden="true" className="size-full" />
        )}
        <span
          aria-hidden="true"
          className={clsx(
            'absolute left-2 top-2 flex size-8 items-center justify-center rounded-full border-2 border-white shadow',
            isSelected ? 'bg-primary text-primary-contrast' : 'bg-black/50',
          )}
        >
          {isSelected && <Check className="size-5" />}
        </span>
        {isSelected && <span aria-hidden="true" className="absolute inset-0 bg-primary/20" />}
      </div>
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">{song.title}</span>
        <span className="block truncate text-sm text-muted">{song.artist}</span>
      </span>
    </button>
  );
}
