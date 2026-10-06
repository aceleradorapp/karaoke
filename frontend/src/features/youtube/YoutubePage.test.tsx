import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO, YoutubeSearchResult } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { YoutubePage } from './YoutubePage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

function buildVideo(overrides: Partial<YoutubeSearchResult> = {}): YoutubeSearchResult {
  return {
    youtubeId: 'abc12345678',
    title: 'Chitãozinho & Xororó - Evidências (Karaoke)',
    channel: 'Karaoke Brasil',
    durationSec: 298,
    thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
    suggested: { artist: 'Chitãozinho & Xororó', title: 'Evidências' },
    existingSongId: null,
    ...overrides,
  };
}

const SEARCH_URL = 'GET /api/youtube/search?q=evidencias';
const IMPORT_URL = 'POST /api/youtube/import';
const SONG_STUB = { id: 's1' };

function renderPage(routes: MockRoutes, path = '/youtube') {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <YoutubePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

async function searchFor(term: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no YouTube' }), { target: { value: term } });
  fireEvent.submit(screen.getByRole('search'));
}

const importDialog = () => screen.findByRole('dialog', { name: 'Confirmar música' });
const importBody = (fetchMock: ReturnType<typeof mockApi>) =>
  JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/youtube/import')[0]?.[1]?.body));

describe('YoutubePage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not search until the user asks for it', () => {
    const fetchMock = renderPage({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells if each result has lyrics before importing', async () => {
    const check = (artist: string, title: string, duration: number) =>
      `GET /api/lyrics/check?${new URLSearchParams({ artist, title, duration: String(duration) })}`;
    renderPage({
      [SEARCH_URL]: {
        body: {
          items: [
            buildVideo(),
            buildVideo({ youtubeId: 'def12345678', suggested: { artist: 'Banda', title: 'Rara' }, durationSec: 200 }),
            buildVideo({ youtubeId: 'ghi12345678', suggested: { artist: 'Coral', title: 'Hino' }, durationSec: 100 }),
            buildVideo({ youtubeId: 'jkl12345678', suggested: { artist: 'Off', title: 'Line' }, durationSec: 150 }),
          ],
        },
      },
      [check('Chitãozinho & Xororó', 'Evidências', 298)]: { body: { status: 'SYNCED' } },
      [check('Banda', 'Rara', 200)]: { body: { status: 'NONE' } },
      [check('Coral', 'Hino', 100)]: { body: { status: 'PLAIN' } },
      [check('Off', 'Line', 150)]: { body: { status: 'UNKNOWN' } },
    });

    await searchFor('evidencias');

    expect(await screen.findByText('Letra sincronizada')).toBeInTheDocument();
    expect(await screen.findByText('Sem letra')).toBeInTheDocument();
    expect(await screen.findByText('Só o texto da letra')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Verificando a letra…')).not.toBeInTheDocument());
  });

  it('searches and lists the results with channel and duration', async () => {
    renderPage({ [SEARCH_URL]: { body: { items: [buildVideo()] } } });

    await searchFor('evidencias');

    expect(await screen.findByText('Chitãozinho & Xororó - Evidências (Karaoke)')).toBeInTheDocument();
    expect(screen.getByText('Karaoke Brasil')).toBeInTheDocument();
    expect(screen.getByText('4:58')).toBeInTheDocument();
  });

  it('searches right away when the address already has a query', async () => {
    renderPage({ [SEARCH_URL]: { body: { items: [buildVideo()] } } }, '/youtube?q=evidencias');

    expect(await screen.findByText('Karaoke Brasil')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar no YouTube' })).toHaveValue('evidencias');
  });

  it('ignores an empty search', async () => {
    const fetchMock = renderPage({});
    await searchFor('   ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when nothing was found', async () => {
    renderPage({ [SEARCH_URL]: { body: { items: [] } } });
    await searchFor('evidencias');
    expect(await screen.findByText(/Nenhum resultado para “evidencias”/)).toBeInTheDocument();
  });

  it('shows the server message when the search fails', async () => {
    renderPage({
      [SEARCH_URL]: {
        status: 502,
        body: { error: { code: 'YOUTUBE_SEARCH_FAILED', message: 'Falha na busca do YouTube.' } },
      },
    });
    await searchFor('evidencias');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha na busca do YouTube.');
  });

  describe('preview', () => {
    it('plays the video in a privacy-friendly embed starting about 30% in', async () => {
      renderPage({ [SEARCH_URL]: { body: { items: [buildVideo()] } } });
      await searchFor('evidencias');

      fireEvent.click(await screen.findByRole('button', { name: /^Prévia de/ }));

      const frame = await screen.findByTitle(/Prévia: Chitãozinho/);
      expect(frame).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/abc12345678?autoplay=1&start=89&rel=0',
      );
    });

    it('offers to open the video on YouTube at the same point, in case the embed is refused', async () => {
      renderPage({ [SEARCH_URL]: { body: { items: [buildVideo()] } } });
      await searchFor('evidencias');

      fireEvent.click(await screen.findByRole('button', { name: /^Prévia de/ }));

      const link = await screen.findByRole('link', { name: 'Abrir no YouTube' });
      expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc12345678&t=89s');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('moves from the preview to the import dialog', async () => {
      renderPage({ [SEARCH_URL]: { body: { items: [buildVideo()] } } });
      await searchFor('evidencias');
      fireEvent.click(await screen.findByRole('button', { name: /^Prévia de/ }));

      const preview = await screen.findByRole('dialog', { name: 'Prévia' });
      fireEvent.click(within(preview).getByRole('button', { name: 'Importar' }));

      expect(await importDialog()).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Prévia' })).not.toBeInTheDocument();
    });

    it('does not offer to import something that is already in the library', async () => {
      renderPage({ [SEARCH_URL]: { body: { items: [buildVideo({ existingSongId: 'song-1' })] } } });
      await searchFor('evidencias');
      fireEvent.click(await screen.findByRole('button', { name: /^Prévia de/ }));

      const preview = await screen.findByRole('dialog', { name: 'Prévia' });

      expect(within(preview).queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
    });
  });

  describe('library state', () => {
    it('marks videos that are already in the library and hides their import button', async () => {
      renderPage({ [SEARCH_URL]: { body: { items: [buildVideo({ existingSongId: 'song-1' })] } } });
      await searchFor('evidencias');

      expect(await screen.findByText('Já na biblioteca')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Importar/ })).not.toBeInTheDocument();
    });
  });

  describe('import', () => {
    async function openImportDialog(video = buildVideo(), extraRoutes: MockRoutes = {}) {
      const fetchMock = renderPage({ [SEARCH_URL]: { body: { items: [video] } }, ...extraRoutes });
      await searchFor('evidencias');
      fireEvent.click(await screen.findByRole('button', { name: /^Importar/ }));
      await importDialog();
      return fetchMock;
    }

    it('opens a confirmation with the suggested artist and title', async () => {
      await openImportDialog();

      expect(screen.getByLabelText('Artista')).toHaveValue('Chitãozinho & Xororó');
      expect(screen.getByLabelText('Título')).toHaveValue('Evidências');
    });

    it('swaps artist and title with one click', async () => {
      await openImportDialog(
        buildVideo({ suggested: { artist: 'Evidências', title: 'Chitãozinho & Xororó' } }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Inverter artista e título' }));

      expect(screen.getByLabelText('Artista')).toHaveValue('Chitãozinho & Xororó');
      expect(screen.getByLabelText('Título')).toHaveValue('Evidências');
    });

    it('sends the confirmed data with the duration and who is importing, then marks it as queued', async () => {
      const fetchMock = await openImportDialog(buildVideo(), {
        [IMPORT_URL]: { status: 201, body: { song: SONG_STUB, alreadyExists: false } },
      });

      fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Evidências (ao vivo)' } });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Importar' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/youtube/import')).toHaveLength(1));
      expect(importBody(fetchMock)).toEqual({
        youtubeId: 'abc12345678',
        title: 'Evidências (ao vivo)',
        artist: 'Chitãozinho & Xororó',
        durationSec: 298,
        profileId: 'p1',
      });
      expect(await screen.findByText('Adicionada à fila')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Confirmar música' })).not.toBeInTheDocument();
      expect(useToastStore.getState().toasts[0]?.message).toBe('Adicionada à fila de processamento');
    });

    it('tells the user when the song was already imported', async () => {
      await openImportDialog(buildVideo(), {
        [IMPORT_URL]: { status: 200, body: { song: SONG_STUB, alreadyExists: true } },
      });

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Importar' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]?.message).toBe('Esta música já está na biblioteca'),
      );
    });

    it('requires an artist and a title before importing', async () => {
      const fetchMock = await openImportDialog(buildVideo({ suggested: { artist: '', title: '' } }));

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Importar' }));

      const alerts = await screen.findAllByRole('alert');
      expect(alerts.map((alert) => alert.textContent)).toEqual(['Informe o artista', 'Informe o título']);
      expect(requestsTo(fetchMock, 'POST', '/api/youtube/import')).toHaveLength(0);
    });

    it('keeps the dialog open and explains when the import fails', async () => {
      await openImportDialog(buildVideo(), {
        [IMPORT_URL]: {
          status: 400,
          body: { error: { code: 'VIDEO_TOO_LONG', message: 'O vídeo tem mais de 12 minutos' } },
        },
      });

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Importar' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]?.message).toBe('O vídeo tem mais de 12 minutos'),
      );
      expect(screen.getByRole('dialog', { name: 'Confirmar música' })).toBeInTheDocument();
    });

    it('can be canceled without importing anything', async () => {
      const fetchMock = await openImportDialog();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(requestsTo(fetchMock, 'POST', '/api/youtube/import')).toHaveLength(0);
    });

    it('imports without a profile when none is selected', async () => {
      useProfileStore.setState({ currentProfile: null });
      const fetchMock = await openImportDialog(buildVideo(), {
        [IMPORT_URL]: { status: 201, body: { song: SONG_STUB, alreadyExists: false } },
      });

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Importar' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/youtube/import')).toHaveLength(1));
      expect(importBody(fetchMock)).not.toHaveProperty('profileId');
    });
  });
});
