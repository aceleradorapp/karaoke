import type { YoutubeSearchResult } from '@caraoke/shared';
import { ExternalLink } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

const PREVIEW_START_FRACTION = 0.3;

function previewStart(video: YoutubeSearchResult): number {
  return Math.floor(video.durationSec * PREVIEW_START_FRACTION);
}

export function buildWatchUrl(video: YoutubeSearchResult): string {
  return `https://www.youtube.com/watch?v=${video.youtubeId}&t=${previewStart(video)}s`;
}

export function buildPreviewUrl(video: YoutubeSearchResult): string {
  const start = previewStart(video);
  return `https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&start=${start}&rel=0`;
}

interface YoutubePreviewModalProps {
  video: YoutubeSearchResult | null;
  canImport: boolean;
  onClose: () => void;
  onImport: (video: YoutubeSearchResult) => void;
}

export function YoutubePreviewModal({ video, canImport, onClose, onImport }: YoutubePreviewModalProps) {
  return (
    <Modal
      isOpen={video !== null}
      title="Prévia"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {video && canImport && <Button onClick={() => onImport(video)}>Importar</Button>}
        </>
      }
    >
      {video && (
        <div className="flex flex-col gap-3">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              src={buildPreviewUrl(video)}
              title={`Prévia: ${video.title}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="size-full border-0"
            />
          </div>
          <p className="text-sm text-muted">{video.title}</p>
          <a
            href={buildWatchUrl(video)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 self-start text-base text-primary underline"
          >
            <ExternalLink aria-hidden="true" className="size-5" />
            Abrir no YouTube
          </a>
        </div>
      )}
    </Modal>
  );
}
