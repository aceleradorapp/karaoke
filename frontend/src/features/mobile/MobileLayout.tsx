import clsx from 'clsx';
import { ListOrdered, Music, Search, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { SOCKET_ACCESS_DENIED_MESSAGE } from '@caraoke/shared';
import { useProfilesQuery } from '../../api/profiles';
import { Avatar } from '../../components/Avatar';
import { getSocket, type RealtimeSocket } from '../../realtime/socket';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { ScanAgain } from './MobileEntry';

const SEARCH_TAB = '/m/buscar';
export const WHO_AM_I_PATH = '/m/quem-sou';

const TABS = [
  { to: '/m/musicas', label: 'Músicas', Icon: Music },
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

function useForgetDeletedProfile(): void {
  const profileId = useMobileProfileStore((state) => state.profile?.id);
  const clearProfile = useMobileProfileStore((state) => state.clearProfile);
  const profiles = useProfilesQuery();

  useEffect(() => {
    if (!profileId || !profiles.isSuccess) return;
    if (!profiles.data.some((profile) => profile.id === profileId)) clearProfile();
  }, [profileId, profiles.isSuccess, profiles.data, clearProfile]);
}

export function MobileLayout() {
  const code = useMobileAccessStore((state) => state.code);
  const status = useMobileAccessStore((state) => state.status);
  const profile = useMobileProfileStore((state) => state.profile);
  const location = useLocation();
  const [lastSearch, setLastSearch] = useState('');
  const isChoosingIdentity = location.pathname === WHO_AM_I_PATH;
  useMobileAccessEvents();
  useForgetDeletedProfile();

  useEffect(() => {
    if (location.pathname === SEARCH_TAB) setLastSearch(location.search);
  }, [location.pathname, location.search]);

  if (!code) return <Navigate to="/m" replace />;
  if (status === 'denied') {
    return (
      <ScanAgain
        title="Escaneie o QR code de novo"
        text="O código de acesso mudou. Aponte a câmera para o QR code na TV."
      />
    );
  }
  if (!profile && !isChoosingIdentity) return <Navigate to={WHO_AM_I_PATH} replace />;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-surface-2 bg-bg/95 px-4 py-2 backdrop-blur">
        <span className="font-display text-2xl text-primary">Karaokê</span>
        {profile && !isChoosingIdentity && (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Avatar avatarId={profile.avatar} size="sm" />
            <span className="truncate text-base">{profile.name}</span>
            <Link
              to={WHO_AM_I_PATH}
              className="inline-flex min-h-11 items-center px-2 text-sm text-primary underline"
            >
              trocar
            </Link>
          </div>
        )}
      </header>

      <main className={clsx('flex-1 px-4 pt-4', isChoosingIdentity ? 'pb-8' : 'pb-24')}>
        <Outlet />
      </main>

      {!isChoosingIdentity && (
        <nav
          aria-label="Seções do celular"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-surface-2 bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          {TABS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to === SEARCH_TAB ? `${SEARCH_TAB}${lastSearch}` : to}
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
      )}
    </div>
  );
}
