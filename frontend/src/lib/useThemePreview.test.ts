import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemePreview } from './useThemePreview';

const currentTheme = () => document.documentElement.dataset.theme;

describe('useThemePreview', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = 'cinema';
  });

  it('applies the previewed theme right away', () => {
    renderHook(() => useThemePreview('neon', true));
    expect(currentTheme()).toBe('neon');
  });

  it('follows the theme as it changes', () => {
    const { rerender } = renderHook(({ theme }) => useThemePreview(theme, true), {
      initialProps: { theme: 'neon' },
    });

    rerender({ theme: 'retro' });

    expect(currentTheme()).toBe('retro');
  });

  it('restores the original theme when it stops previewing', () => {
    const { unmount } = renderHook(() => useThemePreview('neon', true));
    unmount();
    expect(currentTheme()).toBe('cinema');
  });

  it('restores the original theme when the preview becomes inactive', () => {
    const { rerender } = renderHook(({ isActive }) => useThemePreview('neon', isActive), {
      initialProps: { isActive: true },
    });

    rerender({ isActive: false });

    expect(currentTheme()).toBe('cinema');
  });

  it('does nothing while inactive', () => {
    renderHook(() => useThemePreview('neon', false));
    expect(currentTheme()).toBe('cinema');
  });
});
