import { useEffect } from 'react';
import { applyTheme } from './theme';

export function useThemePreview(themeId: string, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;

    const previousTheme = document.documentElement.dataset.theme;
    applyTheme(themeId);

    return () => {
      if (previousTheme) applyTheme(previousTheme);
    };
  }, [themeId, isActive]);
}
