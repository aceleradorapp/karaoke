import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';
import { mockApi, type MockRoutes } from '../../test/mockApi';
import { MobileEntry } from './MobileEntry';
import { MobileLayout, useMobileAccessEvents } from './MobileLayout';

vi.mock('../../realtime/socket', () => ({ reconnectSocket: vi.fn(), getSocket: () => fakeSocket }));

type Handler = (...args: unknown[]) => void;
const fakeSocket = {
  handlers: new Map<string, Handler>(),
  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
  },
  off(event: string) {
    this.handlers.delete(event);
  },
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  },
};

function renderAt(path: string, routes: MockRoutes = {}) {
  window.history.pushState({}, '', path.split('?')[0] ?? '/');
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m" element={<MobileEntry />} />
          <Route element={<MobileLayout />}>
            <Route path="/m/buscar" element={<p>Tela de busca</p>} />
            <Route path="/m/fila" element={<p>Tela da fila</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

const CHECK_OK: MockRoutes = { 'GET /api/system/access/check': { body: { ok: true } } };
const CHECK_DENIED: MockRoutes = {
  'GET /api/system/access/check': {
    status: 401,
    body: { error: { code: 'ACCESS_DENIED', message: 'Código de acesso inválido.' } },
  },
};

describe('MobileEntry', () => {
  beforeEach(() => {
    useMobileAccessStore.setState({ code: null, status: 'unknown' });
    fakeSocket.handlers.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('saves the code of the QR code, checks it and opens the search', async () => {
    const { fetchMock } = renderAt('/m?c=k7p2qx', CHECK_OK);

    expect(await screen.findByText('Tela de busca')).toBeInTheDocument();
    expect(useMobileAccessStore.getState()).toMatchObject({ code: 'K7P2QX', status: 'ok' });
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init as RequestInit).headers).toHaveProperty('X-Access-Code', 'K7P2QX');
  });

  it('shows a waiting message while checking', () => {
    renderAt('/m?c=K7P2QX', { 'GET /api/system/access/check': () => new Promise(() => undefined) });
    expect(screen.getByText('Conectando ao karaokê…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('asks to scan again when the code is wrong', async () => {
    renderAt('/m?c=ZZZ999', CHECK_DENIED);

    expect(await screen.findByText('Código inválido')).toBeInTheDocument();
    expect(screen.getByText('Escaneie o QR code na TV de novo.')).toBeInTheDocument();
    expect(useMobileAccessStore.getState().status).toBe('denied');
  });

  it('uses the code saved before when the address has none', async () => {
    useMobileAccessStore.setState({ code: 'K7P2QX' });
    const { fetchMock } = renderAt('/m', CHECK_OK);

    expect(await screen.findByText('Tela de busca')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks to scan the QR code when there is no code at all', async () => {
    const { fetchMock } = renderAt('/m');

    expect(await screen.findByText('Escaneie o QR code')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains when the PC cannot be reached', async () => {
    renderAt('/m?c=K7P2QX', { 'GET /api/system/access/check': { status: 502 } });

    expect(await screen.findByText('Não foi possível conectar')).toBeInTheDocument();
    expect(screen.getByText(/mesmo Wi-Fi/)).toBeInTheDocument();
    expect(useMobileAccessStore.getState().status).not.toBe('denied');
  });
});

describe('MobileLayout', () => {
  beforeEach(() => {
    fakeSocket.handlers.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('shows the page with the three tabs at the bottom', () => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    renderAt('/m/fila');

    expect(screen.getByText('Tela da fila')).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Seções do celular' });
    expect(tabs.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Fila' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/m/buscar');
    expect(screen.getByRole('link', { name: 'Enviar' })).toHaveAttribute('href', '/m/enviar');
  });

  it('sends a phone without a code to the scan screen', async () => {
    useMobileAccessStore.setState({ code: null, status: 'unknown' });
    renderAt('/m/buscar');
    expect(await screen.findByText('Escaneie o QR code')).toBeInTheDocument();
  });

  it('asks to scan again when the code was refused', () => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'denied' });
    renderAt('/m/buscar');
    expect(screen.getByText('Escaneie o QR code de novo')).toBeInTheDocument();
    expect(screen.queryByText('Tela de busca')).not.toBeInTheDocument();
  });

  it('asks to scan again as soon as the TV creates a new code', () => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    renderAt('/m/buscar');

    act(() => fakeSocket.emit('access:changed'));

    expect(screen.getByText('Escaneie o QR code de novo')).toBeInTheDocument();
  });

  it('asks to scan again when the live connection is refused, and ignores other connection errors', () => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    renderAt('/m/buscar');

    act(() => fakeSocket.emit('connect_error', new Error('xhr poll error')));
    expect(screen.getByText('Tela de busca')).toBeInTheDocument();

    act(() => fakeSocket.emit('connect_error', new Error('ACCESS_DENIED')));
    expect(screen.getByText('Escaneie o QR code de novo')).toBeInTheDocument();
  });

  it('stops listening when it leaves the screen', () => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
    const socket = { on: vi.fn(), off: vi.fn() };
    function Probe() {
      useMobileAccessEvents(socket as never);
      return null;
    }
    const view = render(<Probe />);
    view.unmount();
    expect(socket.off).toHaveBeenCalledWith('access:changed', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });
});
