import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave } from './useAutoSave';

const DELAY_MS = 600;
const SAVED_VISIBLE_MS = 2000;

function setup(
  initialValue: string,
  save = vi.fn().mockResolvedValue(undefined),
  isValid?: (v: string) => boolean,
) {
  const hook = renderHook(({ value }) => useAutoSave(value, save, { isValid }), {
    initialProps: { value: initialValue },
  });
  return { ...hook, save };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not save the initial value', async () => {
    const { save, result } = setup('Ana');
    await advance(DELAY_MS * 3);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('saves after the delay and then clears the saved indicator', async () => {
    const { save, result, rerender } = setup('Ana');

    rerender({ value: 'Ana Maria' });
    await advance(DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await advance(1);
    expect(save).toHaveBeenCalledWith('Ana Maria');
    expect(result.current.status).toBe('saved');

    await advance(SAVED_VISIBLE_MS);
    expect(result.current.status).toBe('idle');
  });

  it('saves only the last value of a burst of changes', async () => {
    const { save, rerender } = setup('A');

    rerender({ value: 'An' });
    await advance(200);
    rerender({ value: 'Ana' });
    await advance(200);
    rerender({ value: 'Anas' });
    await advance(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('Anas');
  });

  it('does not save invalid values', async () => {
    const { save, rerender } = setup('Ana', undefined, (value) => value.trim().length > 0);

    rerender({ value: '  ' });
    await advance(DELAY_MS * 2);

    expect(save).not.toHaveBeenCalled();
  });

  it('does not save again when the value returns to the last saved one', async () => {
    const { save, rerender } = setup('Ana');

    rerender({ value: 'Bia' });
    await advance(100);
    rerender({ value: 'Ana' });
    await advance(DELAY_MS * 2);

    expect(save).not.toHaveBeenCalled();
  });

  it('reports an error and saves again on retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { result, rerender } = setup('Ana', save);

    rerender({ value: 'Bia' });
    await advance(DELAY_MS);
    expect(result.current.status).toBe('error');

    act(() => result.current.retry());
    await advance(0);

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('saves immediately on flush', async () => {
    const { save, result, rerender } = setup('Ana');

    rerender({ value: 'Bia' });
    act(() => result.current.flush());
    await advance(0);

    expect(save).toHaveBeenCalledWith('Bia');
  });

  it('flushes a pending save when unmounted', async () => {
    const { save, rerender, unmount } = setup('Ana');

    rerender({ value: 'Bia' });
    unmount();
    await advance(0);

    expect(save).toHaveBeenCalledWith('Bia');
  });

  it('queues a change made while a save is in flight', async () => {
    let finishFirstSave: () => void = () => undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirstSave = resolve)))
      .mockResolvedValue(undefined);
    const { rerender } = setup('A', save);

    rerender({ value: 'B' });
    await advance(DELAY_MS);
    rerender({ value: 'C' });
    await advance(DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);

    finishFirstSave();
    await advance(0);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('C');
  });
});
