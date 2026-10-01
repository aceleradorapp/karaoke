import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@caraoke/shared';
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

describe('SettingsPage', () => {
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
});
