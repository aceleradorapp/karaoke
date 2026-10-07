import { AVATARS, createProfileSchema, type SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateProfileMutation, useProfilesQuery } from '../../api/profiles';
import { useAddSingRequestMutation } from '../../api/singQueue';
import { useSongsInfiniteQuery } from '../../api/songs';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';
import { AvatarPicker } from '../profiles/AvatarPicker';
import { SingerChooser } from '../profiles/SingerChooser';

const SEARCH_DEBOUNCE_MS = 300;
const FIRST_AVATAR = AVATARS[0]?.id ?? '';

interface AddRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetSong?: SongDTO | null;
}

function NewGuestFields({ onCreated }: { onCreated: (profileId: string) => void }) {
  const createProfile = useCreateProfileMutation();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(FIRST_AVATAR);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const parsed = createProfileSchema.safeParse({ name, avatar, isGuest: true });
    if (!parsed.success) {
      setError('Digite o nome do convidado');
      return;
    }
    try {
      const profile = await createProfile.mutateAsync(parsed.data);
      onCreated(profile.id);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível criar o convidado');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Nome do convidado</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          maxLength={40}
          aria-invalid={error !== null}
          className="min-h-11 rounded-lg bg-surface px-3 text-base text-text"
        />
        {error && (
          <span role="alert" className="text-sm text-danger">
            {error}
          </span>
        )}
      </label>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      <Button
        variant="secondary"
        onClick={() => void create()}
        isLoading={createProfile.isPending}
        className="self-start"
      >
        Criar convidado
      </Button>
    </div>
  );
}

function AddRequestDialog({ onClose, presetSong = null }: Omit<AddRequestModalProps, 'isOpen'>) {
  const profiles = useProfilesQuery();
  const addRequest = useAddSingRequestMutation();
  const currentProfileId = useProfileStore((state) => state.currentProfile?.id ?? null);
  const [singerId, setSingerId] = useState<string | null>(currentProfileId);
  const [isCreatingGuest, setIsCreatingGuest] = useState(false);
  const [songId, setSongId] = useState<string | null>(presetSong?.id ?? null);
  const [draft, setDraft] = useState('');
  const query = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS).trim();
  const songs = useSongsInfiniteQuery({ q: query || undefined, sort: 'title' });

  const songOptions = useMemo(
    () => (songs.data?.pages ?? []).flatMap((page) => page.items).filter((song) => song.status !== 'ERROR'),
    [songs.data],
  );
  const chosenSong = presetSong ?? songOptions.find((song) => song.id === songId) ?? null;
  const singer = profiles.data?.find((profile) => profile.id === singerId) ?? null;

  function close() {
    onClose();
  }

  function submit() {
    if (!singer || !chosenSong) return;
    addRequest.mutate(
      { profileId: singer.id, songId: chosenSong.id },
      {
        onSuccess: () => {
          toast.success(`Na fila: ${singer.name} — ${chosenSong.title}`);
          close();
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Não foi possível pôr na fila'),
      },
    );
  }

  return (
    <Modal
      isOpen
      title="Pôr na fila de cantores"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!singer || !chosenSong} isLoading={addRequest.isPending}>
            Pôr na fila
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section aria-label="Quem vai cantar" className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">Quem vai cantar?</h3>
          {profiles.isLoading && <Spinner className="size-6" />}
          {profiles.data && (
            <SingerChooser
              profiles={profiles.data}
              defaultProfileId={currentProfileId}
              selectedId={singerId}
              onSelect={setSingerId}
              onCreateGuest={() => setIsCreatingGuest(true)}
              size="sm"
            />
          )}
          {isCreatingGuest && (
            <NewGuestFields
              onCreated={(id) => {
                setSingerId(id);
                setIsCreatingGuest(false);
              }}
            />
          )}
        </section>

        <section aria-label="Música" className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">Música</h3>
          {presetSong ? (
            <p className="text-base">
              {presetSong.title} <span className="text-muted">— {presetSong.artist}</span>
            </p>
          ) : (
            <>
              <label className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-3">
                <Search aria-hidden="true" className="size-5 text-muted" />
                <input
                  type="search"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Buscar música"
                  placeholder="Buscar na biblioteca…"
                  className="min-h-11 w-full bg-transparent text-base text-text outline-none"
                />
              </label>
              <div
                role="radiogroup"
                aria-label="Músicas"
                className="flex max-h-60 flex-col gap-1 overflow-y-auto"
              >
                {songs.isLoading && <Spinner className="size-6" />}
                {songOptions.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    role="radio"
                    aria-checked={song.id === songId}
                    onClick={() => setSongId(song.id)}
                    className={clsx(
                      'flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-left',
                      song.id === songId ? 'bg-surface-2 ring-2 ring-primary' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{song.title}</span>
                      <span className="block truncate text-sm text-muted">{song.artist}</span>
                    </span>
                    {song.status !== 'READY' && (
                      <span className="shrink-0 text-sm text-primary">preparando</span>
                    )}
                  </button>
                ))}
                {songs.isSuccess && songOptions.length === 0 && (
                  <p className="text-sm text-muted">Nenhuma música encontrada.</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

export function AddRequestModal({ isOpen, ...props }: AddRequestModalProps) {
  return isOpen ? <AddRequestDialog {...props} /> : null;
}
