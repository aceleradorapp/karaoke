import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProcessingWorkerDTO } from '@caraoke/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { WorkersSection } from './WorkersSection';

const LOCAL: ProcessingWorkerDTO = {
  id: 'local',
  name: 'Este PC',
  isLocal: true,
  online: true,
  device: 'cpu',
  gpuName: null,
  lastSeenAt: new Date().toISOString(),
  currentSongTitle: 'Evidências',
};
const NOTEBOOK: ProcessingWorkerDTO = {
  id: 'w1',
  name: 'Notebook GPU',
  isLocal: false,
  online: true,
  device: 'cuda',
  gpuName: 'NVIDIA RTX 3060',
  lastSeenAt: new Date().toISOString(),
  currentSongTitle: null,
};

function renderSection(routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkersSection />
    </QueryClientProvider>,
  );
  return { fetchMock, queryClient };
}

describe('WorkersSection', () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));
  afterEach(() => vi.unstubAllGlobals());

  it('lists this PC and the paired machines with what they are doing', async () => {
    renderSection({ 'GET /api/workers': { body: { items: [LOCAL, { ...NOTEBOOK, online: false }] } } });

    expect(await screen.findByText('Este PC')).toBeInTheDocument();
    expect(screen.getByText('Ligada · processador (CPU) · processando Evidências')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome da máquina Notebook GPU' })).toHaveValue('Notebook GPU');
    expect(screen.getByText(/Desligada · vista agora/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover Este PC' })).not.toBeInTheDocument();
  });

  it('shows the pairing code and closes it when the new machine shows up', async () => {
    let items = [LOCAL];
    const { queryClient } = renderSection({
      'GET /api/workers': () => ({ body: { items } }),
      'POST /api/workers/pairing': {
        status: 201,
        body: {
          code: '482913',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          serverUrls: ['http://192.168.0.10:3333'],
          downloadPath: '/downloads/Processador-do-Karaoke.zip',
        },
      },
    });
    await screen.findByText('Este PC');

    fireEvent.click(screen.getByRole('button', { name: 'Parear uma máquina' }));

    const panel = await screen.findByRole('region', { name: 'Parear uma máquina' });
    expect(within(panel).getByLabelText('Código de pareamento')).toHaveTextContent('482913');
    expect(within(panel).getByRole('link', { name: /192\.168\.0\.10:3333\/downloads/ })).toHaveAttribute(
      'href',
      'http://192.168.0.10:3333/downloads/Processador-do-Karaoke.zip',
    );

    items = [LOCAL, NOTEBOOK];
    await queryClient.invalidateQueries({ queryKey: ['workers'] });

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Parear uma máquina' })).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts[0]?.message).toContain('Máquina pareada');
  });

  it('renames a machine on its own and removes it after confirming', async () => {
    const { fetchMock } = renderSection({
      'GET /api/workers': { body: { items: [LOCAL, NOTEBOOK] } },
      'PATCH /api/workers/w1': { status: 204 },
      'DELETE /api/workers/w1': { status: 204 },
    });

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nome da máquina Notebook GPU' }), {
      target: { value: 'PC do quarto' },
    });
    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/workers/w1')).toHaveLength(1), { timeout: 3000 });
    expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/workers/w1')[0]?.[1]?.body))).toEqual({
      name: 'PC do quarto',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remover Notebook GPU' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/workers/w1')).toHaveLength(1));
  });
});
