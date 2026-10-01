import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsDoc, ProfileDTO, SongDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSong } from '../../test/songBuilder';
import { SongDetailPage } from './SongDetailPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const LYRICS_URL = '/media/s1/letra.json?v=1';
const LYRICS: LyricsDoc = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 1, end: 3, text: 'E nessa loucura' },
    { start: 3, end: 6, text: 'De dizer que não te quero' },
  ],
};

function buildDetailedSong(overrides: Partial<SongDTO> = {}): SongDTO {
  return buildSong({
    id: 's1',
    title: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    durationSec: 298,
    source: 'YOUTUBE',
    lyricsSource: 'LRCLIB',
    lyricsUrl: LYRICS_URL,
    playCount: 3,
    ...overrides,
  });
}

function renderDetail(routes: MockRoutes, id = 's1') {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/musica/${id}`]}>
        <Routes>
          <Route path="/musica/:id" element={<SongDetailPage />} />
          <Route path="/biblioteca" element={<p>Tela da biblioteca</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const songRoute = (song: SongDTO) => ({ 'GET /api/songs/s1?profileId=p1': { body: song } });

describe('SongDetailPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('information', () => {
    it('shows the song with its facts in readable words', async () => {
      renderDetail({ ...songRoute(buildDetailedSong()), [`GET ${LYRICS_URL}`]: { body: LYRICS } });

      expect(await screen.findByRole('heading', { name: 'Evidências', level: 1 })).toBeInTheDocument();
      expect(screen.getByText('Chitãozinho & Xororó', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText('4:58')).toBeInTheDocument();
      expect(screen.getByText('YouTube')).toBeInTheDocument();
      expect(screen.getByText('Sincronizada (LRCLIB)')).toBeInTheDocument();
      expect(screen.getByText('Cantada 3 vezes')).toBeInTheDocument();
    });

    it.each([
      [0, 'Ainda não foi cantada'],
      [1, 'Cantada 1 vez'],
    ])('describes %s plays', async (playCount, expected) => {
      renderDetail({ ...songRoute(buildDetailedSong({ playCount, lyricsUrl: null })) });
      expect(await screen.findByText(expected)).toBeInTheDocument();
    });

    it('lets the user sing a song that is ready', async () => {
      renderDetail({ ...songRoute(buildDetailedSong({ lyricsUrl: null })) });
      expect(await screen.findByRole('link', { name: 'Cantar' })).toHaveAttribute('href', '/player/s1');
    });

    it('does not let the user sing a song that is still being processed', async () => {
      renderDetail({ ...songRoute(buildProcessingSong({ id: 's1' })) });

      expect(await screen.findByRole('link', { name: /Ainda não está pronta/ })).toHaveAttribute(
        'href',
        '/fila',
      );
      expect(screen.queryByRole('link', { name: 'Cantar' })).not.toBeInTheDocument();
    });
  });

  describe('lyrics preview', () => {
    it('shows every line of the lyrics', async () => {
      renderDetail({ ...songRoute(buildDetailedSong()), [`GET ${LYRICS_URL}`]: { body: LYRICS } });

      const lyrics = await screen.findByRole('list', { name: 'Letra' });

      expect(
        within(lyrics)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['E nessa loucura', 'De dizer que não te quero']);
    });

    it('says when the song has no lyrics', async () => {
      renderDetail({ ...songRoute(buildDetailedSong({ lyricsUrl: null, lyricsSource: 'NONE' })) });
      expect(await screen.findByText('Esta música ainda não tem letra.')).toBeInTheDocument();
    });

    it('says when the lyrics cannot be loaded', async () => {
      renderDetail({ ...songRoute(buildDetailedSong()), [`GET ${LYRICS_URL}`]: { status: 500 } });
      expect(await screen.findByText('Não foi possível carregar a letra.')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    const patchBodies = (fetchMock: ReturnType<typeof mockApi>) =>
      requestsTo(fetchMock, 'PATCH', '/api/songs/s1').map(([, init]) => JSON.parse(String(init?.body)));

    it('has no save button: changes are saved automatically', async () => {
      renderDetail({ ...songRoute(buildDetailedSong({ lyricsUrl: null })) });
      await screen.findByLabelText('Título');
      expect(screen.queryByRole('button', { name: /^Salvar/ })).not.toBeInTheDocument();
    });

    it('saves a corrected title and artist after the user stops typing', async () => {
      const fetchMock = renderDetail({
        ...songRoute(buildDetailedSong({ lyricsUrl: null })),
        'PATCH /api/songs/s1': { body: buildDetailedSong({ title: 'Evidências (ao vivo)' }) },
      });

      fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'Evidências (ao vivo)' } });
      expect(patchBodies(fetchMock)).toHaveLength(0);

      await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1), { timeout: 3000 });
      expect(patchBodies(fetchMock)[0]).toEqual({
        title: 'Evidências (ao vivo)',
        artist: 'Chitãozinho & Xororó',
      });
      expect(await screen.findByText('Salvo ✓')).toBeInTheDocument();
    });

    it('does not save an empty title or artist and shows the problem', async () => {
      const fetchMock = renderDetail({ ...songRoute(buildDetailedSong({ lyricsUrl: null })) });

      fireEvent.change(await screen.findByLabelText('Título'), { target: { value: '   ' } });
      fireEvent.change(screen.getByLabelText('Artista'), { target: { value: '' } });

      const alerts = await screen.findAllByRole('alert');
      expect(alerts.map((alert) => alert.textContent)).toEqual(['Informe o título', 'Informe o artista']);
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(patchBodies(fetchMock)).toHaveLength(0);
    });
  });

  describe('deleting', () => {
    const deleteRequests = (fetchMock: ReturnType<typeof mockApi>) =>
      requestsTo(fetchMock, 'DELETE', '/api/songs/s1');
    const openDialog = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Excluir música' }));
      return screen.findByRole('dialog', { name: 'Excluir música' });
    };

    it('asks for confirmation and explains what will be lost', async () => {
      const fetchMock = renderDetail({ ...songRoute(buildDetailedSong({ lyricsUrl: null })) });

      const dialog = await openDialog();

      expect(dialog).toHaveTextContent('Excluir “Evidências”?');
      expect(dialog).toHaveTextContent('Não dá para desfazer');
      expect(deleteRequests(fetchMock)).toHaveLength(0);
    });

    it('does nothing when the user goes back', async () => {
      const fetchMock = renderDetail({ ...songRoute(buildDetailedSong({ lyricsUrl: null })) });
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deleteRequests(fetchMock)).toHaveLength(0);
    });

    it('deletes the song and returns to the library', async () => {
      const fetchMock = renderDetail({
        ...songRoute(buildDetailedSong({ lyricsUrl: null })),
        'DELETE /api/songs/s1': { status: 204 },
      });
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

      expect(await screen.findByText('Tela da biblioteca')).toBeInTheDocument();
      expect(deleteRequests(fetchMock)).toHaveLength(1);
      expect(useToastStore.getState().toasts[0]?.message).toBe('Música excluída');
    });

    it('explains why a song cannot be deleted and stays on the page', async () => {
      renderDetail({
        ...songRoute(buildDetailedSong({ lyricsUrl: null })),
        'DELETE /api/songs/s1': {
          status: 409,
          body: {
            error: {
              code: 'SONG_BEING_PROCESSED',
              message: 'Cancele o processamento antes de excluir a música',
            },
          },
        },
      });
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]?.message).toBe(
          'Cancele o processamento antes de excluir a música',
        ),
      );
      expect(screen.getByRole('heading', { name: 'Evidências', level: 1 })).toBeInTheDocument();
    });
  });

  describe('problems loading', () => {
    it('says the song was not found and offers the library', async () => {
      renderDetail({
        'GET /api/songs/s1?profileId=p1': {
          status: 404,
          body: { error: { code: 'SONG_NOT_FOUND', message: 'x' } },
        },
      });

      expect(await screen.findByRole('heading', { name: 'Música não encontrada' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar para a biblioteca' })).toHaveAttribute(
        'href',
        '/biblioteca',
      );
    });

    it('shows a generic error for other failures', async () => {
      renderDetail({ 'GET /api/songs/s1?profileId=p1': { status: 500 } });
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a música');
    });
  });
});
