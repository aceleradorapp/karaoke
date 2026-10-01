import { useEffect, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart'] as const;

export function useIdle(delayMs: number, isEnabled: boolean): boolean {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    if (!isEnabled) {
      setIsIdle(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const wakeUp = () => {
      setIsIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), delayMs);
    };

    wakeUp();
    for (const eventName of ACTIVITY_EVENTS) document.addEventListener(eventName, wakeUp);
    return () => {
      clearTimeout(timer);
      for (const eventName of ACTIVITY_EVENTS) document.removeEventListener(eventName, wakeUp);
    };
  }, [delayMs, isEnabled]);

  return isIdle;
}
