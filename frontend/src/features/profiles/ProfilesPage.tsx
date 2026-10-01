import type { ProfileDTO } from '@caraoke/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProfilesQuery, useTouchProfileMutation } from '../../api/profiles';
import { Spinner } from '../../components/Spinner';
import { applyTheme } from '../../lib/theme';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';
import { CreateProfileModal } from './CreateProfileModal';
import { AddProfileTile, ProfileTile } from './ProfileTile';

const TILE_GRID_CLASSES =
  'grid w-full grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

export function ProfilesPage() {
  const navigate = useNavigate();
  const profiles = useProfilesQuery();
  const touchProfile = useTouchProfileMutation();
  const setProfile = useProfileStore((state) => state.setProfile);
  const [creating, setCreating] = useState<'family' | 'guest' | null>(null);

  const family = profiles.data?.filter((profile) => !profile.isGuest) ?? [];
  const guests = profiles.data?.filter((profile) => profile.isGuest) ?? [];

  async function selectProfile(profile: ProfileDTO) {
    try {
      const touched = await touchProfile.mutateAsync(profile.id);
      setProfile(touched);
      applyTheme(touched.theme);
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entrar no perfil');
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center gap-10 px-4 py-10">
      <h1 className="text-center font-display text-4xl text-text sm:text-5xl lg:text-6xl">
        Quem vai cantar?
      </h1>

      {profiles.isLoading && <Spinner className="size-10" />}

      {profiles.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar os perfis.
        </p>
      )}

      {profiles.isSuccess && (
        <>
          <section aria-label="Perfis da família" className={TILE_GRID_CLASSES}>
            {family.map((profile) => (
              <ProfileTile
                key={profile.id}
                name={profile.name}
                avatarId={profile.avatar}
                size="xl"
                onSelect={() => selectProfile(profile)}
                isDisabled={touchProfile.isPending}
              />
            ))}
            <AddProfileTile label="Adicionar" size="xl" onAdd={() => setCreating('family')} />
          </section>

          <section aria-labelledby="guests-heading" className="flex w-full flex-col gap-4">
            <h2 id="guests-heading" className="border-b border-surface-2 pb-2 text-xl text-muted">
              Convidados
            </h2>
            <div className={TILE_GRID_CLASSES}>
              {guests.map((profile) => (
                <ProfileTile
                  key={profile.id}
                  name={profile.name}
                  avatarId={profile.avatar}
                  size="lg"
                  onSelect={() => selectProfile(profile)}
                  isDisabled={touchProfile.isPending}
                />
              ))}
              <AddProfileTile label="Convidado" size="lg" onAdd={() => setCreating('guest')} />
            </div>
          </section>
        </>
      )}

      <Link
        to="/perfis/gerenciar"
        className="inline-flex min-h-11 items-center rounded-lg px-5 text-base text-muted hover:text-text"
      >
        Gerenciar perfis
      </Link>

      <CreateProfileModal
        isOpen={creating !== null}
        isGuest={creating === 'guest'}
        onClose={() => setCreating(null)}
      />
    </main>
  );
}
