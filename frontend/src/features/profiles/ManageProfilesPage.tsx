import type { ProfileDTO } from '@caraoke/shared';
import { useState } from 'react';
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl">Gerenciar perfis</h1>
        <p className="text-base text-muted">
          Toque num perfil para mudar o nome, o avatar ou o tema, ou para excluir.
        </p>
      </div>

      {profiles.isLoading && <Spinner className="mx-auto size-10" />}

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

      <ProfileEditorModal profile={editingProfile} onClose={() => setEditingId(null)} />
      <CreateProfileModal
        isOpen={creating !== null}
        isGuest={creating === 'guest'}
        onClose={() => setCreating(null)}
      />
    </div>
  );
}
