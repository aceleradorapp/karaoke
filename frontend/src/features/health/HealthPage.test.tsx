import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPage } from './HealthPage';

interface MockRoute {
  status: number;
  body: unknown;
}

const ONLINE_WORKER = {
  online: true,
  device: 'cpu',
  gpuName: null,
  lastSeen: null,
  cudaAvailable: false,
  vramMb: null,
  ytdlpVersion: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HealthPage />
    </QueryClientProvider>,
  );
}

function mockApi(routes: Record<string, MockRoute>) {
  const fetchMock = vi.fn((url: string) => {
    const route = routes[url] ?? { status: 500, body: {} };
    return Promise.resolve(new Response(JSON.stringify(route.body), { status: route.status }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('HealthPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the server and the worker as online', async () => {
    mockApi({
      '/api/health': { status: 200, body: { ok: true, version: '0.1.0' } },
      '/api/system/info': {
        status: 200,
        body: { worker: ONLINE_WORKER, storage: { usedBytes: 0, songs: 0 } },
      },
    });
    renderPage();
    expect(await screen.findByText('Servidor online · v0.1.0')).toBeInTheDocument();
    expect(await screen.findByText('Worker online · CPU')).toBeInTheDocument();
  });

  it('shows the server as unavailable', async () => {
    mockApi({});
    renderPage();
    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
    expect(await screen.findByText('Worker offline')).toBeInTheDocument();
  });

  it('lists every theme as a button', () => {
    mockApi({});
    renderPage();
    expect(screen.getByRole('button', { name: 'Cinema' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retrô' })).toBeInTheDocument();
  });
});
