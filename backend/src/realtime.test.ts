import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SOCKET_ACCESS_DENIED,
  attachRealtime,
  closeRealtime,
  disconnectRoom,
  emitToRoom,
} from './realtime.js';

const CODE = 'ABC234';
const PHONE_THROUGH_PROXY = { 'x-forwarded-for': '192.168.0.50' };

describe('realtime access', () => {
  let httpServer: HttpServer;
  let url: string;
  let accessCode: string | null;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    accessCode = CODE;
    httpServer = createServer();
    attachRealtime(httpServer, async () => accessCode);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    await closeRealtime();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function open(auth: Record<string, unknown>, headers: Record<string, string> = {}): Socket {
    const socket = connect(url, {
      auth,
      extraHeaders: headers,
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  const connected = (socket: Socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (error) => reject(error));
    });

  const refused = (socket: Socket) =>
    new Promise<string>((resolve, reject) => {
      socket.once('connect', () => reject(new Error('should not connect')));
      socket.once('connect_error', (error) => resolve(error.message));
    });

  const nextEvent = (socket: Socket, event: string, timeoutMs = 400) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      socket.once(event, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  it('lets the stage connect without a code and sends it the stage events', async () => {
    const stage = open({ client: 'stage' });
    await connected(stage);

    const received = nextEvent(stage, 'settings:updated');
    emitToRoom('stage', 'settings:updated', {} as never);

    expect(await received).toBe(true);
  });

  it('refuses a phone without the code', async () => {
    expect(await refused(open({ client: 'mobile' }, PHONE_THROUGH_PROXY))).toBe(SOCKET_ACCESS_DENIED);
  });

  it('refuses a phone with a wrong code', async () => {
    expect(await refused(open({ client: 'mobile', code: 'ZZZ999' }, PHONE_THROUGH_PROXY))).toBe(
      SOCKET_ACCESS_DENIED,
    );
  });

  it('refuses everybody outside the PC when there is no code yet', async () => {
    accessCode = null;
    expect(await refused(open({ client: 'mobile', code: CODE }, PHONE_THROUGH_PROXY))).toBe(
      SOCKET_ACCESS_DENIED,
    );
  });

  it('cannot be fooled by a phone pretending to be the PC', async () => {
    const forged = open({ client: 'stage' }, { 'x-forwarded-for': '127.0.0.1, 192.168.0.50' });
    expect(await refused(forged)).toBe(SOCKET_ACCESS_DENIED);
  });

  it('puts a phone with the code in the phones room, even if it says it is the stage', async () => {
    const phone = open({ client: 'stage', code: CODE }, PHONE_THROUGH_PROXY);
    await connected(phone);

    const stageEvent = nextEvent(phone, 'settings:updated');
    emitToRoom('stage', 'settings:updated', {} as never);
    expect(await stageEvent).toBe(false);

    const phoneEvent = nextEvent(phone, 'access:changed');
    emitToRoom('mobile', 'access:changed');
    expect(await phoneEvent).toBe(true);
  });

  it('warns and disconnects the phones when the code changes, but keeps the stage', async () => {
    const stage = open({ client: 'stage' });
    const phone = open({ client: 'mobile', code: CODE }, PHONE_THROUGH_PROXY);
    await Promise.all([connected(stage), connected(phone)]);

    const warned = nextEvent(phone, 'access:changed');
    const dropped = nextEvent(phone, 'disconnect');
    emitToRoom('mobile', 'access:changed');
    disconnectRoom('mobile');

    expect(await warned).toBe(true);
    expect(await dropped).toBe(true);
    expect(stage.connected).toBe(true);
  });
});
