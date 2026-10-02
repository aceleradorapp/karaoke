import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, SocketHandshakeAuth } from '@caraoke/shared';
import { isMobileApp } from '../lib/mobileApp';
import { currentAccessCode } from '../stores/useMobileAccessStore';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type RealtimeSocket = Pick<AppSocket, 'on' | 'off'>;

let socket: AppSocket | null = null;

export function currentSocketAuth(): SocketHandshakeAuth {
  if (!isMobileApp()) return { client: 'stage' };
  const code = currentAccessCode();
  return code ? { client: 'mobile', code } : { client: 'mobile' };
}

export function getSocket(): AppSocket {
  socket ??= io({ auth: (callback) => callback(currentSocketAuth()) });
  return socket;
}

export function reconnectSocket(): void {
  const current = getSocket();
  current.disconnect();
  current.connect();
}
