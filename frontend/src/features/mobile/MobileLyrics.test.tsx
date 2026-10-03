import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerStateDTO } from '@caraoke/shared';
import { measureClockOffset, positionAt } from '../../lib/serverClock';
import { useKeepAwake } from '../../lib/useKeepAwake';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { useMobileLyricsStore } from '../../stores/useMobileLyricsStore';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { usePlayerBroadcast, type BroadcastSnapshot } from '../player/usePlayerBroadcast';
import { MobileLayout } from './MobileLayout';
import { MobileLyricsPage } from './MobileLyricsPage';

const socketMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    socket: {
      on(event: string, handler: Handler) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)?.add(handler);
      },
      off(event: string, handler: Handler) {
        handlers.get(event)?.delete(handler);
      },
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
});

vi.mock('../../realtime/socket', () => ({ getSocket: () => socketMock.socket, reconnectSocket: vi.fn() }));

const LYRICS_URL = '/media/s1/letra.json?v=1';

function stateOf(overrides: Partial<PlayerStateDTO> = {}): PlayerStateDTO {
  return {
    song: {
      id: 's1',
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      lyricsUrl: LYRICS_URL,
      durationSec: 200,
    },
    singer: { name: 'Carla', avatar: 'frog' },
    position: 21,
    playing: false,
    offsetMs: 0,
    effect: { enabled: true, id: 'smooth', fillPercent: 100 },
    at: Date.now(),
    ...overrides,
  };
}

const LYRICS = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 20, end: 24, text: 'Primeira linha' },
    { start: 24, end: 28, text: 'Segunda linha' },
  ],
};

function renderPhone(path: string, routes: MockRoutes) {
  window.history.pushState({}, '', path);
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<MobileLayout />}>
            <Route path="/m/letra" element={<MobileLyricsPage />} />
            <Route path="/m/fila" element={<p>Tela da fila</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('lyrics on the phone', () => {
  beforeEach(() => {
    socketMock.handlers.clear();
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    useMobileProfileStore.setState({ profile: { id: 'g1', name: 'Duda', avatar: 'cat' } });
    useMobileLyricsStore.setState({ isEffectEnabled: true, adjustMs: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('shows who is singing and the line the TV is on, reading the lyrics with the access code', async () => {
    const fetchMock = renderPhone('/m/letra', {
      'GET /api/player/state': { body: stateOf() },
      'GET /api/system/time': { body: { now: Date.now() } },
      [`GET ${LYRICS_URL}&c=K7P2QX`]: { body: LYRICS },
    });

    expect(await screen.findByText('Carla canta')).toBeInTheDocument();
    expect(screen.getByText('Evidências — Chitãozinho & Xororó')).toBeInTheDocument();
    expect(await screen.findByText('Primeira')).toBeInTheDocument();
    expect(screen.getByText('pausado')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'GET', `${LYRICS_URL}&c=K7P2QX`)).toHaveLength(1);
  });

  const wordProgress = (word: string) =>
    Number((screen.getByText(word).closest('.lyric-fill') as HTMLElement).style.getPropertyValue('--p'));
  const lyricsRoutes = (state: PlayerStateDTO): MockRoutes => ({
    'GET /api/player/state': { body: state },
    'GET /api/system/time': () => ({ body: { now: Date.now() } }),
    [`GET ${LYRICS_URL}&c=K7P2QX`]: { body: LYRICS },
  });

  it('turns the painting effect off just on this phone, coloring the whole line at once', async () => {
    renderPhone('/m/letra', lyricsRoutes(stateOf({ position: 20.5 })));
    await screen.findByText('Primeira');
    await waitFor(() => expect(wordProgress('linha')).toBeLessThan(1));

    fireEvent.click(screen.getByRole('button', { name: /Efeito: ligado/ }));

    await waitFor(() => expect(wordProgress('linha')).toBe(1));
    expect(useMobileLyricsStore.getState().isEffectEnabled).toBe(false);
  });

  it('moves the lyrics earlier or later on this phone and remembers it', async () => {
    renderPhone('/m/letra', lyricsRoutes(stateOf({ position: 20.5 })));
    await screen.findByText('Primeira');
    const before = wordProgress('Primeira');

    fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra' }));

    expect(screen.getByText('Letra +0,3 s')).toBeInTheDocument();
    expect(useMobileLyricsStore.getState().adjustMs).toBe(300);
    await waitFor(() => expect(wordProgress('Primeira')).toBeGreaterThan(before));

    fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra' }));
    expect(useMobileLyricsStore.getState().adjustMs).toBe(200);
  });

  it('says nothing is playing when the TV is stopped', async () => {
    renderPhone('/m/letra', {
      'GET /api/player/state': { body: null },
      'GET /api/system/time': { body: { now: 0 } },
    });

    expect(await screen.findByText(/Nenhuma música tocando agora/)).toBeInTheDocument();
  });

  it('shows the "Letra" tab only while the TV is playing', async () => {
    renderPhone('/m/fila', { 'GET /api/player/state': { body: null } });
    await screen.findByText('Tela da fila');
    expect(screen.queryByRole('link', { name: 'Letra' })).not.toBeInTheDocument();

    act(() => socketMock.emit('player:state', stateOf()));
    expect(await screen.findByRole('link', { name: 'Letra' })).toHaveAttribute('href', '/m/letra');

    act(() => socketMock.emit('player:state', null));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Letra' })).not.toBeInTheDocument());
  });
});

describe('server clock', () => {
  it('measures the difference to the PC clock using the fastest answer', async () => {
    const times = [1000, 1010, 2000, 2100, 3000, 3004];
    const clock = () => times.shift() ?? 0;
    const answers = [{ now: 6005 }, { now: 7050 }, { now: 8002 }];

    const offset = await measureClockOffset(() => Promise.resolve(answers.shift() ?? { now: 0 }), clock, 3);

    expect(offset).toBe(5000);
  });

  it('moves the position forward while playing and keeps it while paused', () => {
    const state = stateOf({ position: 10, playing: true, at: 50_000 });
    expect(positionAt(state, 1000, 51_500)).toBe(12.5);
    expect(positionAt({ ...state, playing: false }, 1000, 51_500)).toBe(10);
  });
});

describe('useKeepAwake', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('uses the screen wake lock when the browser has it', async () => {
    const release = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn(() => Promise.resolve({ release })) },
    });

    const { result, unmount } = renderHook(() => useKeepAwake(true));

    await waitFor(() => expect(result.current).toBe('wake-lock'));
    unmount();
    expect(release).toHaveBeenCalled();
  });

  it('falls back to a hidden silent video on pages without HTTPS', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    const { result, unmount } = renderHook(() => useKeepAwake(true));

    await waitFor(() => expect(result.current).toBe('video'));
    expect(play).toHaveBeenCalled();
    const video = document.querySelector('video');
    expect(video?.getAttribute('src')).toBe('/keep-awake.mp4');
    expect(video?.muted).toBe(true);
    unmount();
    expect(document.querySelector('video')).toBeNull();
  });

  it('says it is not possible when even the video cannot play', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('blocked'));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    const { result } = renderHook(() => useKeepAwake(true));

    await waitFor(() => expect(result.current).toBe('unavailable'));
  });

  it('does nothing while there is no song', () => {
    const { result } = renderHook(() => useKeepAwake(false));
    expect(result.current).toBe('off');
  });
});

describe('usePlayerBroadcast', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const bodies = (fetchMock: ReturnType<typeof mockApi>) =>
    requestsTo(fetchMock, 'POST', '/api/player/state').map(([, init]) => JSON.parse(String(init?.body)));

  function snapshot(overrides: Partial<BroadcastSnapshot> = {}): BroadcastSnapshot {
    return {
      songId: 's1',
      singer: { name: 'Carla', avatar: 'frog' },
      isActive: true,
      isPlaying: true,
      offsetMs: 0,
      effect: { enabled: true, id: 'smooth', fillPercent: 100 },
      getTime: () => 3,
      ...overrides,
    };
  }

  it('tells the server when it starts, when it pauses and when it stops', async () => {
    const fetchMock = mockApi({ 'POST /api/player/state': { body: null } });
    const { rerender, unmount } = renderHook((props: BroadcastSnapshot) => usePlayerBroadcast(props), {
      initialProps: snapshot(),
    });
    await waitFor(() => expect(bodies(fetchMock)).toHaveLength(1));
    expect(bodies(fetchMock)[0]).toMatchObject({
      songId: 's1',
      position: 3,
      playing: true,
      singer: { name: 'Carla' },
    });

    rerender(snapshot({ isPlaying: false }));
    await waitFor(() => expect(bodies(fetchMock)).toHaveLength(2), { timeout: 2000 });
    expect(bodies(fetchMock)[1]).toMatchObject({ playing: false });

    unmount();
    await waitFor(() => expect(bodies(fetchMock).at(-1)).toEqual({ stopped: true }));
  });

  it('tells the server when the song jumps to another point', async () => {
    const fetchMock = mockApi({ 'POST /api/player/state': { body: null } });
    let time = 3;
    renderHook(() => usePlayerBroadcast(snapshot({ isPlaying: false, getTime: () => time })));
    await waitFor(() => expect(bodies(fetchMock)).toHaveLength(1));

    time = 60;

    await waitFor(() => expect(bodies(fetchMock).at(-1)).toMatchObject({ position: 60 }), { timeout: 2000 });
  });

  it('sends nothing while not performing', async () => {
    const fetchMock = mockApi({});
    renderHook(() => usePlayerBroadcast(snapshot({ isActive: false })));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bodies(fetchMock)).toHaveLength(0);
  });
});
