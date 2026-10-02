import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MobileAccessStatus = 'unknown' | 'ok' | 'denied';

interface MobileAccessState {
  code: string | null;
  status: MobileAccessStatus;
  setCode: (code: string) => void;
  markOk: () => void;
  markDenied: () => void;
}

export const ACCESS_CODE_STORAGE_KEY = 'caraoke.accessCode';

export const useMobileAccessStore = create<MobileAccessState>()(
  persist(
    (set) => ({
      code: null,
      status: 'unknown',
      setCode: (code) => set({ code: code.trim().toUpperCase(), status: 'unknown' }),
      markOk: () => set({ status: 'ok' }),
      markDenied: () => set({ status: 'denied' }),
    }),
    { name: ACCESS_CODE_STORAGE_KEY, partialize: (state) => ({ code: state.code }) },
  ),
);

export function currentAccessCode(): string | null {
  return useMobileAccessStore.getState().code;
}
