import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MobileProfile {
  id: string;
  name: string;
  avatar: string;
}

interface MobileProfileState {
  profile: MobileProfile | null;
  setProfile: (profile: MobileProfile) => void;
  clearProfile: () => void;
}

export const MOBILE_PROFILE_STORAGE_KEY = 'caraoke.mobileProfile';

export const useMobileProfileStore = create<MobileProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: ({ id, name, avatar }) => set({ profile: { id, name, avatar } }),
      clearProfile: () => set({ profile: null }),
    }),
    { name: MOBILE_PROFILE_STORAGE_KEY },
  ),
);
