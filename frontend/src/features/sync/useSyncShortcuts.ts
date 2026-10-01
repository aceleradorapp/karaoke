import { useEffect, useRef } from 'react';

export interface SyncShortcutHandlers {
  togglePlay: () => void;
  seekBy: (seconds: number) => void;
  nudgeSelected: (deltaSeconds: number) => void;
  selectRelative: (delta: number) => void;
  markLine: () => void;
  tapBack: () => void;
  undo: () => void;
  redo: () => void;
}

const SEEK_STEP_SECONDS = 5;
const FINE_STEP_SECONDS = 0.1;
const COARSE_STEP_SECONDS = 1;
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
      if (isTyping(event.target) || event.altKey) return;
      const actions = handlersRef.current;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (event.ctrlKey || event.metaKey) {
        const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey);
        if (key === 'z' && !event.shiftKey) actions.undo();
        else if (wantsRedo) actions.redo();
        else return;
        event.preventDefault();
        return;
      }

      if ((key === ' ' || key === 'Enter') && isButton(event.target)) return;

      const byKey: Record<string, () => void> = {
        ' ': actions.togglePlay,
        Enter: actions.markLine,
        m: actions.markLine,
        Backspace: actions.tapBack,
        ArrowLeft: () => actions.seekBy(-SEEK_STEP_SECONDS),
        ArrowRight: () => actions.seekBy(SEEK_STEP_SECONDS),
        ArrowUp: () => actions.selectRelative(-1),
        ArrowDown: () => actions.selectRelative(1),
        '[': () => actions.nudgeSelected(event.shiftKey ? -COARSE_STEP_SECONDS : -FINE_STEP_SECONDS),
        ']': () => actions.nudgeSelected(event.shiftKey ? COARSE_STEP_SECONDS : FINE_STEP_SECONDS),
        '{': () => actions.nudgeSelected(-COARSE_STEP_SECONDS),
        '}': () => actions.nudgeSelected(COARSE_STEP_SECONDS),
      };
      const action = byKey[key];
      if (!action) return;
      event.preventDefault();
      action();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isEnabled]);
}
