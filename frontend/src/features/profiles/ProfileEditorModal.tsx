import { updateProfileSchema, type ProfileDTO } from '@caraoke/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteProfileMutation, useUpdateProfileMutation } from '../../api/profiles';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { SaveIndicator } from '../../components/SaveIndicator';
import { useAutoSave } from '../../lib/useAutoSave';
import { useProfileStore } from '../../stores/useProfileStore';
import { toast } from '../../stores/useToastStore';
import { AvatarPicker } from './AvatarPicker';
import { ThemePicker } from './ThemePicker';

const NAME_DEBOUNCE_MS = 600;
const INSTANT_SAVE_MS = 0;

interface ProfileDraft {
  name: string;
  avatar: string;
  theme: string;
}

function isSameDraft(a: ProfileDraft, b: ProfileDraft): boolean {
  return a.name === b.name && a.avatar === b.avatar && a.theme === b.theme;
}

function isValidDraft(draft: ProfileDraft): boolean {
  return updateProfileSchema.safeParse(draft).success;
}

interface ProfileEditorFormProps {
  profile: ProfileDTO;
  onClose: () => void;
}

function ProfileEditorForm({ profile, onClose }: ProfileEditorFormProps) {
  const navigate = useNavigate();
  const updateProfile = useUpdateProfileMutation();
  const deleteProfile = useDeleteProfileMutation();
  const currentProfile = useProfileStore((state) => state.currentProfile);
  const setCurrentProfile = useProfileStore((state) => state.setProfile);
  const clearCurrentProfile = useProfileStore((state) => state.clear);

  const [draft, setDraft] = useState<ProfileDraft>({
    name: profile.name,
    avatar: profile.avatar,
    theme: profile.theme,
  });
  const [isNameBeingTyped, setIsNameBeingTyped] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  async function save(value: ProfileDraft) {
    const changes = updateProfileSchema.parse(value);
    const updated = await updateProfile.mutateAsync({ id: profile.id, changes });
    if (currentProfile?.id === updated.id) {
      setCurrentProfile(updated);
    }
  }

  const autoSave = useAutoSave(draft, save, {
    delayMs: isNameBeingTyped ? NAME_DEBOUNCE_MS : INSTANT_SAVE_MS,
    isValid: isValidDraft,
    isEqual: isSameDraft,
  });

  function changeName(name: string) {
    setIsNameBeingTyped(true);
    setDraft((previous) => ({ ...previous, name }));
  }

  function changeAvatar(avatar: string) {
    setIsNameBeingTyped(false);
    setDraft((previous) => ({ ...previous, avatar }));
  }

  function changeTheme(theme: string) {
    setIsNameBeingTyped(false);
    setDraft((previous) => ({ ...previous, theme }));
  }

  async function confirmDelete() {
    try {
      await deleteProfile.mutateAsync(profile.id);
      toast.success('Perfil excluído');
      setIsConfirmingDelete(false);
      onClose();
      if (currentProfile?.id === profile.id) {
        clearCurrentProfile();
        navigate('/perfis');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir o perfil');
    }
  }

  const isNameEmpty = draft.name.trim().length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="profile-editor-name" className="text-sm text-muted">
          Nome
        </label>
        <input
          id="profile-editor-name"
          value={draft.name}
          onChange={(event) => changeName(event.target.value)}
          onBlur={autoSave.flush}
          aria-invalid={isNameEmpty}
          className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
        />
        {isNameEmpty && (
          <span role="alert" className="text-sm text-danger">
            Informe um nome
          </span>
        )}
        <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Avatar</span>
        <AvatarPicker value={draft.avatar} onChange={changeAvatar} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Tema</span>
        <ThemePicker value={draft.theme} onChange={changeTheme} />
      </div>

      <div className="border-t border-surface-2 pt-4">
        <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>
          Excluir perfil
        </Button>
      </div>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Excluir perfil"
        message={`Excluir "${profile.name}" apaga também as playlists, favoritas e o histórico dele. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setIsConfirmingDelete(false)}
        isLoading={deleteProfile.isPending}
      />
    </div>
  );
}

interface ProfileEditorModalProps {
  profile: ProfileDTO | null;
  onClose: () => void;
}

export function ProfileEditorModal({ profile, onClose }: ProfileEditorModalProps) {
  return (
    <Modal
      isOpen={profile !== null}
      title="Editar perfil"
      onClose={onClose}
      footer={<Button onClick={onClose}>Concluído</Button>}
    >
      {profile && <ProfileEditorForm key={profile.id} profile={profile} onClose={onClose} />}
    </Modal>
  );
}
