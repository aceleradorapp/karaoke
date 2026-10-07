import type { ProfileDTO } from '@caraoke/shared';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useProfilesQuery } from '../../api/profiles';
import { Spinner } from '../../components/Spinner';
import { CreateProfileModal } from './CreateProfileModal';
import { ProfileEditorModal } from './ProfileEditorModal';
import { HouseProfiles } from './HouseProfiles';

export function ManageProfilesPage() {
  const profiles = useProfilesQuery();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const editingProfile: ProfileDTO | null =
    profiles.data?.find((profile) => profile.id === editingId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl">Gerenciar perfis</h1>
        <p className="text-base text-muted">
          Perfis das pessoas da casa (cada um com o seu tema, playlists e favoritas). Toque num perfil para mudar o
          nome, o avatar ou o tema, ou para excluir.
        </p>
      </div>

      <Link
        to="/convidados"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-surface-2 px-4 font-semibold"
      >
        <Users aria-hidden="true" className="size-5" />
        Gerenciar convidados
      </Link>

      {profiles.isLoading && <Spinner className="mx-auto size-10" />}

      {profiles.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar os perfis.
        </p>
      )}

      {profiles.isSuccess && (
        <HouseProfiles
          profiles={profiles.data}
          onSelect={(profile) => setEditingId(profile.id)}
          onAdd={() => setIsCreating(true)}
        />
      )}

      <ProfileEditorModal profile={editingProfile} onClose={() => setEditingId(null)} />
      <CreateProfileModal isOpen={isCreating} isGuest={false} onClose={() => setIsCreating(false)} />
    </div>
  );
}
