import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompetitionDTO, ProfileDTO } from '@caraoke/shared';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildSong } from '../../test/songBuilder';
import { CompetitionPage } from './CompetitionPage';
import { CompetitionsPage } from './CompetitionsPage';

function Probe() {
  const location = useLocation();
  return <p>Em {location.pathname}</p>;
}

function renderAt(path: string, routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/disputas" element={<CompetitionsPage />} />
          <Route path="/disputas/:id" element={<CompetitionPage />} />
          <Route path="/proximos" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const profileOf = (id: string, name: string, isGuest = false): ProfileDTO => ({
  id,
  name,
  avatar: 'lion',
  theme: 'cinema',
  isGuest,
  createdAt: '',
  lastUsedAt: '',
});
const ANA = profileOf('p1', 'Ana');
const BIA = profileOf('p2', 'Bia', true);
const asRanking = (profile: ProfileDTO) => ({
  id: profile.id,
  name: profile.name,
  avatar: profile.avatar,
  isGuest: profile.isGuest,
});

function competitionOf(overrides: Partial<CompetitionDTO> = {}): CompetitionDTO {
  return {
    id: 'c1',
    name: 'Noite das Divas',
    status: 'DRAFT',
    imageUrl: null,
    participantsCount: 0,
    createdAt: '2026-10-05T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    rules: {
      songsPerParticipant: 2,
      scoringMode: 'audience',
      voteSeconds: 20,
      autoAdvanceSeconds: 15,
      shuffle: false,
    },
    participants: [],
    scoreboard: [],
    ...overrides,
  };
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, url: string, index = 0) =>
  JSON.parse(String(requestsTo(fetchMock, method, url)[index]?.[1]?.body));

describe('competitions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('list', () => {
    it('lists the competitions with status and participants', async () => {
      renderAt('/disputas', {
        'GET /api/competitions': {
          body: {
            items: [
              competitionOf({ status: 'RUNNING', participantsCount: 3 }),
              competitionOf({ id: 'c2', name: 'Duelo' }),
            ],
          },
        },
      });

      expect(await screen.findByText('Noite das Divas')).toBeInTheDocument();
      expect(screen.getByText('Em andamento · 3 participantes')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Duelo/ })).toHaveAttribute('href', '/disputas/c2');
    });

    it('creates a competition and opens it', async () => {
      const fetchMock = renderAt('/disputas', {
        'GET /api/competitions': { body: { items: [] } },
        'POST /api/competitions': { status: 201, body: competitionOf({ id: 'c9' }) },
        'GET /api/competitions/c9': { body: competitionOf({ id: 'c9' }) },
        'GET /api/profiles': { body: { items: [] } },
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Nova disputa' }));
      fireEvent.change(screen.getByLabelText('Nome da disputa'), { target: { value: 'Noite das Divas' } });
      fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/competitions')).toHaveLength(1));
      expect(bodyOf(fetchMock, 'POST', '/api/competitions')).toEqual({ name: 'Noite das Divas' });
      expect(await screen.findByRole('region', { name: 'Na disputa' })).toBeInTheDocument();
    });
  });

  describe('draft', () => {
    const draftRoutes = (competition: CompetitionDTO, extra: MockRoutes = {}): MockRoutes => ({
      'GET /api/competitions/c1': { body: competition },
      'GET /api/profiles': { body: { items: [ANA, BIA] } },
      ...extra,
    });

    it('puts a person in the competition with the + button', async () => {
      const withAna = competitionOf({ participants: [{ profile: asRanking(ANA), position: 1, songs: [] }] });
      const fetchMock = renderAt(
        '/disputas/c1',
        draftRoutes(competitionOf(), { 'PUT /api/competitions/c1/participants': { body: withAna } }),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Pôr Ana na disputa' }));

      await waitFor(() =>
        expect(requestsTo(fetchMock, 'PUT', '/api/competitions/c1/participants')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'PUT', '/api/competitions/c1/participants')).toEqual({ profileIds: ['p1'] });
      const zone = screen.getByRole('region', { name: 'Na disputa' });
      expect(await within(zone).findByText('Ana')).toBeInTheDocument();
      expect(within(zone).getByText('0/2')).toBeInTheDocument();
    });

    it('chooses a song from the library for a participant', async () => {
      const song = buildSong({ id: 's1', title: 'Evidências' });
      const competition = competitionOf({
        participants: [{ profile: asRanking(ANA), position: 1, songs: [] }],
      });
      const withSong = competitionOf({
        participants: [{ profile: asRanking(ANA), position: 1, songs: [{ id: 'e1', song }] }],
      });
      const fetchMock = renderAt(
        '/disputas/c1',
        draftRoutes(competition, {
          'GET /api/songs?sort=title': { body: { items: [song], nextCursor: null } },
          'POST /api/competitions/c1/songs': { body: withSong },
        }),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Música para Ana' }));
      fireEvent.click(await screen.findByRole('button', { name: /Evidências/ }));

      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/competitions/c1/songs')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'POST', '/api/competitions/c1/songs')).toEqual({
        profileId: 'p1',
        songId: 's1',
      });
      expect(await screen.findByRole('button', { name: 'Tirar Evidências de Ana' })).toBeInTheDocument();
    });

    it('starts only with two participants and songs, then goes to the queue', async () => {
      const song = buildSong({ id: 's1', title: 'Evidências' });
      const ready = competitionOf({
        participants: [
          { profile: asRanking(ANA), position: 1, songs: [{ id: 'e1', song }] },
          { profile: asRanking(BIA), position: 2, songs: [] },
        ],
      });
      const fetchMock = renderAt(
        '/disputas/c1',
        draftRoutes(ready, { 'POST /api/competitions/c1/start': { body: { ...ready, status: 'RUNNING' } } }),
      );

      const start = await screen.findByRole('button', { name: 'Começar a disputa' });
      expect(start).toBeEnabled();
      fireEvent.click(start);

      expect(await screen.findByText('Em /proximos')).toBeInTheDocument();
      expect(requestsTo(fetchMock, 'POST', '/api/competitions/c1/start')).toHaveLength(1);
    });

    it('cannot start with only one participant', async () => {
      renderAt(
        '/disputas/c1',
        draftRoutes(competitionOf({ participants: [{ profile: asRanking(ANA), position: 1, songs: [] }] })),
      );

      expect(await screen.findByRole('button', { name: 'Começar a disputa' })).toBeDisabled();
      expect(screen.getByText(/pelo menos 2 participantes/)).toBeInTheDocument();
    });

    it('saves the rules as soon as they change', async () => {
      const fetchMock = renderAt(
        '/disputas/c1',
        draftRoutes(competitionOf(), { 'PATCH /api/competitions/c1': { body: competitionOf() } }),
      );

      fireEvent.change(await screen.findByLabelText('Músicas por participante'), { target: { value: '3' } });

      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/competitions/c1')).toHaveLength(1));
      expect(bodyOf(fetchMock, 'PATCH', '/api/competitions/c1')).toEqual({ songsPerParticipant: 3 });
    });
  });

  describe('running and finished', () => {
    const scoreboard = [
      { profile: asRanking(BIA), avg: 92, best: 100, sung: 2, total: 2 },
      { profile: asRanking(ANA), avg: null, best: null, sung: 0, total: 2 },
    ];

    it('shows the live scoreboard and a way to the queue while it runs', async () => {
      renderAt('/disputas/c1', {
        'GET /api/competitions/c1': { body: competitionOf({ status: 'RUNNING', scoreboard }) },
        'GET /api/profiles': { body: { items: [] } },
      });

      const board = await screen.findByRole('region', { name: 'Placar' });
      expect(
        within(board)
          .getAllByRole('listitem')
          .map((row) => row.textContent),
      ).toEqual([
        expect.stringMatching(/Bia.*cantou 2 de 2.*92/),
        expect.stringMatching(/Ana.*cantou 0 de 2.*—/),
      ]);
      expect(screen.getByRole('link', { name: 'Ir para a fila' })).toHaveAttribute('href', '/proximos');
      expect(screen.queryByRole('button', { name: 'Apagar disputa' })).not.toBeInTheDocument();
    });

    it('asks before finishing', async () => {
      const fetchMock = renderAt('/disputas/c1', {
        'GET /api/competitions/c1': { body: competitionOf({ status: 'RUNNING', scoreboard }) },
        'POST /api/competitions/c1/finish': { body: competitionOf({ status: 'FINISHED', scoreboard }) },
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Encerrar disputa' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar' }));

      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/competitions/c1/finish')).toHaveLength(1),
      );
      expect(await screen.findByText('Bia venceu!')).toBeInTheDocument();
    });

    it('celebrates the winner when it is over', async () => {
      renderAt('/disputas/c1', {
        'GET /api/competitions/c1': { body: competitionOf({ status: 'FINISHED', scoreboard }) },
      });

      expect(await screen.findByText('Bia venceu!')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Nota 92' })).toBeInTheDocument();
    });

    it('says when the competition does not exist', async () => {
      renderAt('/disputas/c1', {
        'GET /api/competitions/c1': { status: 404, body: { error: { code: 'X', message: 'x' } } },
      });
      expect(await screen.findByText('Disputa não encontrada')).toBeInTheDocument();
    });
  });
});
