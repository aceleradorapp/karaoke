import { DEFAULT_THEME_ID } from '@caraoke/shared';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSettingsQuery } from '../api/settings';
import { applyTheme } from '../lib/theme';
import { useProfileStore } from '../stores/useProfileStore';

const PROFILE_SCREENS_PREFIX = '/perfis';

export function ThemeSync() {
  const { pathname } = useLocation();
  const defaultTheme = useSettingsQuery().data?.['ui.defaultTheme'] ?? DEFAULT_THEME_ID;
  const profileTheme = useProfileStore((state) => state.currentProfile?.theme);
  const isProfileScreen = pathname.startsWith(PROFILE_SCREENS_PREFIX);
  const effectiveTheme = isProfileScreen || !profileTheme ? defaultTheme : profileTheme;

  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  return null;
}
