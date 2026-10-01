import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncShortcuts, type SyncShortcutHandlers } from './useSyncShortcuts';

function press(key: string, options: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

describe('useSyncShortcuts', () => {
  let handlers: { [K in keyof SyncShortcutHandlers]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    handlers = { togglePlay: vi.fn(), seekBy: vi.fn(), nudgeOffset: vi.fn(), markLine: vi.fn() };
    renderHook(() => useSyncShortcuts(handlers as unknown as SyncShortcutHandlers, true));
  });

  it('plays and pauses with the space bar and marks the line with M', () => {
    press(' ');
    press('m');
    expect(handlers.togglePlay).toHaveBeenCalledTimes(1);
    expect(handlers.markLine).toHaveBeenCalledTimes(1);
  });

  it('jumps five seconds with the arrows', () => {
    press('ArrowLeft');
    press('ArrowRight');
    expect(handlers.seekBy.mock.calls).toEqual([[-5], [5]]);
  });

  it('nudges the lyrics 100 ms with the brackets and one second with the curly braces', () => {
    press('[');
    press(']');
    press('{', { shiftKey: true });
    press('}', { shiftKey: true });
    expect(handlers.nudgeOffset.mock.calls).toEqual([[-100], [100], [-1000], [1000]]);
  });

  it('leaves the space bar to a focused button and the keys to form fields', () => {
    const button = document.createElement('button');
    const select = document.createElement('select');
    document.body.append(button, select);

    press(' ', {}, button);
    press('m', {}, select);

    expect(handlers.togglePlay).not.toHaveBeenCalled();
    expect(handlers.markLine).not.toHaveBeenCalled();
    button.remove();
    select.remove();
  });

  it('ignores combinations with Ctrl and keys it does not use', () => {
    press('m', { ctrlKey: true });
    expect(press('x').defaultPrevented).toBe(false);
    expect(handlers.markLine).not.toHaveBeenCalled();
  });
});
