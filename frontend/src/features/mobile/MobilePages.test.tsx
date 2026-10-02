import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO, YoutubeSearchResult } from '@caraoke/shared';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { buildJob } from '../../test/builders';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { MobileQueuePage } from './MobileQueuePage';
import { MobileSearchPage } from './MobileSearchPage';
import { MobileUploadPage } from './MobileUploadPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

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
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('phone pages', () => {
  beforeEach(() => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  describe('search', () => {
    it('searches YouTube with the code and imports without a profile', async () => {
      const fetchMock = renderOnPhone(
        <MobileSearchPage />,
        {
          'GET /api/youtube/search?q=evidencias': { body: { items: [VIDEO] } },
          'POST /api/youtube/import': { status: 201, body: { song: { id: 's1' }, alreadyExists: false } },
        },
        '/m/buscar?q=evidencias',
      );

      fireEvent.click(await screen.findByRole('button', { name: `Importar ${VIDEO.title}` }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Importar' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/youtube/import')).toHaveLength(1));
      const [, init] = requestsTo(fetchMock, 'POST', '/api/youtube/import')[0] ?? [];
      expect(JSON.parse(String(init?.body))).not.toHaveProperty('profileId');
      expect((init?.headers as Record<string, string>)['X-Access-Code']).toBe('K7P2QX');
      expect(screen.getByRole('heading', { name: 'Buscar no YouTube' })).toBeInTheDocument();
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
    it('shows what is in the queue and what finished a moment ago, read only', async () => {
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
        },
        '/m/fila',
      );

      const queue = await screen.findByRole('region', { name: 'Na fila' });
      expect(within(queue).getByText('Evidências')).toBeInTheDocument();
      expect(queue.querySelector('img')).toHaveAttribute('src', '/media/s1/capa.jpg?v=1&c=K7P2QX');
      expect(
        within(await screen.findByRole('region', { name: 'Terminadas há pouco' })).getByText('Flores'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancelar|Mover|Tentar/ })).not.toBeInTheDocument();
    });

    it('invites to search when the queue is empty', async () => {
      renderOnPhone(
        <MobileQueuePage />,
        {
          'GET /api/jobs?scope=active': { body: { items: [] } },
          'GET /api/jobs?scope=recent': { body: { items: [] } },
        },
        '/m/fila',
      );

      expect(await screen.findByText('Nada na fila agora.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Buscar uma música' })).toHaveAttribute('href', '/m/buscar');
    });

    it('shows an error when the queue cannot be loaded', async () => {
      renderOnPhone(<MobileQueuePage />, { 'GET /api/jobs?scope=active': { status: 500 } }, '/m/fila');
      expect(await screen.findByText('Não foi possível carregar a fila.')).toBeInTheDocument();
    });
  });
});
