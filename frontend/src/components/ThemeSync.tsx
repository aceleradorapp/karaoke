import { DEFAULT_THEME_ID } from '@caraoke/shared';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { applyTheme } from '../lib/theme';
import { useProfileStore } from '../stores/useProfileStore';

const PROFILE_SCREENS_PREFIX = '/perfis';

export function ThemeSync() {
  const { pathname } = useLocation();
  const profileTheme = useProfileStore((state) => state.currentProfile?.theme);
  const isProfileScreen = pathname.startsWith(PROFILE_SCREENS_PREFIX);

  useEffect(() => {
    applyTheme(isProfileScreen || !profileTheme ? DEFAULT_THEME_ID : profileTheme);
  }, [isProfileScreen, profileTheme]);

  return null;
}
