import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdle } from './useIdle';

const DELAY_MS = 3000;

describe('useIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('becomes idle after the delay without activity', () => {
    const { result } = renderHook(() => useIdle(DELAY_MS, true));
    expect(result.current).toBe(false);

    act(() => vi.advanceTimersByTime(DELAY_MS));

    expect(result.current).toBe(true);
  });

  it('wakes up on activity and starts counting again', () => {
    const { result } = renderHook(() => useIdle(DELAY_MS, true));
    act(() => vi.advanceTimersByTime(DELAY_MS));

    act(() => {
      document.dispatchEvent(new Event('mousemove'));
    });
    expect(result.current).toBe(false);

    act(() => vi.advanceTimersByTime(DELAY_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it.each(['keydown', 'mousedown', 'touchstart'])('also wakes up on %s', (eventName) => {
    const { result } = renderHook(() => useIdle(DELAY_MS, true));
    act(() => vi.advanceTimersByTime(DELAY_MS));

    act(() => {
      document.dispatchEvent(new Event(eventName));
    });

    expect(result.current).toBe(false);
  });

  it('never goes idle while disabled', () => {
    const { result } = renderHook(() => useIdle(DELAY_MS, false));
    act(() => vi.advanceTimersByTime(DELAY_MS * 3));
    expect(result.current).toBe(false);
  });

  it('stops listening when removed', () => {
    const { unmount } = renderHook(() => useIdle(DELAY_MS, true));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
