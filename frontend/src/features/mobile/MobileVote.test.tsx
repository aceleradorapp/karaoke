import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinalScore, VotingSummary } from '@caraoke/shared';
import { FINAL_SCORE_QUERY_KEY } from '../../api/voting';
import { VOTER_TOKEN_STORAGE_KEY, voterToken } from '../../lib/voterToken';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { MobileLayout } from './MobileLayout';
import { MobileVotePage, returnPathOf } from './MobileVotePage';

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

const CARLA = { id: 'g1', name: 'Carla', avatar: 'frog' };
const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

function votingOf(overrides: Partial<VotingSummary> = {}): VotingSummary {
  return {
    performanceId: 'perf1',
    singer: { id: 'p1', name: 'Ana', avatar: 'lion' },
    song: { title: 'Evidências', artist: 'Chitãozinho & Xororó' },
    endsAt: inSeconds(20),
    ...overrides,
  };
}

const FINAL: FinalScore = {
  performanceId: 'perf1',
  pitchScore: null,
  audienceScore: 90,
  finalScore: 90,
  votes: 4,
};

function renderAt(path: string, routes: MockRoutes, state?: unknown) {
  window.history.pushState({}, '', path);
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route element={<MobileLayout />}>
            <Route path="/m/votar" element={<MobileVotePage />} />
            <Route path="/m/fila" element={<p>Tela da fila</p>} />
            <Route path="/m/musicas" element={<p>Tela de músicas</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, queryClient };
}

const currentVoting = (voting: VotingSummary | null): MockRoutes => ({
  'GET /api/performances/voting/current': { body: voting },
});

describe('voting on the phone', () => {
  beforeEach(() => {
    socketMock.handlers.clear();
    localStorage.clear();
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    useMobileProfileStore.setState({ profile: CARLA });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.history.pushState({}, '', '/');
  });

  it('shows who sang, the song, the stars and the time left', async () => {
    renderAt('/m/votar', currentVoting(votingOf()));

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByText('Evidências — Chitãozinho & Xororó')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('timer', { name: 'Tempo para votar' })).toHaveTextContent(
      /^(19|20) s para votar$/,
    );
  });

  it('votes with the phone token and the identity, then thanks', async () => {
    const { fetchMock } = renderAt('/m/votar', {
      ...currentVoting(votingOf()),
      'POST /api/performances/perf1/votes': { body: { votes: 1 } },
    });

    fireEvent.click(await screen.findByRole('radio', { name: '4 estrelas' }));

    expect(await screen.findByText('Obrigado! 🎉')).toBeInTheDocument();
    const [, init] = requestsTo(fetchMock, 'POST', '/api/performances/perf1/votes')[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      voterToken: localStorage.getItem(VOTER_TOKEN_STORAGE_KEY),
      voterProfileId: 'g1',
      stars: 4,
    });
  });

  it('treats a repeated vote as already counted', async () => {
    renderAt('/m/votar', {
      ...currentVoting(votingOf()),
      'POST /api/performances/perf1/votes': {
        status: 409,
        body: { error: { code: 'ALREADY_VOTED', message: 'Você já votou nesta música' } },
      },
    });

    fireEvent.click(await screen.findByRole('radio', { name: '5 estrelas' }));

    expect(await screen.findByText('Obrigado! 🎉')).toBeInTheDocument();
  });

  it('explains when the voting has already ended and lets the person try again', async () => {
    renderAt('/m/votar', {
      ...currentVoting(votingOf()),
      'POST /api/performances/perf1/votes': {
        status: 409,
        body: { error: { code: 'VOTING_CLOSED', message: 'A votação desta música já terminou' } },
      },
    });

    fireEvent.click(await screen.findByRole('radio', { name: '5 estrelas' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.message).toBe('A votação desta música já terminou'),
    );
    expect(screen.getByRole('radio', { name: '5 estrelas' })).not.toBeChecked();
  });

  it('does not let the singer vote, showing that the audience is voting', async () => {
    renderAt('/m/votar', currentVoting(votingOf({ singer: { id: 'g1', name: 'Carla', avatar: 'frog' } })));

    expect(await screen.findByText('É a sua vez! A plateia está votando 🎤')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('says there is nothing to vote on when no voting is open', async () => {
    renderAt('/m/votar', currentVoting(null));

    expect(await screen.findByText(/Nenhuma votação agora/)).toBeInTheDocument();
  });

  it('opens by itself when a song ends, shows the "Votar" tab, and goes back after the final score', async () => {
    let open: VotingSummary | null = null;
    renderAt('/m/fila', { 'GET /api/performances/voting/current': () => ({ body: open }) });
    await screen.findByText('Tela da fila');
    expect(screen.queryByRole('link', { name: 'Votar' })).not.toBeInTheDocument();

    open = votingOf();
    act(() => socketMock.emit('vote:open', open));

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Votar' })).toHaveAttribute('aria-current', 'page');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => socketMock.emit('score:final', FINAL));
    act(() => vi.advanceTimersByTime(10));

    expect(screen.getByRole('status')).toHaveTextContent('Nota final90');
    expect(screen.queryByRole('link', { name: 'Votar' })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Tela da fila')).toBeInTheDocument();
  });

  it('does not show the score of another performance', async () => {
    const { queryClient } = renderAt('/m/votar', currentVoting(votingOf()));
    await screen.findByRole('heading', { name: 'Ana' });

    act(() => queryClient.setQueryData(FINAL_SCORE_QUERY_KEY, { ...FINAL, performanceId: 'other' }));

    expect(screen.queryByText('Nota final')).not.toBeInTheDocument();
  });

  it('goes back to the tab the person was on, or to the songs', () => {
    expect(returnPathOf({ from: '/m/fila' })).toBe('/m/fila');
    expect(returnPathOf({ from: '/m/votar' })).toBe('/m/musicas');
    expect(returnPathOf(null)).toBe('/m/musicas');
  });
});

describe('voterToken', () => {
  it('creates a token once and keeps it', () => {
    localStorage.clear();
    const first = voterToken();
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(voterToken()).toBe(first);
  });
});
