import { create } from 'zustand';

interface RestartState {
  isRestarting: boolean;
  markRestarting: () => void;
}

export const useRestartStore = create<RestartState>()((set) => ({
  isRestarting: false,
  markRestarting: () => set({ isRestarting: true }),
}));
