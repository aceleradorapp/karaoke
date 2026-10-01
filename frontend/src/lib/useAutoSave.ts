import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveOptions<T> {
  delayMs?: number;
  savedVisibleMs?: number;
  isValid?: (value: T) => boolean;
  isEqual?: (a: T, b: T) => boolean;
}

export interface AutoSave {
  status: SaveStatus;
  retry: () => void;
  flush: () => void;
}

const DEFAULT_DELAY_MS = 600;
const DEFAULT_SAVED_VISIBLE_MS = 2000;

export function useAutoSave<T>(
  value: T,
  save: (value: T) => Promise<unknown>,
  options: AutoSaveOptions<T> = {},
): AutoSave {
  const { delayMs = DEFAULT_DELAY_MS, savedVisibleMs = DEFAULT_SAVED_VISIBLE_MS } = options;
  const isValid = options.isValid ?? (() => true);
  const isEqual = options.isEqual ?? Object.is;

  const [status, setStatus] = useState<SaveStatus>('idle');

  const latestValueRef = useRef(value);
  const lastSavedRef = useRef(value);
  const saveRef = useRef(save);
  const isValidRef = useRef(isValid);
  const isEqualRef = useRef(isEqual);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPendingRef = useRef(false);
  const isSavingRef = useRef(false);
  const hasQueuedRunRef = useRef(false);

  latestValueRef.current = value;
  saveRef.current = save;
  isValidRef.current = isValid;
  isEqualRef.current = isEqual;

  const run = useCallback(async (): Promise<void> => {
    isPendingRef.current = false;
    if (isSavingRef.current) {
      hasQueuedRunRef.current = true;
      return;
    }

    const current = latestValueRef.current;
    const hasNothingToSave =
      !isValidRef.current(current) || isEqualRef.current(current, lastSavedRef.current);
    if (hasNothingToSave) return;

    isSavingRef.current = true;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setStatus('saving');

    try {
      await saveRef.current(current);
      lastSavedRef.current = current;
      setStatus('saved');
      savedTimerRef.current = setTimeout(() => setStatus('idle'), savedVisibleMs);
    } catch {
      setStatus('error');
    } finally {
      isSavingRef.current = false;
      if (hasQueuedRunRef.current) {
        hasQueuedRunRef.current = false;
        void run();
      }
    }
  }, [savedVisibleMs]);

  useEffect(() => {
    const hasNothingToSave = !isValidRef.current(value) || isEqualRef.current(value, lastSavedRef.current);
    if (hasNothingToSave) return;

    isPendingRef.current = true;
    debounceTimerRef.current = setTimeout(() => void run(), delayMs);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value, delayMs, run]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (isPendingRef.current) void run();
    },
    [run],
  );

  const flush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    void run();
  }, [run]);

  return { status, retry: flush, flush };
}
