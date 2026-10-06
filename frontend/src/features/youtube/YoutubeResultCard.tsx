import type { YoutubeSearchResult } from '@caraoke/shared';
import { Check, Download, Play } from 'lucide-react';
import { Button } from '../../components/Button';
import { formatDuration } from '../../lib/format';
import { LyricsBadge } from './LyricsBadge';

export type ImportState = 'available' | 'in-library' | 'queued';

interface YoutubeResultCardProps {
  video: YoutubeSearchResult;
  importState: ImportState;
  onPreview: () => void;
  onImport: () => void;
}

const IMPORT_STATE_LABELS: Record<Exclude<ImportState, 'available'>, string> = {
  'in-library': 'Já na biblioteca',
  queued: 'Adicionada à fila',
};

export function YoutubeResultCard({ video, importState, onPreview, onImport }: YoutubeResultCardProps) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-surface p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-48">
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(video.durationSec)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-base font-semibold">{video.title}</h3>
        <p className="truncate text-sm text-muted">{video.channel}</p>
        <LyricsBadge artist={video.suggested.artist} title={video.suggested.title} durationSec={video.durationSec} />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button variant="secondary" onClick={onPreview} aria-label={`Prévia de ${video.title}`}>
          <Play aria-hidden="true" className="size-5" />
          Prévia
        </Button>
        {importState === 'available' ? (
          <Button onClick={onImport} aria-label={`Importar ${video.title}`}>
            <Download aria-hidden="true" className="size-5" />
            Importar
          </Button>
        ) : (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-accent">
            <Check aria-hidden="true" className="size-5" />
            {IMPORT_STATE_LABELS[importState]}
          </span>
        )}
      </div>
    </li>
  );
}
