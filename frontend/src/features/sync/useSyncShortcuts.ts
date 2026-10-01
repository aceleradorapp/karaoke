import { useEffect, useRef } from 'react';

export interface SyncShortcutHandlers {
  togglePlay: () => void;
  seekBy: (seconds: number) => void;
  nudgeOffset: (deltaMs: number) => void;
  markLine: () => void;
}

const SEEK_STEP_SECONDS = 5;
const FINE_STEP_MS = 100;
const COARSE_STEP_MS = 1000;
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TYPING_TAGS.has(target.tagName) || target.isContentEditable);
}

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.tagName === 'BUTTON';
}

export function useSyncShortcuts(handlers: SyncShortcutHandlers, isEnabled: boolean): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === ' ' && isButton(event.target)) return;

      const actions = handlersRef.current;
      const step = event.shiftKey ? COARSE_STEP_MS : FINE_STEP_MS;
      const byKey: Record<string, () => void> = {
        ' ': actions.togglePlay,
        m: actions.markLine,
        ArrowLeft: () => actions.seekBy(-SEEK_STEP_SECONDS),
        ArrowRight: () => actions.seekBy(SEEK_STEP_SECONDS),
        '[': () => actions.nudgeOffset(-step),
        ']': () => actions.nudgeOffset(step),
        '{': () => actions.nudgeOffset(-COARSE_STEP_MS),
        '}': () => actions.nudgeOffset(COARSE_STEP_MS),
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
