import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaylistSummaryDTO, ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { PlaylistsPage } from './PlaylistsPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const LIST_URL = '/api/profiles/p1/playlists';

function summary(id: string, name: string, count: number, coverUrls: string[] = []): PlaylistSummaryDTO {
  return { id, name, count, coverUrls };
}

function renderPage(routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/playlists']}>
        <Routes>
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:id" element={<p>Página da playlist</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

describe('PlaylistsPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows one card per playlist with its size, linking to the playlist', async () => {
    renderPage({
      [`GET ${LIST_URL}`]: {
        body: {
          items: [
            summary('pl1', 'Sertanejo raiz', 3, ['/media/a/capa.jpg']),
            summary('pl2', 'Festa', 1),
            summary('pl3', 'Vazia', 0),
          ],
        },
      },
    });

    expect(await screen.findByRole('link', { name: 'Sertanejo raiz' })).toHaveAttribute(
      'href',
      '/playlists/pl1',
    );
    expect(screen.getByRole('link', { name: 'Festa' })).toHaveAttribute('href', '/playlists/pl2');
    expect(screen.getByText('3 músicas')).toBeInTheDocument();
    expect(screen.getByText('1 música')).toBeInTheDocument();
    expect(screen.getByText('Vazia', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows the covers of the songs, or a colored cover when there are none', async () => {
    renderPage({
      [`GET ${LIST_URL}`]: {
        body: {
          items: [
            summary('pl1', 'Com capas', 2, ['/media/a/capa.jpg', '/media/b/capa.jpg']),
            summary('pl2', 'Sem capas', 0),
          ],
        },
      },
    });

    await screen.findByRole('link', { name: 'Com capas' });

    expect(document.querySelectorAll('img')).toHaveLength(2);
    expect(screen.getAllByTestId('playlist-cover-fallback')).toHaveLength(1);
  });

  it('invites the user to create the first playlist', async () => {
    renderPage({ [`GET ${LIST_URL}`]: { body: { items: [] } } });
    expect(await screen.findByText('Você ainda não tem playlists')).toBeInTheDocument();
  });

  it('shows an error when the playlists cannot be loaded', async () => {
    renderPage({ [`GET ${LIST_URL}`]: { status: 500 } });
    expect(await screen.findByText('Não foi possível carregar as playlists.')).toBeInTheDocument();
  });

  it('creates a playlist and opens it', async () => {
    const fetchMock = renderPage({
      [`GET ${LIST_URL}`]: { body: { items: [] } },
      [`POST ${LIST_URL}`]: { status: 201, body: summary('pl9', 'Nova', 0) },
    }).fetchMock;
    await screen.findByText('Você ainda não tem playlists');

    fireEvent.click(screen.getByRole('button', { name: 'Nova playlist' }));
    fireEvent.change(screen.getByLabelText('Nome da playlist'), { target: { value: ' Nova ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar playlist' }));

    expect(await screen.findByText('Página da playlist')).toBeInTheDocument();
    const [, init] = requestsTo(fetchMock, 'POST', LIST_URL)[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Nova' });
  });

  it('does not create a playlist without a name', async () => {
    const { fetchMock } = renderPage({ [`GET ${LIST_URL}`]: { body: { items: [] } } });
    await screen.findByText('Você ainda não tem playlists');

    fireEvent.click(screen.getByRole('button', { name: 'Nova playlist' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Criar playlist' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome da playlist');
    expect(requestsTo(fetchMock, 'POST', LIST_URL)).toHaveLength(0);
  });

  it('explains when the name is already used and stays on the form', async () => {
    renderPage({
      [`GET ${LIST_URL}`]: { body: { items: [summary('pl1', 'Festa', 0)] } },
      [`POST ${LIST_URL}`]: {
        status: 409,
        body: { error: { code: 'PLAYLIST_NAME_TAKEN', message: 'Você já tem uma playlist com esse nome' } },
      },
    });
    await screen.findByRole('link', { name: 'Festa' });

    fireEvent.click(screen.getByRole('button', { name: 'Nova playlist' }));
    fireEvent.change(screen.getByLabelText('Nome da playlist'), { target: { value: 'Festa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar playlist' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Você já tem uma playlist com esse nome'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Página da playlist')).not.toBeInTheDocument();
  });

  it('closes the form without creating anything', async () => {
    const { fetchMock } = renderPage({ [`GET ${LIST_URL}`]: { body: { items: [] } } });
    await screen.findByText('Você ainda não tem playlists');

    fireEvent.click(screen.getByRole('button', { name: 'Nova playlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', LIST_URL)).toHaveLength(0);
  });
});
