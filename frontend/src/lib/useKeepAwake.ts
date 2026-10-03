import { useEffect, useState } from 'react';

export type KeepAwakeMode = 'off' | 'wake-lock' | 'video' | 'unavailable';

export const KEEP_AWAKE_VIDEO_URL = '/keep-awake.mp4';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

function createHiddenVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.src = KEEP_AWAKE_VIDEO_URL;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  Object.assign(video.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(video);
  return video;
}

export function useKeepAwake(isActive: boolean): KeepAwakeMode {
  const [mode, setMode] = useState<KeepAwakeMode>('off');

  useEffect(() => {
    if (!isActive) {
      setMode('off');
      return;
    }
    let isCurrent = true;
    let sentinel: WakeLockSentinelLike | null = null;
    let video: HTMLVideoElement | null = null;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;

    const useVideo = () => {
      video = createHiddenVideo();
      Promise.resolve(video.play())
        .then(() => isCurrent && setMode('video'))
        .catch(() => isCurrent && setMode('unavailable'));
    };

    if (wakeLock) {
      wakeLock
        .request('screen')
        .then((lock) => {
          sentinel = lock;
          if (isCurrent) setMode('wake-lock');
        })
        .catch(() => isCurrent && useVideo());
    } else {
      useVideo();
    }

    return () => {
      isCurrent = false;
      void sentinel?.release().catch(() => undefined);
      video?.pause();
      video?.remove();
    };
  }, [isActive]);

  return mode;
}
