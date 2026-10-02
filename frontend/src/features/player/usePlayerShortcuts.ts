import { useEffect, useRef } from 'react';

export interface PlayerShortcutHandlers {
  togglePlay: () => void;
  toggleVoiceGuide: () => void;
  toggleLyricsEffect: () => void;
  seekBy: (seconds: number) => void;
  changeVolumeBy: (delta: number) => void;
  adjustLyricsOffset: (deltaMs: number) => void;
  toggleFullscreen: () => void;
  requestExit: () => void;
}

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.1;
const OFFSET_STEP_MS = 100;
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TYPING_TAGS.has(target.tagName) || target.isContentEditable);
}

export function usePlayerShortcuts(handlers: PlayerShortcutHandlers, isEnabled: boolean): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const actions = handlersRef.current;

      const byKey: Record<string, () => void> = {
        ' ': actions.togglePlay,
        v: actions.toggleVoiceGuide,
        e: actions.toggleLyricsEffect,
        ArrowLeft: () => actions.seekBy(-SEEK_STEP_SECONDS),
        ArrowRight: () => actions.seekBy(SEEK_STEP_SECONDS),
        ArrowUp: () => actions.changeVolumeBy(VOLUME_STEP),
        ArrowDown: () => actions.changeVolumeBy(-VOLUME_STEP),
        '[': () => actions.adjustLyricsOffset(-OFFSET_STEP_MS),
        ']': () => actions.adjustLyricsOffset(OFFSET_STEP_MS),
        f: actions.toggleFullscreen,
        Escape: actions.requestExit,
      };
      const action = byKey[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isEnabled]);
}
