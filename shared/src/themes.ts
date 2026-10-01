export const THEMES = [
  { id: 'cinema', name: 'Cinema' },
  { id: 'neon', name: 'Neon' },
  { id: 'light', name: 'Claro' },
  { id: 'retro', name: 'Retrô' },
] as const;

export type Theme = (typeof THEMES)[number];
export type ThemeId = Theme['id'];

export const DEFAULT_THEME_ID: ThemeId = 'cinema';

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
