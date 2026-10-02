import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RankingResponse } from '@caraoke/shared';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildSong } from '../../test/songBuilder';
import { RankingPage } from './RankingPage';

const ANA = { id: 'p1', name: 'Ana', avatar: 'lion', isGuest: false };
const BIA = { id: 'p2', name: 'Bia', avatar: 'cat', isGuest: false };
const CARLA = { id: 'g1', name: 'Carla', avatar: 'frog', isGuest: true };
const DUDA = { id: 'g2', name: 'Duda', avatar: 'robot', isGuest: true };

const FULL: RankingResponse = {
  bestAverage: [
    { profile: CARLA, avg: 97, count: 3 },
    { profile: ANA, avg: 80, count: 4 },
    { profile: BIA, avg: 71, count: 3 },
    { profile: DUDA, avg: 55, count: 5 },
  ],
  mostSung: [
    { profile: DUDA, count: 5 },
    { profile: ANA, count: 1 },
  ],
  topSongs: [{ song: buildSong({ title: 'Evidências', artist: 'Chitãozinho & Xororó' }), count: 7 }],
  champion: { profile: CARLA, avg: 97 },
};

const EMPTY: RankingResponse = { bestAverage: [], mostSung: [], topSongs: [], champion: null };

function renderPage(routes: MockRoutes, path = '/ranking') {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <RankingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('RankingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the star of the month, the podium in place and the rest of the averages', async () => {
    renderPage({ 'GET /api/ranking?period=month&scope=all': { body: FULL } });

    const star = await screen.findByRole('region', { name: 'Estrela do mês' });
    expect(star).toHaveTextContent('Carla');
    expect(star).toHaveTextContent('média 97');

    const podium = screen.getByRole('list', { name: 'Pódio' });
    expect(
      within(podium)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Ana'),
      expect.stringContaining('Carla'),
      expect.stringContaining('Bia'),
    ]);
    expect(within(podium).getByLabelText('1º lugar, média 97')).toBeInTheDocument();
    const averages = screen.getByRole('region', { name: 'Melhores médias' });
    expect(within(averages).getByText('Duda')).toBeInTheDocument();
    expect(within(averages).getByText('convidado')).toBeInTheDocument();
  });

  it('lists who sang most and the most sung songs', async () => {
    renderPage({ 'GET /api/ranking?period=month&scope=all': { body: FULL } });

    const singers = await screen.findByRole('region', { name: 'Quem mais cantou' });
    expect(
      within(singers)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringMatching(/Duda.*5 músicas/), expect.stringMatching(/Ana.*1 música$/)]);
    expect(
      within(screen.getByRole('region', { name: 'Músicas mais cantadas' })).getByText('7×'),
    ).toBeInTheDocument();
  });

  it('changes the period and keeps it in the address', async () => {
    const fetchMock = renderPage({
      'GET /api/ranking?period=month&scope=all': { body: FULL },
      'GET /api/ranking?period=week&scope=all': { body: EMPTY },
    });
    await screen.findByRole('list', { name: 'Pódio' });

    fireEvent.click(screen.getByRole('radio', { name: 'Semana' }));

    expect(await screen.findByText(/Ainda não há pódio neste período/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Semana' })).toBeChecked();
    expect(requestsTo(fetchMock, 'GET', '/api/ranking?period=week&scope=all')).toHaveLength(1);
  });

  it('shows only the family when the switch is on', async () => {
    const fetchMock = renderPage(
      {
        'GET /api/ranking?period=all&scope=all': { body: FULL },
        'GET /api/ranking?period=all&scope=family': {
          body: { ...EMPTY, mostSung: [{ profile: ANA, count: 1 }] },
        },
      },
      '/ranking?periodo=all',
    );
    await screen.findByRole('list', { name: 'Pódio' });

    fireEvent.click(screen.getByRole('switch', { name: 'Só a família' }));

    expect(await screen.findByText(/Ainda não há pódio/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Só a família' })).toHaveAttribute('aria-checked', 'true');
    expect(requestsTo(fetchMock, 'GET', '/api/ranking?period=all&scope=family')).toHaveLength(1);
  });

  it('explains how to enter the podium when nobody has scores yet', async () => {
    renderPage({ 'GET /api/ranking?period=month&scope=all': { body: EMPTY } });

    expect(await screen.findByText(/cada pessoa precisa de 3 músicas com nota/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Estrela do mês' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Ninguém ainda neste período.')).toHaveLength(2);
  });

  it('shows an error when the ranking cannot be loaded', async () => {
    renderPage({ 'GET /api/ranking?period=month&scope=all': { status: 500 } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o ranking.');
  });
});
