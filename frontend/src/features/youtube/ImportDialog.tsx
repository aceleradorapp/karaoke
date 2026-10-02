import { importYoutubeSchema, type YoutubeSearchResult } from '@caraoke/shared';
import { ArrowLeftRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useImportYoutubeMutation } from '../../api/youtube';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { isMobileApp } from '../../lib/mobileApp';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';

const FORM_ID = 'import-youtube-form';

interface ImportFormProps {
  video: YoutubeSearchResult;
  onClose: () => void;
  onImported: (youtubeId: string) => void;
}

type FieldErrors = Partial<Record<'artist' | 'title', string>>;

function ImportForm({ video, onClose, onImported }: ImportFormProps) {
  const importVideo = useImportYoutubeMutation();
  const stageProfileId = useProfileStore((state) => state.currentProfile?.id);
  const profileId = isMobileApp() ? undefined : stageProfileId;
  const [artist, setArtist] = useState(video.suggested.artist);
  const [title, setTitle] = useState(video.suggested.title);
  const [errors, setErrors] = useState<FieldErrors>({});

  function swapArtistAndTitle() {
    setArtist(title);
    setTitle(artist);
    setErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = importYoutubeSchema.safeParse({
      youtubeId: video.youtubeId,
      title,
      artist,
      durationSec: video.durationSec,
      profileId,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === 'artist' || field === 'title') && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }

    try {
      const result = await importVideo.mutateAsync(parsed.data);
      if (result.alreadyExists) toast.info('Esta música já está na biblioteca');
      else toast.success('Adicionada à fila de processamento');
      onImported(video.youtubeId);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar a música');
    }
  }

  return (
    <>
      <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-muted">{video.title}</p>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Artista</span>
          <input
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            aria-invalid={Boolean(errors.artist)}
            className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
          />
          {errors.artist && (
            <span role="alert" className="text-sm text-danger">
              {errors.artist}
            </span>
          )}
        </label>

        <Button variant="ghost" onClick={swapArtistAndTitle} className="self-start">
          <ArrowLeftRight aria-hidden="true" className="size-5" />
          Inverter artista e título
        </Button>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Título</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={Boolean(errors.title)}
            className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
          />
          {errors.title && (
            <span role="alert" className="text-sm text-danger">
              {errors.title}
            </span>
          )}
        </label>
      </form>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form={FORM_ID} isLoading={importVideo.isPending}>
          Importar
        </Button>
      </div>
    </>
  );
}

interface ImportDialogProps {
  video: YoutubeSearchResult | null;
  onClose: () => void;
  onImported: (youtubeId: string) => void;
}

export function ImportDialog({ video, onClose, onImported }: ImportDialogProps) {
  return (
    <Modal isOpen={video !== null} title="Confirmar música" onClose={onClose}>
      {video && <ImportForm key={video.youtubeId} video={video} onClose={onClose} onImported={onImported} />}
    </Modal>
  );
}
