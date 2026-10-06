import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerShortcuts, type PlayerShortcutHandlers } from './usePlayerShortcuts';

function buildHandlers(): { [K in keyof PlayerShortcutHandlers]: ReturnType<typeof vi.fn> } {
  return {
    togglePlay: vi.fn(),
    toggleVoiceGuide: vi.fn(),
    toggleLyricsEffect: vi.fn(),
    seekBy: vi.fn(),
    changeVolumeBy: vi.fn(),
    adjustLyricsOffset: vi.fn(),
    changeKeyBy: vi.fn(),
    toggleFullscreen: vi.fn(),
    requestExit: vi.fn(),
  };
}

function press(
  key: string,
  options: KeyboardEventInit = {},
  target: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

describe('usePlayerShortcuts', () => {
  let handlers: ReturnType<typeof buildHandlers>;

  beforeEach(() => {
    handlers = buildHandlers();
    renderHook(() => usePlayerShortcuts(handlers as unknown as PlayerShortcutHandlers, true));
  });

  it('plays and pauses with the space bar', () => {
    press(' ');
    expect(handlers.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('toggles the guide voice with V, in either case', () => {
    press('v');
    press('V');
    expect(handlers.toggleVoiceGuide).toHaveBeenCalledTimes(2);
  });

  it('turns the lyrics effect on and off with E', () => {
    press('e');
    press('E');
    expect(handlers.toggleLyricsEffect).toHaveBeenCalledTimes(2);
  });

  it('jumps five seconds with the left and right arrows', () => {
    press('ArrowLeft');
    press('ArrowRight');
    expect(handlers.seekBy.mock.calls).toEqual([[-5], [5]]);
  });

  it('changes the volume by ten percent with the up and down arrows', () => {
    press('ArrowUp');
    press('ArrowDown');
    expect(handlers.changeVolumeBy.mock.calls).toEqual([[0.1], [-0.1]]);
  });

  it('moves the lyrics 100 ms with the square brackets', () => {
    press('[');
    press(']');
    expect(handlers.adjustLyricsOffset.mock.calls).toEqual([[-100], [100]]);
  });

  it('lowers and raises the key one semitone with minus and plus', () => {
    press('-');
    press('=');
    press('+');
    expect(handlers.changeKeyBy.mock.calls).toEqual([[-1], [1], [1]]);
  });

  it('toggles full screen with F and asks to leave with Escape', () => {
    press('f');
    press('Escape');
    expect(handlers.toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(handlers.requestExit).toHaveBeenCalledTimes(1);
  });

  it('keeps the browser from scrolling the page for the keys it handles', () => {
    expect(press(' ').defaultPrevented).toBe(true);
    expect(press('ArrowDown').defaultPrevented).toBe(true);
  });

  it('ignores keys it does not use', () => {
    expect(press('x').defaultPrevented).toBe(false);
    expect(handlers.togglePlay).not.toHaveBeenCalled();
  });

  it('ignores shortcuts combined with Ctrl, Alt or Cmd', () => {
    press('f', { ctrlKey: true });
    press('v', { metaKey: true });
    press('ArrowLeft', { altKey: true });
    expect(handlers.toggleFullscreen).not.toHaveBeenCalled();
    expect(handlers.toggleVoiceGuide).not.toHaveBeenCalled();
    expect(handlers.seekBy).not.toHaveBeenCalled();
  });

  it('leaves the keys to form fields while the user is typing or using a slider', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    press(' ', {}, input);
    press('ArrowLeft', {}, input);

    expect(handlers.togglePlay).not.toHaveBeenCalled();
    expect(handlers.seekBy).not.toHaveBeenCalled();
    input.remove();
  });

  it('does nothing while disabled and stops listening when removed', () => {
    const disabledHandlers = buildHandlers();
    const { unmount } = renderHook(() =>
      usePlayerShortcuts(disabledHandlers as unknown as PlayerShortcutHandlers, false),
    );
    press(' ');
    expect(disabledHandlers.togglePlay).not.toHaveBeenCalled();

    const activeHandlers = buildHandlers();
    const active = renderHook(() =>
      usePlayerShortcuts(activeHandlers as unknown as PlayerShortcutHandlers, true),
    );
    active.unmount();
    unmount();
    press(' ');
    expect(activeHandlers.togglePlay).not.toHaveBeenCalled();
  });
});
