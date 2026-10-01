import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeResponse, ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { mockApi, requestsTo } from '../../test/mockApi';
import { buildProcessingSong, buildSong } from '../../test/songBuilder';
import { HomePage } from './HomePage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

function renderHome(response: HomeResponse | { status: number }) {
  const route = 'status' in response ? response : { body: response };
  const fetchMock = mockApi({ 'GET /api/songs/home?profileId=p1': route });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('HomePage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the home of the selected profile', async () => {
    const fetchMock = renderHome({ hero: null, rows: [] });
    await screen.findByRole('region', { name: 'Biblioteca vazia' });
    expect(requestsTo(fetchMock, 'GET', '/api/songs/home?profileId=p1')).toHaveLength(1);
  });

  describe('with songs', () => {
    const hero = buildSong({
      id: 'hero1',
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      coverUrl: '/media/hero1/capa.jpg',
    });
    const response: HomeResponse = {
      hero,
      rows: [
        { id: 'recent', title: 'Adicionadas recentemente', items: [hero, buildSong({ title: 'Garçom' })] },
        { id: 'top', title: 'Mais cantadas da família', items: [buildSong({ title: 'Ai Se Eu Te Pego' })] },
      ],
    };

    it('features a song with big buttons to sing it or see its details', async () => {
      renderHome(response);

      const featured = await screen.findByRole('region', { name: 'Destaque' });

      expect(within(featured).getByRole('heading', { name: 'Evidências' })).toBeInTheDocument();
      expect(within(featured).getByText('Chitãozinho & Xororó')).toBeInTheDocument();
      expect(within(featured).getByRole('link', { name: 'Cantar' })).toHaveAttribute('href', '/player/hero1');
      expect(within(featured).getByRole('link', { name: 'Detalhes' })).toHaveAttribute(
        'href',
        '/musica/hero1',
      );
      expect(featured.querySelector('img')).toHaveAttribute('src', '/media/hero1/capa.jpg');
    });

    it('shows a gradient instead of a cover when the featured song has none', async () => {
      renderHome({ ...response, hero: buildSong({ id: 'bare', coverUrl: null }) });

      const featured = await screen.findByRole('region', { name: 'Destaque' });

      expect(featured.querySelector('img')).toBeNull();
      expect(featured.style.background).toContain('linear-gradient');
    });

    it('lists each row with its songs, in order', async () => {
      renderHome(response);

      await screen.findByRole('region', { name: 'Destaque' });
      const rows = screen
        .getAllByRole('region')
        .filter((region) => region.getAttribute('aria-label') !== 'Destaque');

      expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
        'Adicionadas recentemente',
        'Mais cantadas da família',
      ]);
      expect(within(rows[0] as HTMLElement).getAllByRole('article')).toHaveLength(2);
    });

    it('shows songs that are being processed so the user can follow them', async () => {
      renderHome({
        hero: null,
        rows: [
          {
            id: 'processing',
            title: 'Em processamento',
            items: [buildProcessingSong({ title: 'Quase pronta' })],
          },
        ],
      });

      const row = await screen.findByRole('region', { name: 'Em processamento' });

      expect(within(row).getByText('Separando a voz')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Biblioteca vazia' })).not.toBeInTheDocument();
    });
  });

  describe('without songs', () => {
    it('welcomes the user and points to the two ways of adding music', async () => {
      renderHome({ hero: null, rows: [] });

      const empty = await screen.findByRole('region', { name: 'Biblioteca vazia' });

      expect(within(empty).getByRole('link', { name: 'Buscar no YouTube' })).toHaveAttribute(
        'href',
        '/youtube',
      );
      expect(within(empty).getByRole('link', { name: 'Enviar arquivos' })).toHaveAttribute('href', '/enviar');
    });
  });

  it('shows a loading indicator while the library loads', () => {
    renderHome({ hero: null, rows: [] });
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
  });

  it('explains when the library cannot be loaded', async () => {
    renderHome({ status: 500 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a biblioteca');
  });
});
