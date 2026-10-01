import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  SOCKET_ROOMS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketHandshakeAuth,
  type SocketRoom,
} from '@caraoke/shared';

type CaraokeServer = Server<ClientToServerEvents, ServerToClientEvents>;

let io: CaraokeServer | null = null;

function resolveRoom(auth: Partial<SocketHandshakeAuth>): SocketRoom {
  return auth.client === 'mobile' ? SOCKET_ROOMS.mobile : SOCKET_ROOMS.stage;
}

export function attachRealtime(httpServer: HttpServer): CaraokeServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: true },
  });

  io.on('connection', (socket) => {
    const auth = socket.handshake.auth as Partial<SocketHandshakeAuth>;
    void socket.join(resolveRoom(auth));
  });

  return io;
}

export function emitToAll<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  io?.emit(event, ...args);
}

export function emitToRoom<E extends keyof ServerToClientEvents>(
  room: SocketRoom,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  io?.to(room).emit(event, ...args);
}

export async function closeRealtime(): Promise<void> {
  await io?.close();
  io = null;
}
