import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { ListOrdered, MicVocal, Music, Search, Star, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  SOCKET_ACCESS_DENIED_MESSAGE,
  type FinalScore,
  type PlayerStateDTO,
  type VotingSummary,
} from '@caraoke/shared';
import { PLAYER_STATE_QUERY_KEY, usePlayerStateQuery } from '../../api/playerState';
import { useProfilesQuery } from '../../api/profiles';
import { CURRENT_VOTING_QUERY_KEY, FINAL_SCORE_QUERY_KEY, useCurrentVotingQuery } from '../../api/voting';
import { Avatar } from '../../components/Avatar';
import { getSocket, type RealtimeSocket } from '../../realtime/socket';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { ScanAgain } from './MobileEntry';

const SEARCH_TAB = '/m/buscar';
export const WHO_AM_I_PATH = '/m/quem-sou';
export const VOTE_PATH = '/m/votar';

const VOTE_TAB = { to: VOTE_PATH, label: 'Votar', Icon: Star } as const;
const LYRICS_TAB = { to: '/m/letra', label: 'Letra', Icon: MicVocal } as const;
const GRID_COLUMNS: Record<number, string> = { 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' };

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

export function useMobileVotingEvents(socket: RealtimeSocket = getSocket()): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = useRef('');
  currentPath.current = `${location.pathname}${location.search}`;

  useEffect(() => {
    const onVoteOpen = (voting: VotingSummary) => {
      queryClient.setQueryData(FINAL_SCORE_QUERY_KEY, null);
      queryClient.setQueryData(CURRENT_VOTING_QUERY_KEY, voting);
      const path = currentPath.current;
      if (path.startsWith(VOTE_PATH) || path.startsWith(WHO_AM_I_PATH)) return;
      navigate(VOTE_PATH, { state: { from: path } });
    };
    const onScoreFinal = (score: FinalScore) => {
      queryClient.setQueryData(FINAL_SCORE_QUERY_KEY, score);
      queryClient.setQueryData(CURRENT_VOTING_QUERY_KEY, null);
    };
    socket.on('vote:open', onVoteOpen);
    socket.on('score:final', onScoreFinal);
    return () => {
      socket.off('vote:open', onVoteOpen);
      socket.off('score:final', onScoreFinal);
    };
  }, [socket, queryClient, navigate]);
}

export function useMobilePlayerEvents(socket: RealtimeSocket = getSocket()): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onPlayerState = (state: PlayerStateDTO | null) =>
      queryClient.setQueryData(PLAYER_STATE_QUERY_KEY, state);
    socket.on('player:state', onPlayerState);
    return () => {
      socket.off('player:state', onPlayerState);
    };
  }, [socket, queryClient]);
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
  const voting = useCurrentVotingQuery();
  const player = usePlayerStateQuery();
  const tabs = [...TABS, ...(player.data ? [LYRICS_TAB] : []), ...(voting.data ? [VOTE_TAB] : [])];
  useMobileAccessEvents();
  useMobileVotingEvents();
  useMobilePlayerEvents();
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
          className={clsx(
            'fixed inset-x-0 bottom-0 z-20 grid border-t border-surface-2 bg-surface pb-[env(safe-area-inset-bottom)]',
            GRID_COLUMNS[tabs.length],
          )}
        >
          {tabs.map(({ to, label, Icon }) => (
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
