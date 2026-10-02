import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import type { AppSettings, ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo } from '../../test/mockApi';
import { SettingsPage } from './SettingsPage';

const SETTINGS: AppSettings = {
  'processing.device': 'auto',
  'processing.demucsModel': 'htdemucs',
  'processing.whisperModel': 'small',
  'processing.autoAlign': true,
  'scoring.mode': 'pitch+audience',
  'scoring.audienceWeight': 0.2,
  'scoring.voteSeconds': 20,
  'scoring.micLatencyMs': 150,
  'scoring.micDeviceId': null,
  'ui.defaultTheme': 'cinema',
  'player.lyricsEffectEnabled': true,
  'player.lyricsEffect': 'smooth',
};

const WORKER = {
  online: true,
  device: 'cpu',
  gpuName: 'NVIDIA GeForce GT 1030',
  lastSeen: null,
  cudaAvailable: true,
  vramMb: 2047,
  ytdlpVersion: null,
};

function renderPage(routes: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    'GET /api/settings': { body: SETTINGS },
    'GET /api/system/info': { body: { worker: WORKER, storage: { usedBytes: 0, songs: 0 } } },
    ...routes,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
  return fetchMock;
}

function patchBodies(fetchMock: ReturnType<typeof mockApi>) {
  return requestsTo(fetchMock, 'PATCH', '/api/settings').map(([, init]) => JSON.parse(String(init?.body)));
}

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

describe('SettingsPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: null });
    useToastStore.setState({ toasts: [] });
    document.documentElement.dataset.theme = 'cinema';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the appearance and processing sections with the stored values', async () => {
    renderPage();

    expect(await screen.findByRole('region', { name: 'Aparência' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Processamento' })).toBeInTheDocument();
    expect(screen.getByLabelText('Dispositivo')).toHaveValue('auto');
    expect(screen.getByRole('switch', { name: /Sincronizar a letra/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Cinema/ })).toBeChecked();
  });

  it('explains what the automatic device does on this hardware', async () => {
    renderPage();
    expect(await screen.findByText(/a GPU tem pouca memória/)).toBeInTheDocument();
  });

  it('has no save button and saves a changed select right away', async () => {
    const fetchMock = renderPage({
      'PATCH /api/settings': { body: { ...SETTINGS, 'processing.device': 'cpu' } },
    });

    fireEvent.change(await screen.findByLabelText('Dispositivo'), { target: { value: 'cpu' } });

    expect(screen.queryByRole('button', { name: /^Salvar/ })).not.toBeInTheDocument();
    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toMatchObject({ 'processing.device': 'cpu' });
    expect(await screen.findByText('Salvo ✓')).toBeInTheDocument();
  });

  it('saves a toggle and a theme change', async () => {
    const fetchMock = renderPage({ 'PATCH /api/settings': { body: SETTINGS } });

    fireEvent.click(await screen.findByRole('switch', { name: /Sincronizar a letra/ }));
    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toMatchObject({ 'processing.autoAlign': false });

    fireEvent.click(screen.getByRole('radio', { name: /Neon/ }));
    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(2));
    expect(patchBodies(fetchMock)[1]).toMatchObject({ 'ui.defaultTheme': 'neon' });
  });

  it('offers a retry when saving fails', async () => {
    renderPage({
      'PATCH /api/settings': { status: 500, body: { error: { code: 'X', message: 'Falhou' } } },
    });

    fireEvent.click(await screen.findByRole('switch', { name: /Sincronizar a letra/ }));

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('shows an error when the settings cannot be loaded', async () => {
    renderPage({ 'GET /api/settings': { status: 500 } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as configurações');
  });

  describe('my theme', () => {
    it('is hidden when no profile is selected', async () => {
      renderPage();
      await screen.findByRole('region', { name: 'Aparência' });
      expect(screen.queryByRole('radiogroup', { name: 'Meu tema' })).not.toBeInTheDocument();
    });

    it('changes the screen immediately and then saves it on the profile', async () => {
      useProfileStore.setState({ currentProfile: ANA });
      const fetchMock = renderPage({
        'PATCH /api/profiles/p1': { body: { ...ANA, theme: 'neon' } },
      });

      const group = await screen.findByRole('radiogroup', { name: 'Meu tema' });
      fireEvent.click(within(group).getByRole('radio', { name: /Neon/ }));

      expect(document.documentElement.dataset.theme).toBe('neon');
      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/profiles/p1')).toHaveLength(1));
      expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/profiles/p1')[0]?.[1]?.body))).toEqual({
        theme: 'neon',
      });
      await waitFor(() => expect(useProfileStore.getState().currentProfile?.theme).toBe('neon'));
    });

    it('does not change the profile screens theme by itself', async () => {
      useProfileStore.setState({ currentProfile: ANA });
      const fetchMock = renderPage({
        'PATCH /api/profiles/p1': { body: { ...ANA, theme: 'neon' } },
      });

      const group = await screen.findByRole('radiogroup', { name: 'Meu tema' });
      fireEvent.click(within(group).getByRole('radio', { name: /Neon/ }));
      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/profiles/p1')).toHaveLength(1));

      expect(requestsTo(fetchMock, 'PATCH', '/api/settings')).toHaveLength(0);
    });
  });

  describe('yt-dlp update', () => {
    const withVersion = (version: string | null) => ({
      'GET /api/system/info': {
        body: { worker: { ...WORKER, ytdlpVersion: version }, storage: { usedBytes: 0, songs: 0 } },
      },
    });

    it('shows the version in use', async () => {
      renderPage(withVersion('2026.08.19'));
      expect(await screen.findByText('Versão em uso: 2026.08.19')).toBeInTheDocument();
    });

    it('says the version is unknown when the worker has not reported it', async () => {
      renderPage(withVersion(null));
      expect(await screen.findByText('Versão em uso: desconhecida')).toBeInTheDocument();
    });

    it('updates yt-dlp and announces the new version', async () => {
      const fetchMock = renderPage({
        ...withVersion('2026.08.19'),
        'POST /api/system/ytdlp/update': { body: { version: '2026.10.05' } },
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Atualizar yt-dlp' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/system/ytdlp/update')).toHaveLength(1));
      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]?.message).toBe(
          'yt-dlp atualizado para a versão 2026.10.05',
        ),
      );
    });

    it('shows a loading state while the update runs', async () => {
      let finishUpdate: (route: { body: unknown }) => void = () => undefined;
      renderPage({
        ...withVersion('2026.08.19'),
        'POST /api/system/ytdlp/update': () => new Promise((resolve) => (finishUpdate = resolve)),
      });

      const button = await screen.findByRole('button', { name: 'Atualizar yt-dlp' });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());

      finishUpdate({ body: { version: '2026.10.05' } });
      await waitFor(() => expect(button).toBeEnabled());
    });

    it('explains when the update fails', async () => {
      renderPage({
        ...withVersion('2026.08.19'),
        'POST /api/system/ytdlp/update': {
          status: 502,
          body: { error: { code: 'YTDLP_UPDATE_FAILED', message: 'Não foi possível atualizar o yt-dlp' } },
        },
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Atualizar yt-dlp' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]?.message).toBe('Não foi possível atualizar o yt-dlp'),
      );
    });
  });
});
