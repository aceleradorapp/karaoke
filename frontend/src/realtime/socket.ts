import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, SocketHandshakeAuth } from '@caraoke/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type RealtimeSocket = Pick<AppSocket, 'on' | 'off'>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  const auth: SocketHandshakeAuth = { client: 'stage' };
  socket ??= io({ auth });
  return socket;
}
