import type { SongDTO } from '@caraoke/shared';
import { AudioWaveform, ListPlus, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useDeleteSongMutation, useSongQuery } from '../../api/songs';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { formatDuration } from '../../lib/format';
import { coverGradient } from '../../lib/gradient';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';
import { AddToPlaylistButton } from '../playlists/AddToPlaylistButton';
import { FavoriteButton } from '../playlists/FavoriteButton';
import { AddRequestModal } from '../singQueue/AddRequestModal';
import { LyricsPreview } from './LyricsPreview';
import { SongEditor } from './SongEditor';
import { LYRICS_LABELS, SOURCE_LABELS, describePlayCount } from './songLabels';

function DetailCover({ song }: { song: SongDTO }) {
  return (
    <div
      style={song.coverUrl ? undefined : { background: coverGradient(song.id) }}
      className="aspect-video w-full overflow-hidden rounded-2xl bg-surface-2"
    >
      {song.coverUrl && <img src={song.coverUrl} alt="" className="size-full object-cover" />}
    </div>
  );
}

function Facts({ song }: { song: SongDTO }) {
  const facts: Array<[string, string]> = [
    ['Duração', song.durationSec ? formatDuration(song.durationSec) : '—'],
    ['Origem', SOURCE_LABELS[song.source]],
    ['Letra', LYRICS_LABELS[song.lyricsSource]],
    ['Execuções', describePlayCount(song.playCount)],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="text-base">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <h1 className="font-display text-4xl">Música não encontrada</h1>
      <Link
        to="/biblioteca"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
      >
        Voltar para a biblioteca
      </Link>
    </div>
  );
}

export function SongDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.currentProfile?.id);
  const songQuery = useSongQuery(id, profileId);
  const deleteSong = useDeleteSongMutation();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);

  if (songQuery.isLoading) return <Spinner className="mx-auto mt-10 size-10" />;
  if (songQuery.isError) {
    const isMissing = songQuery.error instanceof ApiError && songQuery.error.status === 404;
    return isMissing ? (
      <NotFound />
    ) : (
      <p role="alert" className="text-danger">
        Não foi possível carregar a música.
      </p>
    );
  }
  const song = songQuery.data;
  if (!song) return null;

  const isReady = song.status === 'READY';
  const songId = song.id;

  function confirmDelete() {
    deleteSong.mutate(songId, {
      onSuccess: () => {
        toast.success('Música excluída');
        navigate('/biblioteca');
      },
      onError: (error) => {
        setIsConfirmingDelete(false);
        toast.error(error.message);
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <DetailCover song={song} />

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-lg text-muted">{song.artist}</p>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">{song.title}</h1>
          </div>

          <Facts song={song} />

          <div className="flex flex-wrap gap-3">
            {isReady ? (
              <Link
                to={`/player/${song.id}`}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-lg font-semibold text-primary-contrast"
              >
                <Play aria-hidden="true" className="size-5 fill-current" />
                Cantar
              </Link>
            ) : (
              <Link
                to="/fila"
                className="inline-flex min-h-12 items-center rounded-lg bg-surface-2 px-5 font-semibold"
              >
                Ainda não está pronta · ver a fila
              </Link>
            )}
            {song.status !== 'ERROR' && (
              <Button variant="secondary" size="lg" onClick={() => setIsQueueing(true)}>
                <ListPlus aria-hidden="true" className="size-5" />
                Pôr na fila
              </Button>
            )}
            {isReady && (
              <>
                <AddToPlaylistButton song={song} labeled />
                <FavoriteButton song={song} labeled />
              </>
            )}
            {isReady && song.lyricsUrl && (
              <Link
                to={`/musica/${song.id}/sincronizar`}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-surface-2 px-5 text-lg font-semibold"
              >
                <AudioWaveform aria-hidden="true" className="size-5" />
                Sincronizar a letra
              </Link>
            )}
          </div>
        </div>
      </div>

      <section aria-label="Letra" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Letra</h2>
        <LyricsPreview url={song.lyricsUrl} />
      </section>

      <section aria-label="Editar música" className="rounded-2xl bg-surface p-4 sm:p-6">
        <SongEditor key={song.id} song={song} />
      </section>

      <section aria-label="Zona de risco" className="flex flex-col items-start gap-3">
        <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>
          <Trash2 aria-hidden="true" className="size-5" />
          Excluir música
        </Button>
      </section>

      <AddRequestModal isOpen={isQueueing} presetSong={song} onClose={() => setIsQueueing(false)} />

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Excluir música"
        message={`Excluir “${song.title}”? O áudio, a letra e o histórico dela serão apagados. Não dá para desfazer.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setIsConfirmingDelete(false)}
        isLoading={deleteSong.isPending}
      />
    </div>
  );
}
