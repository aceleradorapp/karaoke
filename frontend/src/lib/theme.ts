import { DEFAULT_THEME_ID, isThemeId } from '@caraoke/shared';

export function applyTheme(themeId: string): void {
  document.documentElement.dataset.theme = isThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
}
