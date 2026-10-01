import type { ProfileDTO } from '@caraoke/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  currentProfile: ProfileDTO | null;
  setProfile: (profile: ProfileDTO) => void;
  clear: () => void;
}

export const PROFILE_STORAGE_KEY = 'caraoke.profile';

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      currentProfile: null,
      setProfile: (profile) => set({ currentProfile: profile }),
      clear: () => set({ currentProfile: null }),
    }),
    { name: PROFILE_STORAGE_KEY },
  ),
);
