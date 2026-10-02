import { DEFAULT_THEME_ID } from '@caraoke/shared';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSettingsQuery } from '../api/settings';
import { isMobilePath } from '../lib/mobileApp';
import { applyTheme } from '../lib/theme';
import { useProfileStore } from '../stores/useProfileStore';

const PROFILE_SCREENS_PREFIX = '/perfis';

export function ThemeSync() {
  const { pathname } = useLocation();
  const isMobile = isMobilePath(pathname);
  const defaultTheme = useSettingsQuery(!isMobile).data?.['ui.defaultTheme'] ?? DEFAULT_THEME_ID;
  const profileTheme = useProfileStore((state) => state.currentProfile?.theme);
  const isProfileScreen = pathname.startsWith(PROFILE_SCREENS_PREFIX);
  const effectiveTheme = isMobile || isProfileScreen || !profileTheme ? defaultTheme : profileTheme;

  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  return null;
}
