import { updateProfileSchema } from '@caraoke/shared';
import { useState } from 'react';
import { useUpdateProfileMutation } from '../../api/profiles';
import { SaveIndicator } from '../../components/SaveIndicator';
import { applyTheme } from '../../lib/theme';
import { useAutoSave } from '../../lib/useAutoSave';
import { useProfileStore } from '../../stores/useProfileStore';
import { ThemePicker } from '../profiles/ThemePicker';

export function MyThemeField() {
  const profile = useProfileStore((state) => state.currentProfile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const updateProfile = useUpdateProfileMutation();
  const [theme, setTheme] = useState(profile?.theme ?? '');

  const autoSave = useAutoSave(
    theme,
    async (value) => {
      if (!profile) return;
      const changes = updateProfileSchema.parse({ theme: value });
      setProfile(await updateProfile.mutateAsync({ id: profile.id, changes }));
    },
    { delayMs: 0 },
  );

  if (!profile) return null;

  function chooseTheme(themeId: string) {
    applyTheme(themeId);
    setTheme(themeId);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-base font-medium">Meu tema</span>
        <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
      </div>
      <ThemePicker label="Meu tema" value={theme} onChange={chooseTheme} />
    </div>
  );
}
