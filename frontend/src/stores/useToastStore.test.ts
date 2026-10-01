import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToastStore } from './useToastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds toasts with their kind', () => {
    toast.success('Salvo');
    toast.error('Falhou');

    expect(useToastStore.getState().toasts.map(({ message, kind }) => ({ message, kind }))).toEqual([
      { message: 'Salvo', kind: 'success' },
      { message: 'Falhou', kind: 'error' },
    ]);
  });

  it('dismisses a toast manually', () => {
    toast.info('Oi');
    const [first] = useToastStore.getState().toasts;

    useToastStore.getState().dismiss(first!.id);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('dismisses a toast automatically after a few seconds', () => {
    toast.info('Oi');
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
