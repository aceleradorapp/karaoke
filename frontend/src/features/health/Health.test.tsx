import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthReport } from '@caraoke/shared';
import { useRestartStore } from '../../stores/useRestartStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { LyricsPreview } from '../songs/LyricsPreview';
import { HealthIndicator } from './HealthIndicator';
import { HealthPage } from './HealthPage';
import { RestartingOverlay } from './RestartingOverlay';

const socketMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    socket: {
      on(event: string, handler: Handler) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)?.add(handler);
      },
      off(event: string, handler: Handler) {
        handlers.get(event)?.delete(handler);
      },
    },
    emit(event: string) {
      for (const handler of handlers.get(event) ?? []) handler();
    },
  };
});

vi.mock('../../realtime/socket', () => ({ getSocket: () => socketMock.socket }));

function reportOf(overrides: Partial<HealthReport> = {}): HealthReport {
  return {
    status: 'warning',
    checkedAt: '2026-10-05T20:15:00.000Z',
    canRestart: false,
    mode: 'dev',
    checks: [
      {
        id: 'database',
        label: 'Banco de dados',
        status: 'ok',
        message: 'Respondendo normalmente.',
        hint: null,
      },
      {
        id: 'lyrics',
        label: 'Site das letras (LRCLIB)',
        status: 'warning',
        message: 'O site das letras não respondeu.',
        hint: 'Tente de novo mais tarde.',
      },
    ],
    ...overrides,
  };
}

function renderUi(ui: ReactElement, routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('system health', () => {
  beforeEach(() => {
    socketMock.handlers.clear();
    useRestartStore.setState({ isRestarting: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('lists the problems first, with what to do', async () => {
    renderUi(<HealthPage />, { 'GET /api/system/health-report': { body: reportOf() } });

    const rows = within(await screen.findByRole('list', { name: 'Verificações' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Site das letras (LRCLIB)');
    expect(rows[0]).toHaveTextContent('O que fazer: Tente de novo mais tarde.');
    expect(rows[1]).toHaveTextContent('Banco de dados');
    expect(screen.getByText('Funcionando, com avisos')).toBeInTheDocument();
  });

  it('checks again on request', async () => {
    const fetchMock = renderUi(<HealthPage />, {
      'GET /api/system/health-report': { body: reportOf() },
      'GET /api/system/health-report?fresh=1': { body: reportOf({ status: 'ok', checks: [] }) },
    });
    await screen.findByText('Funcionando, com avisos');

    fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));

    expect(await screen.findByText('Tudo funcionando')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'GET', '/api/system/health-report?fresh=1')).toHaveLength(1);
  });

  it('explains that restarting only works in party mode', async () => {
    renderUi(<HealthPage />, { 'GET /api/system/health-report': { body: reportOf() } });

    expect(await screen.findByRole('button', { name: 'Reiniciar o sistema' })).toBeDisabled();
    expect(screen.getByText(/Disponível só no modo festa/)).toBeInTheDocument();
  });

  it('restarts after confirming and shows that it is restarting', async () => {
    const fetchMock = renderUi(
      <>
        <HealthPage />
        <RestartingOverlay reload={() => undefined} />
      </>,
      {
        'GET /api/system/health-report': { body: reportOf({ canRestart: true, mode: 'festa' }) },
        'POST /api/system/restart': { status: 202, body: { restarting: true } },
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar o sistema' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reiniciar' }));

    expect(await screen.findByRole('alertdialog', { name: 'Reiniciando o sistema' })).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/api/system/restart')).toHaveLength(1);
  });

  it('covers every screen when the system announces a restart, and reloads when it is back', async () => {
    const reload = vi.fn();
    let isUp = false;
    renderUi(<RestartingOverlay reload={reload} />, {
      'GET /api/health': () => ({ status: isUp ? 200 : 503, body: { ok: true } }),
    });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => socketMock.emit('system:restarting'));
    expect(screen.getByText('Reiniciando o sistema…')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(reload).not.toHaveBeenCalled();

    isUp = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows a warning icon in the top bar only when something is wrong', async () => {
    renderUi(<HealthIndicator />, { 'GET /api/system/health-report': { body: reportOf() } });
    expect(await screen.findByRole('link', { name: 'Saúde do sistema: 1 aviso' })).toHaveAttribute(
      'href',
      '/saude',
    );
  });

  it('hides the icon when everything is fine', async () => {
    const fetchMock = renderUi(<HealthIndicator />, {
      'GET /api/system/health-report': { body: reportOf({ status: 'ok', checks: [] }) },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('tells why a song has no lyrics', () => {
    renderUi(<LyricsPreview url={null} notice="SITE_UNREACHABLE" />, {});
    expect(screen.getByRole('note')).toHaveTextContent('o site das letras não respondeu');
    expect(screen.getByRole('link', { name: 'Saúde do sistema' })).toHaveAttribute('href', '/saude');
  });

  it('says when the lyrics site does not have the song', () => {
    renderUi(<LyricsPreview url={null} notice="NOT_FOUND" />, {});
    expect(screen.getByText('O site das letras não tem a letra desta música.')).toBeInTheDocument();
  });
});
