import clsx from 'clsx';
import { ListMusic } from 'lucide-react';
import { coverGradient } from '../../lib/gradient';

const GRID_CELLS = 4;

interface PlaylistCoverProps {
  playlistId: string;
  coverUrls: string[];
  className?: string;
}

export function PlaylistCover({ playlistId, coverUrls, className }: PlaylistCoverProps) {
  if (coverUrls.length === 0) {
    return (
      <div
        data-testid="playlist-cover-fallback"
        aria-hidden="true"
        style={{ background: coverGradient(playlistId) }}
        className={clsx('flex aspect-video items-center justify-center rounded-xl text-white/80', className)}
      >
        <ListMusic className="size-1/4" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={clsx(
        'grid aspect-video grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl bg-surface-2',
        className,
      )}
    >
      {Array.from({ length: GRID_CELLS }, (_, cell) => {
        const url = coverUrls[cell];
        return url ? (
          <img key={cell} src={url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div
            key={cell}
            style={{ background: coverGradient(`${playlistId}-${cell}`) }}
            className="size-full"
          />
        );
      })}
    </div>
  );
}
