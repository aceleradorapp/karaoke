import type { SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { AlertTriangle, Play } from 'lucide-react';
import { Link } from 'react-router';
import { ProgressRing } from '../../components/ProgressRing';
import { coverGradient } from '../../lib/gradient';
import { STEP_LABELS } from '../processing/jobText';

const QUEUE_ROUTE = '/fila';

function processingLabel(song: SongDTO): string {
  const step = song.job?.step;
  if (song.job?.status === 'RUNNING' && step) return STEP_LABELS[step];
  return 'Na fila';
}

function Cover({ song }: { song: SongDTO }) {
  if (song.coverUrl) {
    return <img src={song.coverUrl} alt="" loading="lazy" className="size-full object-cover" />;
  }
  return (
    <div
      data-testid="cover-fallback"
      style={{ background: coverGradient(song.id) }}
      aria-hidden="true"
      className="flex size-full flex-col justify-end p-3 text-white"
    >
      <p className="line-clamp-2 text-base font-bold drop-shadow">{song.title}</p>
      <p className="line-clamp-1 text-xs opacity-80">{song.artist}</p>
    </div>
  );
}

function ProcessingOverlay({ song }: { song: SongDTO }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
      <ProgressRing value={song.job?.progress ?? 0} size={44} label={`Progresso de ${song.title}`} />
      <span className="px-2 text-center text-xs">{processingLabel(song)}</span>
    </div>
  );
}

function FailedBadge() {
  return (
    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-xs font-semibold text-danger-contrast">
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      Falhou
    </span>
  );
}

function ReviewBadge() {
  return (
    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
      Letra para revisar
    </span>
  );
}

interface SongCardProps {
  song: SongDTO;
  className?: string;
}

export function SongCard({ song, className }: SongCardProps) {
  const isReady = song.status === 'READY';
  const isProcessing = song.status === 'QUEUED' || song.status === 'PROCESSING';
  const detailRoute = isReady ? `/musica/${song.id}` : QUEUE_ROUTE;

  return (
    <article className={clsx('group relative flex flex-col gap-2', className)}>
      <div
        className={clsx(
          'relative aspect-video overflow-hidden rounded-xl bg-surface-2 shadow-md transition duration-200',
          'group-hover:scale-105 group-hover:shadow-xl',
          isProcessing && 'opacity-90',
        )}
      >
        <Cover song={song} />
        {isProcessing && <ProcessingOverlay song={song} />}
        {song.status === 'ERROR' && <FailedBadge />}
        {isReady && song.lyricsNeedsReview && <ReviewBadge />}

        {isReady && (
          <Link
            to={`/player/${song.id}`}
            aria-label={`Cantar ${song.title}`}
            className={clsx(
              'absolute bottom-2 right-2 z-10 inline-flex size-12 items-center justify-center rounded-full',
              'bg-primary text-primary-contrast shadow-lg transition',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
            )}
          >
            <Play aria-hidden="true" className="size-6 fill-current" />
          </Link>
        )}
      </div>

      <div className="min-w-0">
        <Link
          to={detailRoute}
          className="block truncate text-base font-semibold after:absolute after:inset-0"
        >
          {song.title}
        </Link>
        <p className="truncate text-sm text-muted">{song.artist}</p>
      </div>
    </article>
  );
}
