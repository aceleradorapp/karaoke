import { updateSongSchema, type SongDTO } from '@caraoke/shared';
import { useState } from 'react';
import { useUpdateSongMutation } from '../../api/songs';
import { SaveIndicator } from '../../components/SaveIndicator';
import { useAutoSave } from '../../lib/useAutoSave';

interface SongDraft {
  title: string;
  artist: string;
}

const isSameDraft = (a: SongDraft, b: SongDraft) => a.title === b.title && a.artist === b.artist;
const isValidDraft = (draft: SongDraft) => updateSongSchema.safeParse(draft).success;

interface SongEditorProps {
  song: SongDTO;
}

export function SongEditor({ song }: SongEditorProps) {
  const updateSong = useUpdateSongMutation(song.id);
  const [draft, setDraft] = useState<SongDraft>({ title: song.title, artist: song.artist });

  const autoSave = useAutoSave(draft, (value) => updateSong.mutateAsync(updateSongSchema.parse(value)), {
    isValid: isValidDraft,
    isEqual: isSameDraft,
  });

  const isTitleEmpty = draft.title.trim().length === 0;
  const isArtistEmpty = draft.artist.trim().length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-6 items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Editar</h2>
        <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Título</span>
        <input
          value={draft.title}
          onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))}
          onBlur={autoSave.flush}
          aria-invalid={isTitleEmpty}
          className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
        />
        {isTitleEmpty && (
          <span role="alert" className="text-sm text-danger">
            Informe o título
          </span>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Artista</span>
        <input
          value={draft.artist}
          onChange={(event) => setDraft((previous) => ({ ...previous, artist: event.target.value }))}
          onBlur={autoSave.flush}
          aria-invalid={isArtistEmpty}
          className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
        />
        {isArtistEmpty && (
          <span role="alert" className="text-sm text-danger">
            Informe o artista
          </span>
        )}
      </label>
    </div>
  );
}
