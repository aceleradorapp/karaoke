import { PROFILE_NAME_MAX_LENGTH, updateProfileSchema, type GuestDTO } from '@caraoke/shared';
import { Home, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useUpdateProfileMutation } from '../../api/profiles';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { SaveIndicator } from '../../components/SaveIndicator';
import { useAutoSave } from '../../lib/useAutoSave';
import { toast } from '../../stores/useToastStore';
import { AvatarPicker } from './AvatarPicker';

interface GuestDraft {
  name: string;
  avatar: string;
}

interface GuestEditorModalProps {
  guest: GuestDTO | null;
  onClose: () => void;
  onDelete: (guest: GuestDTO) => void;
}

function GuestEditorForm({ guest, onClose, onDelete }: { guest: GuestDTO; onClose: () => void; onDelete: (guest: GuestDTO) => void }) {
  const updateProfile = useUpdateProfileMutation();
  const [draft, setDraft] = useState<GuestDraft>({ name: guest.name, avatar: guest.avatar });
  const autoSave = useAutoSave(
    draft,
    (value) =>
      updateProfile.mutateAsync({
        id: guest.id,
        changes: updateProfileSchema.parse({ name: value.name.trim(), avatar: value.avatar }),
      }),
    {
      isValid: (value) => value.name.trim().length > 0,
      isEqual: (a, b) => a.name === b.name && a.avatar === b.avatar,
    },
  );

  function makeHouseProfile() {
    updateProfile.mutate(
      { id: guest.id, changes: { isGuest: false } },
      {
        onSuccess: () => {
          toast.success(`${guest.name} agora é da casa e pode ter playlists`);
          onClose();
        },
        onError: () => toast.error('Não foi possível mudar o perfil'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Nome</span>
        <input
          value={draft.name}
          maxLength={PROFILE_NAME_MAX_LENGTH}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          className="min-h-11 rounded-lg bg-surface-2 px-3 text-base"
        />
      </label>
      <AvatarPicker value={draft.avatar} onChange={(avatar) => setDraft((current) => ({ ...current, avatar }))} />
      <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={makeHouseProfile} disabled={updateProfile.isPending}>
          <Home aria-hidden="true" className="size-5" />
          Tornar da casa
        </Button>
        <Button variant="ghost" className="text-danger" onClick={() => onDelete(guest)}>
          <Trash2 aria-hidden="true" className="size-5" />
          Excluir convidado
        </Button>
      </div>
    </div>
  );
}

export function GuestEditorModal({ guest, onClose, onDelete }: GuestEditorModalProps) {
  return (
    <Modal
      isOpen={guest !== null}
      title="Editar convidado"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Concluído
        </Button>
      }
    >
      {guest && <GuestEditorForm key={guest.id} guest={guest} onClose={onClose} onDelete={onDelete} />}
    </Modal>
  );
}
