import clsx from 'clsx';
import { ListOrdered, Search, Upload } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { SOCKET_ACCESS_DENIED_MESSAGE } from '@caraoke/shared';
import { getSocket, type RealtimeSocket } from '../../realtime/socket';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { ScanAgain } from './MobileEntry';

const TABS = [
  { to: '/m/buscar', label: 'Buscar', Icon: Search },
  { to: '/m/enviar', label: 'Enviar', Icon: Upload },
  { to: '/m/fila', label: 'Fila', Icon: ListOrdered },
] as const;

export function useMobileAccessEvents(socket: RealtimeSocket = getSocket()): void {
  const markDenied = useMobileAccessStore((state) => state.markDenied);

  useEffect(() => {
    const onAccessChanged = () => markDenied();
    const onConnectError = (error: Error) => {
      if (error.message === SOCKET_ACCESS_DENIED_MESSAGE) markDenied();
    };
    socket.on('access:changed', onAccessChanged);
    socket.on('connect_error', onConnectError);
    return () => {
      socket.off('access:changed', onAccessChanged);
      socket.off('connect_error', onConnectError);
    };
  }, [socket, markDenied]);
}

export function MobileLayout() {
  const code = useMobileAccessStore((state) => state.code);
  const status = useMobileAccessStore((state) => state.status);
  useMobileAccessEvents();

  if (!code) return <Navigate to="/m" replace />;
  if (status === 'denied') {
    return (
      <ScanAgain
        title="Escaneie o QR code de novo"
        text="O código de acesso mudou. Aponte a câmera para o QR code na TV."
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-surface-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <span className="font-display text-2xl text-primary">Karaokê</span>
        <span className="text-sm text-muted">no celular</span>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav
        aria-label="Seções do celular"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-surface-2 bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm',
                isActive ? 'text-primary' : 'text-muted',
              )
            }
          >
            <Icon aria-hidden="true" className="size-6" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
