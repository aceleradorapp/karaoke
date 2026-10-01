import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaylistDetailDTO, ProfileDTO, SongDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSong } from '../../test/songBuilder';
import { PlaylistPage } from './PlaylistPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function makeSongs(): SongDTO[] {
  return [
    buildSong({ id: 'a', title: 'Alpha', artist: 'Artista A', durationSec: 200 }),
    buildSong({ id: 'b', title: 'Bravo', artist: 'Artista B' }),
    buildSong({ id: 'c', title: 'Charlie', artist: 'Artista C' }),
  ];
}

interface World {
  playlist: PlaylistDetailDTO;
}

function routes(world: World, extra: MockRoutes = {}): MockRoutes {
  return {
    'GET /api/playlists/pl1': () => ({ body: world.playlist }),
    'PATCH /api/playlists/pl1': () => ({
      body: { id: 'pl1', name: world.playlist.name, count: world.playlist.items.length, coverUrls: [] },
    }),
    ...extra,
  };
}

function renderPage(world: World, extra: MockRoutes = {}) {
  const fetchMock = mockApi(routes(world, extra));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/playlists/pl1']}>
        <Routes>
          <Route path="/playlists/:id" element={<PlaylistPage />} />
          <Route path="/playlists" element={<p>Lista de playlists</p>} />
          <Route path="/player/:songId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, url: string, index = 0) =>
  JSON.parse(String(requestsTo(fetchMock, method, url)[index]?.[1]?.body));

const titlesInOrder = () =>
  within(screen.getByRole('list', { name: 'Músicas da playlist' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('PlaylistPage', () => {
  let world: World;

  beforeEach(() => {
    world = { playlist: { id: 'pl1', name: 'Sertanejo raiz', profileId: 'p1', items: makeSongs() } };
    useProfileStore.setState({ currentProfile: ANA });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('showing', () => {
    it('shows the name, the size and the songs in order', async () => {
      renderPage(world);

      expect(await screen.findByLabelText('Nome da playlist')).toHaveValue('Sertanejo raiz');
      expect(screen.getByText('3 músicas')).toBeInTheDocument();
      expect(titlesInOrder()).toEqual(['Alpha', 'Bravo', 'Charlie']);
      expect(screen.getByText('Artista A · 3:20')).toBeInTheDocument();
    });

    it('says when the playlist is empty and disables the play buttons', async () => {
      world.playlist.items = [];
      renderPage(world);

      expect(await screen.findByText('Esta playlist está vazia')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cantar tudo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Aleatório' })).toBeDisabled();
    });

    it('marks the songs that cannot be sung yet and offers no play button for them', async () => {
      world.playlist.items = [
        buildSong({ id: 'a', title: 'Alpha' }),
        buildProcessingSong({ id: 'p', title: 'Processando' }),
        buildSong({ id: 'e', title: 'Quebrada', status: 'ERROR' }),
      ];
      renderPage(world);

      await screen.findByText('Processando…');
      expect(screen.getByText('Falhou ao processar')).toBeInTheDocument();
      expect(screen.getByText('1 prontas para cantar', { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cantar Alpha' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cantar Processando' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cantar Quebrada' })).not.toBeInTheDocument();
    });

    it('says when the playlist does not exist', async () => {
      renderPage(world, {
        'GET /api/playlists/pl1': {
          status: 404,
          body: { error: { code: 'PLAYLIST_NOT_FOUND', message: 'x' } },
        },
      });
      expect(await screen.findByText('Playlist não encontrada')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar para as playlists' })).toHaveAttribute(
        'href',
        '/playlists',
      );
    });

    it('shows an error for other failures', async () => {
      renderPage(world, { 'GET /api/playlists/pl1': { status: 500 } });
      expect(await screen.findByText('Não foi possível carregar a playlist.')).toBeInTheDocument();
    });
  });

  describe('singing', () => {
    it('sings everything in order, starting from the first song that is ready', async () => {
      world.playlist.items = [buildSong({ id: 'x', title: 'Quebrada', status: 'ERROR' }), ...makeSongs()];
      renderPage(world);

      fireEvent.click(await screen.findByRole('button', { name: 'Cantar tudo' }));

      expect(await screen.findByTestId('location')).toHaveTextContent('/player/a?playlist=pl1');
      expect(screen.getByTestId('location').textContent).not.toContain('shuffle');
    });

    it('shuffles with a seed that the player can repeat', async () => {
      renderPage(world);

      fireEvent.click(await screen.findByRole('button', { name: 'Aleatório' }));

      const location = (await screen.findByTestId('location')).textContent ?? '';
      expect(location).toMatch(/^\/player\/[abc]\?playlist=pl1&shuffle=\d+$/);
    });

    it('sings one chosen song inside the playlist', async () => {
      renderPage(world);

      fireEvent.click(await screen.findByRole('button', { name: 'Cantar Bravo' }));

      expect(await screen.findByTestId('location')).toHaveTextContent('/player/b?playlist=pl1');
    });
  });

  describe('renaming', () => {
    it('saves the new name by itself', async () => {
      const { fetchMock } = renderPage(world);
      const input = await screen.findByLabelText('Nome da playlist');

      fireEvent.change(input, { target: { value: '  Festa de sábado ' } });

      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/playlists/pl1')).toHaveLength(1));
      expect(bodyOf(fetchMock, 'PATCH', '/api/playlists/pl1')).toEqual({ name: 'Festa de sábado' });
      expect(screen.queryByRole('button', { name: /Salvar/ })).not.toBeInTheDocument();
    });

    it('does not save an empty name and shows the problem', async () => {
      const { fetchMock } = renderPage(world);
      const input = await screen.findByLabelText('Nome da playlist');

      fireEvent.change(input, { target: { value: '   ' } });

      expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome da playlist');
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(requestsTo(fetchMock, 'PATCH', '/api/playlists/pl1')).toHaveLength(0);
    });

    it('explains when another playlist already has the name', async () => {
      renderPage(world, {
        'PATCH /api/playlists/pl1': {
          status: 409,
          body: { error: { code: 'PLAYLIST_NAME_TAKEN', message: 'Você já tem uma playlist com esse nome' } },
        },
      });
      const input = await screen.findByLabelText('Nome da playlist');

      fireEvent.change(input, { target: { value: 'Festa' } });

      expect(await screen.findByText('Você já tem uma playlist com esse nome')).toBeInTheDocument();
    });
  });

  describe('organizing', () => {
    it('moves a song down and saves the new order', async () => {
      const { fetchMock } = renderPage(world, {
        'PATCH /api/playlists/pl1/items/reorder': () => {
          const [alpha, bravo, charlie] = world.playlist.items as [SongDTO, SongDTO, SongDTO];
          world.playlist = { ...world.playlist, items: [bravo, alpha, charlie] };
          return { status: 204 };
        },
      });
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Mover Alpha para baixo' }));

      await waitFor(() => expect(titlesInOrder()).toEqual(['Bravo', 'Alpha', 'Charlie']));
      await waitFor(() =>
        expect(requestsTo(fetchMock, 'PATCH', '/api/playlists/pl1/items/reorder')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'PATCH', '/api/playlists/pl1/items/reorder')).toEqual({
        songIds: ['b', 'a', 'c'],
      });
    });

    it('moves a song up, and the first and last songs cannot go further', async () => {
      const { fetchMock } = renderPage(world, { 'PATCH /api/playlists/pl1/items/reorder': { status: 204 } });
      await screen.findByLabelText('Nome da playlist');

      expect(screen.getByRole('button', { name: 'Mover Alpha para cima' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Mover Charlie para baixo' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Mover Charlie para cima' }));

      await waitFor(() =>
        expect(bodyOf(fetchMock, 'PATCH', '/api/playlists/pl1/items/reorder')).toEqual({
          songIds: ['a', 'c', 'b'],
        }),
      );
    });

    it('puts the order back when the server refuses', async () => {
      renderPage(world, { 'PATCH /api/playlists/pl1/items/reorder': { status: 500 } });
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Mover Alpha para baixo' }));

      await waitFor(() => expect(titlesInOrder()).toEqual(['Alpha', 'Bravo', 'Charlie']));
    });

    it('asks before taking a song out, and does nothing when the user gives up', async () => {
      const { fetchMock } = renderPage(world);
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Tirar Bravo da playlist' }));
      const dialog = screen.getByRole('dialog', { name: 'Tirar da playlist' });
      expect(dialog).toHaveTextContent('Tirar “Bravo” desta playlist? A música continua na biblioteca.');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(requestsTo(fetchMock, 'DELETE', '/api/playlists/pl1/items/b')).toHaveLength(0);
      expect(titlesInOrder()).toContain('Bravo');
    });

    it('takes the song out after the confirmation', async () => {
      const { fetchMock } = renderPage(world, {
        'DELETE /api/playlists/pl1/items/b': () => {
          world.playlist = {
            ...world.playlist,
            items: world.playlist.items.filter((song) => song.id !== 'b'),
          };
          return { status: 204 };
        },
      });
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Tirar Bravo da playlist' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tirar' }));

      await waitFor(() => expect(titlesInOrder()).toEqual(['Alpha', 'Charlie']));
      expect(requestsTo(fetchMock, 'DELETE', '/api/playlists/pl1/items/b')).toHaveLength(1);
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        'Bravo saiu da playlist',
      );
    });

    it('warns and keeps the song when taking it out fails', async () => {
      renderPage(world, { 'DELETE /api/playlists/pl1/items/b': { status: 500 } });
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Tirar Bravo da playlist' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tirar' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'Não foi possível tirar a música da playlist',
        ),
      );
      expect(titlesInOrder()).toContain('Bravo');
    });
  });

  describe('deleting the playlist', () => {
    it('asks first and explains that the songs stay in the library', async () => {
      const { fetchMock } = renderPage(world);
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Excluir playlist' }));
      const dialog = screen.getByRole('dialog', { name: 'Excluir playlist' });
      expect(dialog).toHaveTextContent('As músicas continuam na biblioteca');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(requestsTo(fetchMock, 'DELETE', '/api/playlists/pl1')).toHaveLength(0);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('deletes after the confirmation and goes back to the list', async () => {
      const { fetchMock } = renderPage(world, { 'DELETE /api/playlists/pl1': { status: 204 } });
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Excluir playlist' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

      expect(await screen.findByText('Lista de playlists')).toBeInTheDocument();
      expect(requestsTo(fetchMock, 'DELETE', '/api/playlists/pl1')).toHaveLength(1);
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Playlist excluída');
    });

    it('stays on the page and warns when deleting fails', async () => {
      renderPage(world, { 'DELETE /api/playlists/pl1': { status: 500 } });
      await screen.findByLabelText('Nome da playlist');

      fireEvent.click(screen.getByRole('button', { name: 'Excluir playlist' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'Não foi possível excluir a playlist',
        ),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Nome da playlist')).toBeInTheDocument();
    });
  });
});
