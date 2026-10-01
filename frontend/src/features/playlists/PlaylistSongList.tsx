import type { SongDTO } from '@caraoke/shared';
import { ArrowDown, ArrowUp, GripVertical, Play, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { formatDuration } from '../../lib/format';
import { coverGradient } from '../../lib/gradient';
import { moveItem } from '../../lib/reorder';

const STATUS_NOTES: Partial<Record<SongDTO['status'], string>> = {
  QUEUED: 'Na fila de processamento',
  PROCESSING: 'Processando…',
  ERROR: 'Falhou ao processar',
};

interface PlaylistSongListProps {
  songs: SongDTO[];
  onPlay: (song: SongDTO) => void;
  onReorder: (songIds: string[]) => void;
  onRemove: (song: SongDTO) => void;
}

function Thumb({ song }: { song: SongDTO }) {
  return song.coverUrl ? (
    <img src={song.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
  ) : (
    <div style={{ background: coverGradient(song.id) }} className="size-full" />
  );
}

export function PlaylistSongList({ songs, onPlay, onReorder, onRemove }: PlaylistSongListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function moveTo(songId: string, targetIndex: number) {
    const fromIndex = songs.findIndex((song) => song.id === songId);
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    onReorder(moveItem(songs, fromIndex, targetIndex).map((song) => song.id));
  }

  function handleDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (draggedId) moveTo(draggedId, targetIndex);
    setDraggedId(null);
  }

  return (
    <ol aria-label="Músicas da playlist" className="flex flex-col gap-2">
      {songs.map((song, index) => {
        const note = STATUS_NOTES[song.status];
        const isReady = song.status === 'READY';
        return (
          <li
            key={song.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              setDraggedId(song.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, index)}
            onDragEnd={() => setDraggedId(null)}
            className={`flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 transition ${draggedId === song.id ? 'opacity-50' : ''}`}
          >
            <GripVertical
              aria-hidden="true"
              className="hidden size-5 shrink-0 cursor-grab text-muted sm:block"
            />
            <span className="w-6 shrink-0 text-center text-sm text-muted tabular-nums">{index + 1}</span>
            <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-32">
              <Thumb song={song} />
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <Link
                to={`/musica/${song.id}`}
                className="block truncate text-base font-semibold hover:underline"
              >
                {song.title}
              </Link>
              <p className="truncate text-sm text-muted">
                {song.artist}
                {song.durationSec ? ` · ${formatDuration(song.durationSec)}` : ''}
              </p>
              {note && <p className="text-sm text-muted">{note}</p>}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {isReady && (
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={`Cantar ${song.title}`}
                  onClick={() => onPlay(song)}
                >
                  <Play aria-hidden="true" className="size-5 fill-current" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Mover ${song.title} para cima`}
                disabled={index === 0}
                onClick={() => moveTo(song.id, index - 1)}
              >
                <ArrowUp aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Mover ${song.title} para baixo`}
                disabled={index === songs.length - 1}
                onClick={() => moveTo(song.id, index + 1)}
              >
                <ArrowDown aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Tirar ${song.title} da playlist`}
                onClick={() => onRemove(song)}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
