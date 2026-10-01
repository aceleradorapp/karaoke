import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO, SongListResponse } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildSong } from '../../test/songBuilder';
import { LibraryPage } from './LibraryPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

function CurrentLocation() {
  const { search } = useLocation();
  return <p data-testid="search">{search}</p>;
}

function page(titles: string[], nextCursor: string | null = null): { body: SongListResponse } {
  return { body: { items: titles.map((title) => buildSong({ title })), nextCursor } };
}

function renderLibrary(routes: MockRoutes, path = '/biblioteca') {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LibraryPage />
        <CurrentLocation />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const urlSearch = () => screen.getByTestId('search').textContent;
const DEFAULT_URL = 'GET /api/songs?sort=recent&profileId=p1';

describe('LibraryPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the songs, newest first by default', async () => {
    renderLibrary({ [DEFAULT_URL]: page(['Evidências', 'Garçom']) });

    expect(await screen.findByRole('link', { name: 'Evidências' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Garçom' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('recent');
  });

  describe('search', () => {
    it('waits for the user to stop typing, then searches and remembers it in the address', async () => {
      const fetchMock = renderLibrary({
        [DEFAULT_URL]: page(['Evidências', 'Garçom']),
        'GET /api/songs?q=garcom&sort=recent&profileId=p1': page(['Garçom']),
      });
      await screen.findByRole('link', { name: 'Evidências' });

      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), {
        target: { value: 'garcom' },
      });
      expect(requestsTo(fetchMock, 'GET', '/api/songs?q=garcom&sort=recent&profileId=p1')).toHaveLength(0);

      expect(await screen.findByRole('link', { name: 'Garçom' })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('link', { name: 'Evidências' })).not.toBeInTheDocument());
      expect(urlSearch()).toBe('?q=garcom');
    });

    it('starts from the search in the address', async () => {
      renderLibrary(
        { 'GET /api/songs?q=evid&sort=recent&profileId=p1': page(['Evidências']) },
        '/biblioteca?q=evid',
      );

      expect(await screen.findByRole('link', { name: 'Evidências' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' })).toHaveValue('evid');
    });

    it('follows the address when the search changes from outside (the top bar)', async () => {
      const fetchMock = mockApi({
        [DEFAULT_URL]: page(['Evidências']),
        'GET /api/songs?q=rossi&sort=recent&profileId=p1': page(['Garçom']),
      });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function Harness() {
        return (
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/biblioteca']}>
              <LibraryPage />
              <NavigateButton to="/biblioteca?q=rossi" />
            </MemoryRouter>
          </QueryClientProvider>
        );
      }
      render(<Harness />);
      await screen.findByRole('link', { name: 'Evidências' });

      fireEvent.click(screen.getByRole('button', { name: 'ir' }));

      expect(await screen.findByRole('link', { name: 'Garçom' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' })).toHaveValue('rossi');
      expect(requestsTo(fetchMock, 'GET', '/api/songs?q=rossi&sort=recent&profileId=p1')).toHaveLength(1);
    });
  });

  describe('sorting and filtering', () => {
    it('sorts by the chosen order and keeps it in the address', async () => {
      renderLibrary({
        [DEFAULT_URL]: page(['B', 'A']),
        'GET /api/songs?sort=title&profileId=p1': page(['A', 'B']),
      });
      await screen.findByRole('link', { name: 'B' });

      fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'title' } });

      await waitFor(() => expect(screen.getAllByRole('article')[0]).toHaveTextContent('A'));
      expect(urlSearch()).toBe('?sort=title');
    });

    it('filters by situation', async () => {
      renderLibrary({
        [DEFAULT_URL]: page(['Pronta', 'Quebrada']),
        'GET /api/songs?status=ERROR&sort=recent&profileId=p1': page(['Quebrada']),
      });
      await screen.findByRole('link', { name: 'Pronta' });

      fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'ERROR' } });

      await waitFor(() => expect(screen.queryByRole('link', { name: 'Pronta' })).not.toBeInTheDocument());
      expect(urlSearch()).toBe('?status=ERROR');
    });

    it('ignores invalid values in the address', async () => {
      renderLibrary({ [DEFAULT_URL]: page(['Evidências']) }, '/biblioteca?sort=bogus&status=NOPE');
      expect(await screen.findByRole('link', { name: 'Evidências' })).toBeInTheDocument();
    });

    it('filters by artist and lets the user remove the filter', async () => {
      renderLibrary(
        {
          'GET /api/songs?artist=Reginaldo+Rossi&sort=recent&profileId=p1': page(['Garçom']),
          [DEFAULT_URL]: page(['Garçom', 'Evidências']),
        },
        '/biblioteca?artist=Reginaldo+Rossi',
      );
      await screen.findByRole('link', { name: 'Garçom' });
      expect(screen.queryByRole('link', { name: 'Evidências' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Remover filtro de artista Reginaldo Rossi' }));

      expect(await screen.findByRole('link', { name: 'Evidências' })).toBeInTheDocument();
      expect(urlSearch()).toBe('');
    });
  });

  describe('more songs', () => {
    it('loads the next page when asked', async () => {
      const fetchMock = renderLibrary({
        [DEFAULT_URL]: page(['Primeira'], 'cursor-1'),
        'GET /api/songs?sort=recent&profileId=p1&cursor=cursor-1': page(['Segunda']),
      });
      await screen.findByRole('link', { name: 'Primeira' });

      fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

      expect(await screen.findByRole('link', { name: 'Segunda' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Primeira' })).toBeInTheDocument();
      expect(
        requestsTo(fetchMock, 'GET', '/api/songs?sort=recent&profileId=p1&cursor=cursor-1'),
      ).toHaveLength(1);
    });

    it('has no load more button when everything was loaded', async () => {
      renderLibrary({ [DEFAULT_URL]: page(['Única']) });
      await screen.findByRole('link', { name: 'Única' });
      expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    });
  });

  describe('empty and error states', () => {
    it('invites the user to add songs when the library is empty', async () => {
      renderLibrary({ [DEFAULT_URL]: page([]) });

      expect(await screen.findByText('Nenhuma música na biblioteca ainda.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Buscar no YouTube' })).toHaveAttribute('href', '/youtube');
    });

    it('says nothing was found when a search has no results', async () => {
      renderLibrary({ 'GET /api/songs?q=zzz&sort=recent&profileId=p1': page([]) }, '/biblioteca?q=zzz');

      expect(await screen.findByText('Nenhuma música encontrada.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Buscar no YouTube' })).not.toBeInTheDocument();
    });

    it('explains when the songs cannot be loaded', async () => {
      renderLibrary({ [DEFAULT_URL]: { status: 500 } });
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as músicas');
    });
  });
});

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      ir
    </button>
  );
}
