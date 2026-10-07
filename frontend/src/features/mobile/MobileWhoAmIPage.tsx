import { AVATARS, createProfileSchema, type ProfileDTO } from '@caraoke/shared';
import { Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateProfileMutation, useProfilesQuery } from '../../api/profiles';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { toast } from '../../stores/useToastStore';
import { AvatarPicker } from '../profiles/AvatarPicker';

export const MOBILE_SONGS_TAB = '/m/musicas';
export const GUEST_SEARCH_THRESHOLD = 8;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function ProfileChoices({
  title,
  profiles,
  onChoose,
}: {
  title: string;
  profiles: ProfileDTO[];
  onChoose: (profile: ProfileDTO) => void;
}) {
  if (profiles.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              onClick={() => onChoose(profile)}
              className="flex w-full flex-col items-center gap-2 rounded-2xl bg-surface p-3 text-base active:scale-95"
            >
              <Avatar avatarId={profile.avatar} size="md" />
              <span className="w-full truncate">{profile.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewGuestForm({ onCreated }: { onCreated: (profile: ProfileDTO) => void }) {
  const createProfile = useCreateProfileMutation();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATARS[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createProfileSchema.safeParse({ name, avatar });
    if (!parsed.success) {
      setError('Digite o seu nome');
      return;
    }
    try {
      onCreated(await createProfile.mutateAsync(parsed.data));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível entrar');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Sou novo por aqui"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-4"
      noValidate
    >
      <h2 className="text-lg font-semibold">Sou novo por aqui</h2>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Seu nome</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          maxLength={40}
          autoComplete="nickname"
          aria-invalid={error !== null}
          className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
        />
        {error && (
          <span role="alert" className="text-sm text-danger">
            {error}
          </span>
        )}
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Escolha um avatar</span>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>
      <Button type="submit" size="lg" isLoading={createProfile.isPending}>
        Entrar
      </Button>
    </form>
  );
}

export function MobileWhoAmIPage() {
  const navigate = useNavigate();
  const profiles = useProfilesQuery();
  const setProfile = useMobileProfileStore((state) => state.setProfile);

  function choose(profile: ProfileDTO) {
    setProfile(profile);
    navigate(MOBILE_SONGS_TAB, { replace: true });
  }

  const all = profiles.data ?? [];
  const guests = all.filter((profile) => profile.isGuest);
  const [guestSearch, setGuestSearch] = useState('');
  const visibleGuests = useMemo(() => {
    const term = normalize(guestSearch.trim());
    return term ? guests.filter((guest) => normalize(guest.name).includes(term)) : guests;
  }, [guests, guestSearch]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Quem é você?</h1>
        <p className="text-base text-muted">Assim a TV sabe quem vai cantar e de quem é a nota.</p>
      </div>

      {profiles.isLoading && <Spinner className="mx-auto size-8" />}
      {profiles.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar os perfis.
        </p>
      )}

      <ProfileChoices
        title="Da casa"
        profiles={all.filter((profile) => !profile.isGuest)}
        onChoose={choose}
      />
      {guests.length > GUEST_SEARCH_THRESHOLD && (
        <label className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3">
          <Search aria-hidden="true" className="size-5 text-muted" />
          <input
            type="search"
            value={guestSearch}
            onChange={(event) => setGuestSearch(event.target.value)}
            aria-label="Buscar seu nome entre os convidados"
            placeholder="Procure o seu nome…"
            className="min-h-11 w-full bg-transparent text-base text-text outline-none"
          />
        </label>
      )}
      <ProfileChoices title="Convidados" profiles={visibleGuests} onChoose={choose} />
      {guestSearch.trim() && visibleGuests.length === 0 && (
        <p className="text-base text-muted">Não achei esse nome. Crie o seu abaixo.</p>
      )}
      <NewGuestForm onCreated={choose} />
    </div>
  );
}
