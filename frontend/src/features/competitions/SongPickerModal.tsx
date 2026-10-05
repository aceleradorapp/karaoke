import type { SongDTO } from '@caraoke/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSongsInfiniteQuery } from '../../api/songs';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { coverGradient } from '../../lib/gradient';
import { useDebouncedValue } from '../../lib/useDebouncedValue';

const SEARCH_DEBOUNCE_MS = 300;

interface SongPickerModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onPick: (song: SongDTO) => void;
  onlyWithCover?: boolean;
  excludedIds?: string[];
}

function SongPickerDialog({
  title,
  onClose,
  onPick,
  onlyWithCover = false,
  excludedIds = [],
}: Omit<SongPickerModalProps, 'isOpen'>) {
  const [draft, setDraft] = useState('');
  const query = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS).trim();
  const songs = useSongsInfiniteQuery({ q: query || undefined, sort: 'title' });
  const options = useMemo(
    () =>
      (songs.data?.pages ?? [])
        .flatMap((page) => page.items)
        .filter((song) => song.status !== 'ERROR')
        .filter((song) => !onlyWithCover || song.coverUrl !== null)
        .filter((song) => !excludedIds.includes(song.id)),
    [songs.data, onlyWithCover, excludedIds],
  );

  return (
    <Modal isOpen title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-3">
          <Search aria-hidden="true" className="size-5 text-muted" />
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Buscar música"
            placeholder="Buscar na biblioteca…"
            autoFocus
            className="min-h-11 w-full bg-transparent text-base text-text outline-none"
          />
        </label>
        <ul aria-label="Músicas" className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {songs.isLoading && <Spinner className="size-6" />}
          {options.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => onPick(song)}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-2"
              >
                {song.coverUrl ? (
                  <img src={song.coverUrl} alt="" className="size-10 shrink-0 rounded object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ background: coverGradient(song.id) }}
                    className="size-10 shrink-0 rounded"
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{song.title}</span>
                  <span className="block truncate text-sm text-muted">{song.artist}</span>
                </span>
              </button>
            </li>
          ))}
          {songs.isSuccess && options.length === 0 && (
            <li className="text-sm text-muted">Nenhuma música encontrada.</li>
          )}
        </ul>
      </div>
    </Modal>
  );
}

export function SongPickerModal({ isOpen, ...props }: SongPickerModalProps) {
  return isOpen ? <SongPickerDialog {...props} /> : null;
}
