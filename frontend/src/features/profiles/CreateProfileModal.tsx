import { AVATARS, DEFAULT_THEME_ID, createProfileSchema } from '@caraoke/shared';
import { useState, type FormEvent } from 'react';
import { useCreateProfileMutation } from '../../api/profiles';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { toast } from '../../stores/useToastStore';
import { AvatarPicker } from './AvatarPicker';
import { ThemePicker } from './ThemePicker';

interface CreateProfileModalProps {
  isOpen: boolean;
  isGuest: boolean;
  onClose: () => void;
}

const FORM_ID = 'create-profile-form';
const FIRST_AVATAR_ID = AVATARS[0].id;

export function CreateProfileModal({ isOpen, isGuest, onClose }: CreateProfileModalProps) {
  const createProfile = useCreateProfileMutation();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(FIRST_AVATAR_ID);
  const [theme, setTheme] = useState<string>(DEFAULT_THEME_ID);
  const [nameError, setNameError] = useState<string | null>(null);

  function resetAndClose() {
    setName('');
    setAvatar(FIRST_AVATAR_ID);
    setTheme(DEFAULT_THEME_ID);
    setNameError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createProfileSchema.safeParse({ name, avatar, theme, isGuest });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    try {
      await createProfile.mutateAsync(parsed.data);
      toast.success(isGuest ? 'Convidado adicionado' : 'Perfil criado');
      resetAndClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o perfil');
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={isGuest ? 'Novo convidado' : 'Novo perfil'}
      onClose={resetAndClose}
      footer={
        <>
          <Button variant="ghost" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} isLoading={createProfile.isPending}>
            Criar
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Nome</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? 'profile-name-error' : undefined}
            className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
          />
          {nameError && (
            <span id="profile-name-error" role="alert" className="text-sm text-danger">
              {nameError}
            </span>
          )}
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Avatar</span>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>

        {!isGuest && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">Tema</span>
            <ThemePicker value={theme} onChange={setTheme} />
          </div>
        )}
      </form>
    </Modal>
  );
}
