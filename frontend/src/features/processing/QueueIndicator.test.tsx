import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobDTO } from '@caraoke/shared';
import { buildJob } from '../../test/builders';
import { mockApi } from '../../test/mockApi';
import { QueueIndicator } from './QueueIndicator';

function renderIndicator(active: JobDTO[]) {
  mockApi({ 'GET /api/jobs?scope=active': { body: { items: active } } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QueueIndicator />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QueueIndicator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('links to the queue without a badge when nothing is waiting', async () => {
    renderIndicator([]);

    const link = await screen.findByRole('link', { name: 'Fila de processamento' });

    expect(link).toHaveAttribute('href', '/fila');
    expect(link).not.toHaveTextContent(/\d/);
  });

  it('shows how many songs are waiting', async () => {
    renderIndicator([buildJob(), buildJob()]);

    const link = await screen.findByRole('link', { name: 'Fila de processamento: 2 músicas' });

    expect(link).toHaveTextContent('2');
  });

  it('uses the singular for one song', async () => {
    renderIndicator([buildJob()]);
    expect(await screen.findByRole('link', { name: 'Fila de processamento: 1 música' })).toBeInTheDocument();
  });

  it('shows the progress of the song being processed', async () => {
    renderIndicator([buildJob({ status: 'RUNNING', progress: 40 }), buildJob()]);

    const ring = await screen.findByRole('progressbar', { name: 'Progresso da música em processamento' });

    expect(ring).toHaveAttribute('aria-valuenow', '40');
    expect(ring).toHaveTextContent('2');
  });
});
