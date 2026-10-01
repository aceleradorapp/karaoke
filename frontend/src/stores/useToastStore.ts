import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const TOAST_DURATION_MS = 4000;

let nextToastId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = nextToastId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismiss(id), TOAST_DURATION_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const toast = {
  info: (message: string) => useToastStore.getState().push(message, 'info'),
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  error: (message: string) => useToastStore.getState().push(message, 'error'),
};
