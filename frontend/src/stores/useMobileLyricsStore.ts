import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const MOBILE_LYRICS_STORAGE_KEY = 'caraoke.mobileLyrics';
export const LYRICS_ADJUST_STEP_MS = 100;
export const LYRICS_ADJUST_LIMIT_MS = 2000;

interface MobileLyricsState {
  isEffectEnabled: boolean;
  adjustMs: number;
  setEffectEnabled: (enabled: boolean) => void;
  adjustBy: (deltaMs: number) => void;
  resetAdjust: () => void;
}

function clamp(value: number): number {
  return Math.min(LYRICS_ADJUST_LIMIT_MS, Math.max(-LYRICS_ADJUST_LIMIT_MS, value));
}

export const useMobileLyricsStore = create<MobileLyricsState>()(
  persist(
    (set) => ({
      isEffectEnabled: true,
      adjustMs: 0,
      setEffectEnabled: (enabled) => set({ isEffectEnabled: enabled }),
      adjustBy: (deltaMs) => set((state) => ({ adjustMs: clamp(state.adjustMs + deltaMs) })),
      resetAdjust: () => set({ adjustMs: 0 }),
    }),
    { name: MOBILE_LYRICS_STORAGE_KEY },
  ),
);
