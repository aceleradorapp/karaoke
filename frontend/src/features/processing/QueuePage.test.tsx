import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobDTO } from '@caraoke/shared';
import { useToastStore } from '../../stores/useToastStore';
import { buildJob, buildWorkerInfo } from '../../test/builders';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { QueuePage } from './QueuePage';

function renderQueue(active: JobDTO[], recent: JobDTO[] = [], extra: MockRoutes = {}) {
  const fetchMock = mockApi({
    'GET /api/jobs?scope=active': { body: { items: active } },
    'GET /api/jobs?scope=recent': { body: { items: recent } },
    'GET /api/system/info': { body: { worker: buildWorkerInfo(), storage: { usedBytes: 0, songs: 0 } } },
    'GET /api/jobs/estimate': { body: { secondsPerSongSecond: 1, basedOnJobs: 5, unknownDurationSec: 240 } },
    ...extra,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const confirmInDialog = (label: string) =>
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }));

const titlesInOrder = (section: string) =>
  within(screen.getByRole('region', { name: section }))
    .getAllByText(/^Música \d+$/)
    .map((element) => element.textContent);

const reorderBody = (fetchMock: ReturnType<typeof mockApi>) =>
  JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/jobs/reorder')[0]?.[1]?.body));

describe('QueuePage', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suggests how to add music when there is nothing in the queue', async () => {
    renderQueue([]);

    expect(await screen.findByText('Nada na fila por enquanto.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar no YouTube' })).toHaveAttribute('href', '/youtube');
    expect(screen.getByRole('link', { name: 'Enviar arquivos' })).toHaveAttribute('href', '/enviar');
  });

  it('shows the song being processed with its progress, message and device', async () => {
    const running = buildJob({
      status: 'RUNNING',
      step: 'SEPARATE',
      progress: 62,
      message: 'Separando voz (cpu)… 62%',
      device: 'cpu',
      song: { title: 'Evidências', artist: 'Chitãozinho & Xororó', coverUrl: null, durationSec: null },
    });
    renderQueue([running]);

    const section = await screen.findByRole('region', { name: 'Processando agora' });
    expect(within(section).getByText('Evidências')).toBeInTheDocument();
    expect(within(section).getByText(/Separando voz \(cpu\)… 62%/)).toBeInTheDocument();
    expect(within(section).getByRole('progressbar', { name: 'Processando Evidências' })).toHaveAttribute(
      'aria-valuenow',
      '62',
    );
  });

  it('estimates when each song will be ready', async () => {
    const running = buildJob({
      status: 'RUNNING',
      position: 1,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      song: { title: 'Evidências', artist: 'Chitãozinho & Xororó', coverUrl: null, durationSec: 300 },
    });
    const waiting = buildJob({
      status: 'PENDING',
      position: 2,
      song: { title: 'Flores', artist: 'Titãs', coverUrl: null, durationSec: 120 },
    });
    renderQueue([running, waiting]);

    expect(await screen.findByText('Faltam ~4 min')).toBeInTheDocument();
    expect(screen.getByText('Começa em ~4 min · pronta em ~6 min')).toBeInTheDocument();
    expect(screen.getByText(/Tudo pronto em ~6 min/)).toBeInTheDocument();
  });

  it('shows no estimate when it cannot be loaded', async () => {
    renderQueue([buildJob({ status: 'PENDING' })], [], { 'GET /api/jobs/estimate': { status: 500, body: {} } });
    await screen.findByRole('region', { name: 'Na fila' });
    expect(screen.queryByText(/Tudo pronto em/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Começa em/)).not.toBeInTheDocument();
  });

  it('lets each waiting song choose the machine that will process it', async () => {
    const waiting = buildJob({ id: 'j9', status: 'PENDING', targetWorkerId: 'w1', targetWorkerName: 'Notebook GPU' });
    const machine = (id: string, name: string, online: boolean) => ({
      id,
      name,
      isLocal: id === 'local',
      online,
      device: null,
      gpuName: null,
      lastSeenAt: null,
      currentSongTitle: null,
    });
    const fetchMock = renderQueue([waiting], [], {
      'GET /api/workers': { body: { items: [machine('local', 'Este PC', true), machine('w1', 'Notebook GPU', false)] } },
      'PATCH /api/jobs/j9/target': { status: 204 },
    });

    const picker = await screen.findByRole('combobox', { name: `Onde processar ${waiting.song.title}` });
    expect(picker).toHaveValue('w1');
    expect(screen.getByText('Notebook GPU está desligada: a música espera até ela ligar.')).toBeInTheDocument();

    fireEvent.change(picker, { target: { value: '' } });

    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/jobs/j9/target')).toHaveLength(1));
    expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/jobs/j9/target')[0]?.[1]?.body))).toEqual({
      targetWorkerId: null,
    });
  });

  it('does not offer a choice when this PC is the only machine', async () => {
    renderQueue([buildJob({ status: 'PENDING' })], [], {
      'GET /api/workers': {
        body: { items: [{ id: 'local', name: 'Este PC', isLocal: true, online: true, device: null, gpuName: null, lastSeenAt: null, currentSongTitle: null }] },
      },
    });
    await screen.findByRole('region', { name: 'Na fila' });
    expect(screen.queryByRole('combobox', { name: /Onde processar/ })).not.toBeInTheDocument();
  });

  it('falls back to the step name when the job has no message yet', async () => {
    renderQueue([buildJob({ status: 'RUNNING', step: 'LYRICS', message: null })]);
    expect(await screen.findByText('Buscando a letra')).toBeInTheDocument();
  });

  it('lists waiting songs and recently finished ones with readable statuses', async () => {
    const finishedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    renderQueue(
      [buildJob({ status: 'PENDING' })],
      [
        buildJob({ status: 'DONE', finishedAt }),
        buildJob({ status: 'FAILED', error: 'DownloadError: This video is not available', finishedAt }),
        buildJob({ status: 'CANCELED', finishedAt }),
      ],
    );

    expect(await screen.findByText('Aguardando')).toBeInTheDocument();
    expect(screen.getByText('Pronta · há 5 min')).toBeInTheDocument();
    expect(screen.getByText('Falhou: Vídeo indisponível no YouTube')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('shows which engine is processing and warns when the worker is offline', async () => {
    renderQueue([buildJob({ status: 'PENDING' })]);
    expect(await screen.findByText('Worker online · CPU')).toBeInTheDocument();
  });

  it('tells the user how to fix an offline worker', async () => {
    renderQueue([buildJob()], [], {
      'GET /api/system/info': {
        body: { worker: buildWorkerInfo({ online: false }), storage: { usedBytes: 0, songs: 0 } },
      },
    });
    expect(await screen.findByText(/Worker offline: confira se o terminal/)).toBeInTheDocument();
  });

  it('cancels a waiting song and a running one', async () => {
    const waiting = buildJob({ status: 'PENDING', song: { title: 'Espera', artist: 'A', coverUrl: null, durationSec: null } });
    const running = buildJob({ status: 'RUNNING', song: { title: 'Rodando', artist: 'A', coverUrl: null, durationSec: null } });
    const fetchMock = renderQueue([running, waiting], [], {
      [`POST /api/jobs/${waiting.id}/cancel`]: { status: 204 },
      [`POST /api/jobs/${running.id}/cancel`]: { status: 204 },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar Espera' }));
    confirmInDialog('Cancelar música');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Rodando' }));
    confirmInDialog('Cancelar música');

    await waitFor(() => {
      expect(requestsTo(fetchMock, 'POST', `/api/jobs/${waiting.id}/cancel`)).toHaveLength(1);
      expect(requestsTo(fetchMock, 'POST', `/api/jobs/${running.id}/cancel`)).toHaveLength(1);
    });
  });

  it('explains when a cancel is refused', async () => {
    const job = buildJob({ status: 'PENDING' });
    renderQueue([job], [], {
      [`POST /api/jobs/${job.id}/cancel`]: {
        status: 409,
        body: { error: { code: 'JOB_NOT_CANCELABLE', message: 'Esta música já terminou de ser processada' } },
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: /^Cancelar/ }));
    confirmInDialog('Cancelar música');

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.message).toBe('Esta música já terminou de ser processada'),
    );
  });

  it('retries failed and canceled songs, but not the ones that finished fine', async () => {
    const failed = buildJob({ status: 'FAILED', error: 'x', finishedAt: '2026-10-01T10:00:00.000Z' });
    const done = buildJob({ status: 'DONE', finishedAt: '2026-10-01T10:00:00.000Z' });
    const fetchMock = renderQueue([], [failed, done], {
      [`POST /api/jobs/${failed.id}/retry`]: { body: buildJob() },
    });

    expect(await screen.findAllByRole('button', { name: /^Tentar de novo/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Tentar de novo/ }));

    await waitFor(() =>
      expect(requestsTo(fetchMock, 'POST', `/api/jobs/${failed.id}/retry`)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.message).toBe('A música voltou para a fila'),
    );
  });

  it('removes a finished job from the list', async () => {
    const done = buildJob({ status: 'DONE', finishedAt: '2026-10-01T10:00:00.000Z' });
    const fetchMock = renderQueue([], [done], { [`DELETE /api/jobs/${done.id}`]: { status: 204 } });

    fireEvent.click(await screen.findByRole('button', { name: /^Remover/ }));
    confirmInDialog('Remover');

    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', `/api/jobs/${done.id}`)).toHaveLength(1));
  });

  describe('confirmations', () => {
    const finished = () =>
      buildJob({
        status: 'FAILED',
        error: 'x',
        finishedAt: '2026-10-01T10:00:00.000Z',
        song: { title: 'Evidências', artist: 'A', coverUrl: null, durationSec: null },
      });

    it('asks before removing a finished song from the list and says the song is kept', async () => {
      const job = finished();
      const fetchMock = renderQueue([], [job], { [`DELETE /api/jobs/${job.id}`]: { status: 204 } });

      fireEvent.click(await screen.findByRole('button', { name: /^Remover/ }));

      const dialog = await screen.findByRole('dialog', { name: 'Remover da lista' });
      expect(dialog).toHaveTextContent('Remover “Evidências” da lista de concluídas?');
      expect(dialog).toHaveTextContent('a música continua na biblioteca');
      expect(requestsTo(fetchMock, 'DELETE', `/api/jobs/${job.id}`)).toHaveLength(0);
    });

    it('does not remove anything when the user goes back', async () => {
      const job = finished();
      const fetchMock = renderQueue([], [job], { [`DELETE /api/jobs/${job.id}`]: { status: 204 } });
      fireEvent.click(await screen.findByRole('button', { name: /^Remover/ }));

      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Voltar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(requestsTo(fetchMock, 'DELETE', `/api/jobs/${job.id}`)).toHaveLength(0);
    });

    it('asks before canceling and warns that the processed work is lost', async () => {
      const running = buildJob({
        status: 'RUNNING',
        song: { title: 'Evidências', artist: 'A', coverUrl: null, durationSec: null },
      });
      const fetchMock = renderQueue([running], [], {
        [`POST /api/jobs/${running.id}/cancel`]: { status: 204 },
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar Evidências' }));

      const dialog = await screen.findByRole('dialog', { name: 'Cancelar processamento' });
      expect(dialog).toHaveTextContent('Cancelar “Evidências”?');
      expect(dialog).toHaveTextContent('você poderá tentar de novo');
      expect(requestsTo(fetchMock, 'POST', `/api/jobs/${running.id}/cancel`)).toHaveLength(0);
    });

    it('does not cancel when the dialog is dismissed with Escape', async () => {
      const running = buildJob({ status: 'RUNNING' });
      const fetchMock = renderQueue([running], [], {
        [`POST /api/jobs/${running.id}/cancel`]: { status: 204 },
      });
      fireEvent.click(await screen.findByRole('button', { name: /^Cancelar/ }));
      await screen.findByRole('dialog');

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(requestsTo(fetchMock, 'POST', `/api/jobs/${running.id}/cancel`)).toHaveLength(0);
    });

    it('closes the dialog after confirming', async () => {
      const job = finished();
      renderQueue([], [job], { [`DELETE /api/jobs/${job.id}`]: { status: 204 } });
      fireEvent.click(await screen.findByRole('button', { name: /^Remover/ }));

      confirmInDialog('Remover');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('reordering', () => {
    const three = () =>
      [1, 2, 3].map((index) =>
        buildJob({
          status: 'PENDING',
          position: index,
          song: { title: `Música ${index}`, artist: 'A', coverUrl: null, durationSec: null },
        }),
      );

    it('cannot move the first song up or the last one down', async () => {
      renderQueue(three());

      await screen.findByRole('region', { name: 'Na fila' });
      const list = screen.getByRole('region', { name: 'Na fila' });
      expect(within(list).getByRole('button', { name: 'Mover Música 1 para cima' })).toBeDisabled();
      expect(within(list).getByRole('button', { name: 'Mover Música 3 para baixo' })).toBeDisabled();
    });

    it('moves a song with the arrow buttons and tells the server the new order', async () => {
      const jobs = three();
      const fetchMock = renderQueue(jobs, [], { 'PATCH /api/jobs/reorder': { body: { ids: [] } } });

      fireEvent.click(await screen.findByRole('button', { name: 'Mover Música 1 para baixo' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/jobs/reorder')).toHaveLength(1));
      expect(reorderBody(fetchMock)).toEqual({ ids: [jobs[1]?.id, jobs[0]?.id, jobs[2]?.id] });
      expect(titlesInOrder('Na fila')).toEqual(['Música 2', 'Música 1', 'Música 3']);
    });

    it('reorders by dragging a song onto another position', async () => {
      const jobs = three();
      const fetchMock = renderQueue(jobs, [], { 'PATCH /api/jobs/reorder': { body: { ids: [] } } });
      await screen.findByRole('region', { name: 'Na fila' });
      const rows = within(screen.getByRole('region', { name: 'Na fila' })).getAllByRole('listitem');

      fireEvent.dragStart(rows[0] as HTMLElement, { dataTransfer: { effectAllowed: '' } });
      fireEvent.dragOver(rows[2] as HTMLElement);
      fireEvent.drop(rows[2] as HTMLElement);

      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/jobs/reorder')).toHaveLength(1));
      expect(reorderBody(fetchMock)).toEqual({ ids: [jobs[1]?.id, jobs[2]?.id, jobs[0]?.id] });
    });

    it('does nothing when a song is dropped on itself', async () => {
      const fetchMock = renderQueue(three());
      await screen.findByRole('region', { name: 'Na fila' });
      const rows = within(screen.getByRole('region', { name: 'Na fila' })).getAllByRole('listitem');

      fireEvent.dragStart(rows[1] as HTMLElement, { dataTransfer: { effectAllowed: '' } });
      fireEvent.drop(rows[1] as HTMLElement);

      expect(requestsTo(fetchMock, 'PATCH', '/api/jobs/reorder')).toHaveLength(0);
    });

    it('warns the user when the server refuses the new order', async () => {
      renderQueue(three(), [], {
        'PATCH /api/jobs/reorder': {
          status: 409,
          body: {
            error: { code: 'JOB_NOT_PENDING', message: 'Só é possível reordenar músicas que ainda aguardam' },
          },
        },
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Mover Música 1 para baixo' }));

      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]?.message).toBe(
          'Só é possível reordenar músicas que ainda aguardam',
        ),
      );
    });
  });

  it('shows an error when the queue cannot be loaded', async () => {
    renderQueue([], [], { 'GET /api/jobs?scope=active': { status: 500 } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a fila');
  });
});
