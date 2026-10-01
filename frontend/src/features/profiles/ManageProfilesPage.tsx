import type { ProfileDTO } from '@caraoke/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useProfilesQuery } from '../../api/profiles';
import { Spinner } from '../../components/Spinner';
import { CreateProfileModal } from './CreateProfileModal';
import { ProfileEditorModal } from './ProfileEditorModal';
import { ProfileSections, type NewProfileKind } from './ProfileSections';

export function ManageProfilesPage() {
  const profiles = useProfilesQuery();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<NewProfileKind | null>(null);

  const editingProfile: ProfileDTO | null =
    profiles.data?.find((profile) => profile.id === editingId) ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center gap-10 px-4 py-10">
      <h1 className="text-center font-display text-4xl text-text sm:text-5xl lg:text-6xl">
        Gerenciar perfis
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
          onSelect={(profile) => setEditingId(profile.id)}
          onAdd={setCreating}
        />
      )}

      <Link
        to="/perfis"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-contrast"
      >
        Concluído
      </Link>

      <ProfileEditorModal profile={editingProfile} onClose={() => setEditingId(null)} />
      <CreateProfileModal
        isOpen={creating !== null}
        isGuest={creating === 'guest'}
        onClose={() => setCreating(null)}
      />
    </main>
  );
}
