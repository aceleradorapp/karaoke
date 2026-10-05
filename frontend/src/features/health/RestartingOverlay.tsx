import { useEffect } from 'react';
import { Spinner } from '../../components/Spinner';
import { getSocket, type RealtimeSocket } from '../../realtime/socket';
import { useRestartStore } from '../../stores/useRestartStore';

const FIRST_CHECK_MS = 2500;
const CHECK_INTERVAL_MS = 1500;

async function isServerUp(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

export function useRestartingEvents(socket: RealtimeSocket = getSocket()): void {
  const markRestarting = useRestartStore((state) => state.markRestarting);
  useEffect(() => {
    socket.on('system:restarting', markRestarting);
    return () => {
      socket.off('system:restarting', markRestarting);
    };
  }, [socket, markRestarting]);
}

export function RestartingOverlay({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const isRestarting = useRestartStore((state) => state.isRestarting);
  useRestartingEvents();

  useEffect(() => {
    if (!isRestarting) return;
    let isCurrent = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!isCurrent) return;
      if (await isServerUp()) {
        reload();
        return;
      }
      timer = setTimeout(() => void poll(), CHECK_INTERVAL_MS);
    };
    timer = setTimeout(() => void poll(), FIRST_CHECK_MS);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isRestarting, reload]);

  if (!isRestarting) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Reiniciando o sistema"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center text-white"
    >
      <Spinner className="size-12" />
      <p className="font-display text-3xl">Reiniciando o sistema…</p>
      <p className="text-base text-white/80">Volta sozinho em alguns segundos.</p>
    </div>
  );
}
