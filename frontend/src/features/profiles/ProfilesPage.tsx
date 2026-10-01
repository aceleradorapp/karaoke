import type { ProfileDTO } from '@caraoke/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProfilesQuery, useTouchProfileMutation } from '../../api/profiles';
import { Spinner } from '../../components/Spinner';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';
import { CreateProfileModal } from './CreateProfileModal';
import { ProfileSections, type NewProfileKind } from './ProfileSections';

export function ProfilesPage() {
  const navigate = useNavigate();
  const profiles = useProfilesQuery();
  const touchProfile = useTouchProfileMutation();
  const setProfile = useProfileStore((state) => state.setProfile);
  const [creating, setCreating] = useState<NewProfileKind | null>(null);

  async function selectProfile(profile: ProfileDTO) {
    try {
      const touched = await touchProfile.mutateAsync(profile.id);
      setProfile(touched);
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
        <ProfileSections
          profiles={profiles.data}
          onSelect={selectProfile}
          onAdd={setCreating}
          isDisabled={touchProfile.isPending}
        />
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
