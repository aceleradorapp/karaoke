import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  SOCKET_ROOMS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketHandshakeAuth,
  type SocketRoom,
} from '@caraoke/shared';
import { clientAddress, isLoopback } from './services/network.js';
import { safeEqual } from './utils/safeEqual.js';

type CaraokeServer = Server<ClientToServerEvents, ServerToClientEvents>;
type CaraokeSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export type AccessCodeReader = () => Promise<string | null>;

export const SOCKET_ACCESS_DENIED = 'ACCESS_DENIED';

let io: CaraokeServer | null = null;

function isFromStage(socket: CaraokeSocket): boolean {
  const address = clientAddress(socket.handshake.address, socket.handshake.headers['x-forwarded-for']);
  return isLoopback(address);
}

function resolveRoom(socket: CaraokeSocket, fromStage: boolean): SocketRoom {
  const auth = socket.handshake.auth as Partial<SocketHandshakeAuth>;
  if (!fromStage) return SOCKET_ROOMS.mobile;
  return auth.client === 'mobile' ? SOCKET_ROOMS.mobile : SOCKET_ROOMS.stage;
}

export function attachRealtime(httpServer: HttpServer, readAccessCode: AccessCodeReader): CaraokeServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: true },
  });

  io.use(async (socket, next) => {
    if (isFromStage(socket)) return next();
    const auth = socket.handshake.auth as Partial<SocketHandshakeAuth>;
    const accessCode = await readAccessCode().catch(() => null);
    const isValid = accessCode !== null && typeof auth.code === 'string' && safeEqual(auth.code, accessCode);
    return isValid ? next() : next(new Error(SOCKET_ACCESS_DENIED));
  });

  io.on('connection', (socket) => {
    void socket.join(resolveRoom(socket, isFromStage(socket)));
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

export function disconnectRoom(room: SocketRoom): void {
  io?.in(room).disconnectSockets(true);
}

export async function closeRealtime(): Promise<void> {
  await io?.close();
  io = null;
}
