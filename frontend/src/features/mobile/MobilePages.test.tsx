import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO, YoutubeSearchResult } from '@caraoke/shared';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { buildJob } from '../../test/builders';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSingRequest, buildSong } from '../../test/songBuilder';
import { MobileQueuePage } from './MobileQueuePage';
import { MobileSearchPage } from './MobileSearchPage';
import { MobileSongsPage } from './MobileSongsPage';
import { MobileUploadPage } from './MobileUploadPage';
import { MobileWhoAmIPage } from './MobileWhoAmIPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const TIO: ProfileDTO = { ...ANA, id: 'g2', name: 'Tio Beto', avatar: 'robot', isGuest: true };
const CARLA = { id: 'g1', name: 'Carla', avatar: 'frog' };

const VIDEO: YoutubeSearchResult = {
  youtubeId: 'abc12345678',
  title: 'Chitãozinho & Xororó - Evidências (Karaoke)',
  channel: 'Karaoke Brasil',
  durationSec: 298,
  thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
  suggested: { artist: 'Chitãozinho & Xororó', title: 'Evidências' },
  existingSongId: null,
};

function renderOnPhone(ui: ReactElement, routes: MockRoutes, path: string) {
  window.history.pushState({}, '', path.split('?')[0] ?? '/');
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={ui} />
          {!path.startsWith('/m/musicas') && <Route path="/m/musicas" element={<p>Tela de músicas</p>} />}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, url: string) =>
  JSON.parse(String(requestsTo(fetchMock, method, url)[0]?.[1]?.body));

const toasts = () => useToastStore.getState().toasts.map((toast) => toast.message);

describe('phone pages', () => {
  beforeEach(() => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    useMobileProfileStore.setState({ profile: CARLA });
    useProfileStore.setState({ currentProfile: ANA });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  describe('who am I', () => {
    const PROFILES: MockRoutes = { 'GET /api/profiles': { body: { items: [ANA, TIO] } } };

    it('lists the family and the guests to choose from', async () => {
      renderOnPhone(<MobileWhoAmIPage />, PROFILES, '/m/quem-sou');

      const family = await screen.findByRole('region', { name: 'Família' });
      expect(within(family).getByRole('button', { name: /Ana/ })).toBeInTheDocument();
      expect(
        within(screen.getByRole('region', { name: 'Convidados' })).getByRole('button', { name: /Tio Beto/ }),
      ).toBeInTheDocument();
    });

    it('remembers the chosen profile and opens the songs', async () => {
      useMobileProfileStore.setState({ profile: null });
      renderOnPhone(<MobileWhoAmIPage />, PROFILES, '/m/quem-sou');

      fireEvent.click(await screen.findByRole('button', { name: /Tio Beto/ }));

      expect(await screen.findByText('Tela de músicas')).toBeInTheDocument();
      expect(useMobileProfileStore.getState().profile).toEqual({
        id: 'g2',
        name: 'Tio Beto',
        avatar: 'robot',
      });
    });

    it('creates a guest with the name and the avatar', async () => {
      useMobileProfileStore.setState({ profile: null });
      const created = { ...ANA, id: 'g9', name: 'Duda', avatar: 'cat', isGuest: true };
      const fetchMock = renderOnPhone(
        <MobileWhoAmIPage />,
        { ...PROFILES, 'POST /api/profiles': { status: 201, body: created } },
        '/m/quem-sou',
      );
      const form = await screen.findByRole('form', { name: 'Sou novo por aqui' });

      fireEvent.change(within(form).getByLabelText('Seu nome'), { target: { value: '  Duda ' } });
      fireEvent.click(within(form).getByRole('radio', { name: 'cat' }));
      fireEvent.click(within(form).getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByText('Tela de músicas')).toBeInTheDocument();
      expect(bodyOf(fetchMock, 'POST', '/api/profiles')).toEqual({ name: 'Duda', avatar: 'cat' });
      expect(useMobileProfileStore.getState().profile).toEqual({ id: 'g9', name: 'Duda', avatar: 'cat' });
    });

    it('asks for the name before creating', async () => {
      const fetchMock = renderOnPhone(<MobileWhoAmIPage />, PROFILES, '/m/quem-sou');
      const form = await screen.findByRole('form', { name: 'Sou novo por aqui' });

      fireEvent.click(within(form).getByRole('button', { name: 'Entrar' }));

      expect(await within(form).findByRole('alert')).toHaveTextContent('Digite o seu nome');
      expect(requestsTo(fetchMock, 'POST', '/api/profiles')).toHaveLength(0);
    });
  });

  describe('songs', () => {
    it('lists the library with covers for the phone, hiding songs that failed', async () => {
      renderOnPhone(
        <MobileSongsPage />,
        {
          'GET /api/songs?sort=title': {
            body: {
              items: [
                buildSong({ title: 'Evidências', coverUrl: '/media/s1/capa.jpg?v=1' }),
                buildProcessingSong({ title: 'Nova' }),
                buildSong({ title: 'Quebrada', status: 'ERROR' }),
              ],
              nextCursor: null,
            },
          },
          'GET /api/sing-queue': { body: { items: [] } },
        },
        '/m/musicas',
      );

      expect(await screen.findByText('Evidências')).toBeInTheDocument();
      expect(screen.getByText('preparando…')).toBeInTheDocument();
      expect(screen.queryByText('Quebrada')).not.toBeInTheDocument();
      expect(document.querySelector('img')).toHaveAttribute('src', '/media/s1/capa.jpg?v=1&c=K7P2QX');
    });

    it('searches the library', async () => {
      const fetchMock = renderOnPhone(
        <MobileSongsPage />,
        {
          'GET /api/songs?sort=title': { body: { items: [], nextCursor: null } },
          'GET /api/songs?q=evid&sort=title': {
            body: { items: [buildSong({ title: 'Evidências' })], nextCursor: null },
          },
          'GET /api/sing-queue': { body: { items: [] } },
        },
        '/m/musicas',
      );

      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), {
        target: { value: 'evid' },
      });

      expect(await screen.findByText('Evidências')).toBeInTheDocument();
      expect(requestsTo(fetchMock, 'GET', '/api/songs?q=evid&sort=title')).toHaveLength(1);
    });

    it('asks to sing a song as the person using the phone', async () => {
      const song = buildSong({ title: 'Evidências' });
      const fetchMock = renderOnPhone(
        <MobileSongsPage />,
        {
          'GET /api/songs?sort=title': { body: { items: [song], nextCursor: null } },
          'GET /api/sing-queue': { body: { items: [] } },
          'POST /api/sing-queue': { status: 201, body: buildSingRequest({ song }) },
        },
        '/m/musicas',
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Quero cantar Evidências, de Artista' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/sing-queue')).toHaveLength(1));
      expect(bodyOf(fetchMock, 'POST', '/api/sing-queue')).toEqual({ profileId: 'g1', songId: song.id });
      await waitFor(() => expect(toasts()).toContain('Você está na fila para cantar'));
    });

    it('shows the server message when the person already has too many songs', async () => {
      const song = buildSong({ title: 'Evidências' });
      renderOnPhone(
        <MobileSongsPage />,
        {
          'GET /api/songs?sort=title': { body: { items: [song], nextCursor: null } },
          'GET /api/sing-queue': { body: { items: [] } },
          'POST /api/sing-queue': {
            status: 409,
            body: { error: { code: 'TOO_MANY_REQUESTS', message: 'Você já tem 3 músicas na fila.' } },
          },
        },
        '/m/musicas',
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Quero cantar Evidências, de Artista' }));

      await waitFor(() => expect(toasts()).toContain('Você já tem 3 músicas na fila.'));
    });

    it('marks the songs already asked for and lets the person take them back', async () => {
      const song = buildSong({ title: 'Evidências' });
      const mine = buildSingRequest({ id: 'r1', song });
      const fetchMock = renderOnPhone(
        <MobileSongsPage />,
        {
          'GET /api/songs?sort=title': { body: { items: [song], nextCursor: null } },
          'GET /api/sing-queue': { body: { items: [mine] } },
          'DELETE /api/sing-queue/r1?profileId=g1': { status: 204 },
        },
        '/m/musicas',
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Tirar Evidências, de Artista da fila' }));

      await waitFor(() =>
        expect(requestsTo(fetchMock, 'DELETE', '/api/sing-queue/r1?profileId=g1')).toHaveLength(1),
      );
    });

    it('does not count someone else’s request as mine', async () => {
      const song = buildSong({ title: 'Evidências' });
      const theirs = buildSingRequest({
        song,
        profile: { id: 'p1', name: 'Ana', avatar: 'lion', isGuest: false },
      });
      renderOnPhone(
        <MobileSongsPage />,
        {
          'GET /api/songs?sort=title': { body: { items: [song], nextCursor: null } },
          'GET /api/sing-queue': { body: { items: [theirs] } },
        },
        '/m/musicas',
      );

      expect(
        await screen.findByRole('button', { name: 'Quero cantar Evidências, de Artista' }),
      ).toBeInTheDocument();
    });
  });

  describe('search', () => {
    const IMPORT_ROUTES: MockRoutes = {
      'GET /api/youtube/search?q=evidencias': { body: { items: [VIDEO] } },
      'POST /api/youtube/import': { status: 201, body: { song: { id: 's1' }, alreadyExists: false } },
      'POST /api/sing-queue': { status: 201, body: buildSingRequest() },
    };

    async function importFromPhone(routes: MockRoutes, keepWantsToSing = true) {
      const fetchMock = renderOnPhone(<MobileSearchPage />, routes, '/m/buscar?q=evidencias');
      fireEvent.click(await screen.findByRole('button', { name: `Importar ${VIDEO.title}` }));
      const dialog = await screen.findByRole('dialog');
      if (!keepWantsToSing)
        fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Quero cantar esta' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Importar' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/youtube/import')).toHaveLength(1));
      return fetchMock;
    }

    it('imports as the person using the phone and puts them in line to sing it', async () => {
      const fetchMock = await importFromPhone(IMPORT_ROUTES);

      const [, init] = requestsTo(fetchMock, 'POST', '/api/youtube/import')[0] ?? [];
      expect(JSON.parse(String(init?.body))).toMatchObject({ profileId: 'g1' });
      expect((init?.headers as Record<string, string>)['X-Access-Code']).toBe('K7P2QX');
      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/sing-queue')).toHaveLength(1));
      expect(bodyOf(fetchMock, 'POST', '/api/sing-queue')).toEqual({ profileId: 'g1', songId: 's1' });
    });

    it('only imports when the person does not want to sing it', async () => {
      const fetchMock = await importFromPhone(IMPORT_ROUTES, false);

      await waitFor(() => expect(toasts()).toContain('Adicionada à fila de processamento'));
      expect(requestsTo(fetchMock, 'POST', '/api/sing-queue')).toHaveLength(0);
    });

    it('keeps the import when the queue refuses the request', async () => {
      await importFromPhone({
        ...IMPORT_ROUTES,
        'POST /api/sing-queue': {
          status: 409,
          body: { error: { code: 'TOO_MANY_REQUESTS', message: 'Você já tem 3 músicas na fila.' } },
        },
      });

      await waitFor(() =>
        expect(toasts()).toEqual(['Adicionada à fila de processamento', 'Você já tem 3 músicas na fila.']),
      );
    });
  });

  describe('upload', () => {
    it('talks about the files of the phone and not about folders of the PC', () => {
      renderOnPhone(<MobileUploadPage />, {}, '/m/enviar');

      expect(screen.getByText('Escolha músicas guardadas no celular')).toBeInTheDocument();
      expect(screen.queryByText(/Arraste os arquivos/)).not.toBeInTheDocument();
      expect(screen.queryByText(/storage\/entrada\/upload/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Escolher arquivos' })).toBeInTheDocument();
    });
  });

  describe('queue', () => {
    const EMPTY_JOBS: MockRoutes = {
      'GET /api/jobs?scope=active': { body: { items: [] } },
      'GET /api/jobs?scope=recent': { body: { items: [] } },
    };

    it('shows who sings next, highlighting my requests, which I can take back', async () => {
      const mine = buildSingRequest({ id: 'r2', position: 2, song: buildProcessingSong({ title: 'Nova' }) });
      const theirs = buildSingRequest({
        id: 'r1',
        position: 1,
        profile: { id: 'p1', name: 'Ana', avatar: 'lion', isGuest: false },
        song: buildSong({ title: 'Evidências' }),
      });
      const fetchMock = renderOnPhone(
        <MobileQueuePage />,
        {
          ...EMPTY_JOBS,
          'GET /api/sing-queue': { body: { items: [theirs, mine] } },
          'DELETE /api/sing-queue/r2?profileId=g1': { status: 204 },
        },
        '/m/fila',
      );

      const singers = await screen.findByRole('region', { name: 'Próximos a cantar' });
      const rows = await within(singers).findAllByRole('listitem');
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Ana'),
        expect.stringContaining('Carla (você)'),
      ]);
      expect(within(rows[1]!).getByText('preparando…')).toBeInTheDocument();
      expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();

      fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Tirar Nova, de Artista da fila' }));
      await waitFor(() =>
        expect(requestsTo(fetchMock, 'DELETE', '/api/sing-queue/r2?profileId=g1')).toHaveLength(1),
      );
    });

    it('invites to choose a song when nobody is in line', async () => {
      renderOnPhone(
        <MobileQueuePage />,
        { ...EMPTY_JOBS, 'GET /api/sing-queue': { body: { items: [] } } },
        '/m/fila',
      );

      expect(await screen.findByText('Ninguém na fila para cantar.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Escolher uma música' })).toHaveAttribute('href', '/m/musicas');
    });

    it('shows what is being prepared and what finished a moment ago, read only', async () => {
      const running = buildJob({
        status: 'RUNNING',
        step: 'SEPARATE',
        progress: 40,
        song: { title: 'Evidências', artist: 'Chitãozinho & Xororó', coverUrl: '/media/s1/capa.jpg?v=1' },
      });
      const done = buildJob({
        status: 'DONE',
        finishedAt: '2026-10-02T10:00:00.000Z',
        song: { title: 'Flores', artist: 'Titãs', coverUrl: null },
      });
      renderOnPhone(
        <MobileQueuePage />,
        {
          'GET /api/jobs?scope=active': { body: { items: [running] } },
          'GET /api/jobs?scope=recent': { body: { items: [done] } },
          'GET /api/sing-queue': { body: { items: [] } },
        },
        '/m/fila',
      );

      const preparing = screen.getByRole('region', { name: 'Preparando' });
      expect(await within(preparing).findByText('Evidências')).toBeInTheDocument();
      expect(preparing.querySelector('img')).toHaveAttribute('src', '/media/s1/capa.jpg?v=1&c=K7P2QX');
      expect(
        within(await screen.findByRole('region', { name: 'Terminadas há pouco' })).getByText('Flores'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancelar|Mover|Tentar/ })).not.toBeInTheDocument();
    });

    it('invites to search when nothing is being prepared', async () => {
      renderOnPhone(
        <MobileQueuePage />,
        { ...EMPTY_JOBS, 'GET /api/sing-queue': { body: { items: [] } } },
        '/m/fila',
      );

      expect(await screen.findByText('Nenhuma música sendo preparada agora.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Buscar uma música' })).toHaveAttribute('href', '/m/buscar');
    });

    it('shows an error when the processing queue cannot be loaded', async () => {
      renderOnPhone(<MobileQueuePage />, { 'GET /api/jobs?scope=active': { status: 500 } }, '/m/fila');
      expect(await screen.findByText('Não foi possível carregar a fila.')).toBeInTheDocument();
    });
  });
});
