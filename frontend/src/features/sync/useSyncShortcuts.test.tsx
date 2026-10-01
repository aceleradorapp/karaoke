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
    handlers = {
      togglePlay: vi.fn(),
      seekBy: vi.fn(),
      nudgeSelected: vi.fn(),
      selectRelative: vi.fn(),
      markLine: vi.fn(),
      tapBack: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
    };
    renderHook(() => useSyncShortcuts(handlers as unknown as SyncShortcutHandlers, true));
  });

  it('plays and pauses with the space bar', () => {
    press(' ');
    expect(handlers.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('marks the line with Enter or M, and goes back with Backspace', () => {
    press('Enter');
    press('m');
    press('Backspace');
    expect(handlers.markLine).toHaveBeenCalledTimes(2);
    expect(handlers.tapBack).toHaveBeenCalledTimes(1);
  });

  it('jumps five seconds with the left and right arrows', () => {
    press('ArrowLeft');
    press('ArrowRight');
    expect(handlers.seekBy.mock.calls).toEqual([[-5], [5]]);
  });

  it('chooses the previous and next line with the up and down arrows', () => {
    press('ArrowUp');
    press('ArrowDown');
    expect(handlers.selectRelative.mock.calls).toEqual([[-1], [1]]);
  });

  it('nudges the chosen line 0.1 s with the brackets and 1 s with Shift or the braces', () => {
    press('[');
    press(']');
    press('[', { shiftKey: true });
    press('{', { shiftKey: true });
    press('}', { shiftKey: true });
    expect(handlers.nudgeSelected.mock.calls).toEqual([[-0.1], [0.1], [-1], [-1], [1]]);
  });

  it('undoes with Ctrl+Z and redoes with Ctrl+Y or Ctrl+Shift+Z', () => {
    const undo = press('z', { ctrlKey: true });
    press('y', { ctrlKey: true });
    press('z', { ctrlKey: true, shiftKey: true });
    press('z', { metaKey: true });
    expect(undo.defaultPrevented).toBe(true);
    expect(handlers.undo).toHaveBeenCalledTimes(2);
    expect(handlers.redo).toHaveBeenCalledTimes(2);
  });

  it('keeps the browser from scrolling for the keys it handles', () => {
    expect(press(' ').defaultPrevented).toBe(true);
    expect(press('ArrowDown').defaultPrevented).toBe(true);
  });

  it('leaves the keys to a focused button and to form fields', () => {
    const button = document.createElement('button');
    const input = document.createElement('input');
    const select = document.createElement('select');
    document.body.append(button, input, select);

    press(' ', {}, button);
    press('Enter', {}, button);
    press('m', {}, input);
    press('Backspace', {}, input);
    press('z', { ctrlKey: true }, input);
    press('ArrowDown', {}, select);

    expect(handlers.togglePlay).not.toHaveBeenCalled();
    expect(handlers.markLine).not.toHaveBeenCalled();
    expect(handlers.tapBack).not.toHaveBeenCalled();
    expect(handlers.undo).not.toHaveBeenCalled();
    expect(handlers.selectRelative).not.toHaveBeenCalled();
    button.remove();
    input.remove();
    select.remove();
  });

  it('ignores other Ctrl combinations and keys it does not use', () => {
    press('m', { ctrlKey: true });
    expect(press('x').defaultPrevented).toBe(false);
    expect(handlers.markLine).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const quiet = { togglePlay: vi.fn() } as unknown as SyncShortcutHandlers;
    renderHook(() => useSyncShortcuts(quiet, false));
    press(' ');
    expect(quiet.togglePlay).not.toHaveBeenCalled();
  });
});
