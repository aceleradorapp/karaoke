import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { renderWithQuery } from '../../test/renderWithQuery';
import { AccessQrModal } from './AccessQrModal';

const HOME_URL = 'http://192.168.98.10:5173/m?c=K7P2QX';
const CABLE_URL = 'http://10.0.0.5:5173/m?c=K7P2QX';

function show(routes: MockRoutes, onClose = vi.fn()) {
  const fetchMock = mockApi(routes);
  renderWithQuery(<AccessQrModal isOpen onClose={onClose} />);
  return { fetchMock, onClose };
}

const access = (urls: string[], code = 'K7P2QX') => ({ 'GET /api/system/access': { body: { code, urls } } });

describe('AccessQrModal', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the QR code on a white background, the address and the code', async () => {
    show(access([HOME_URL]));

    expect(await screen.findByText('K7P2QX')).toBeInTheDocument();
    const qr = screen.getByTestId('qr-code');
    expect(qr).toHaveClass('bg-white');
    expect(qr.querySelector('svg')).not.toBeNull();
    expect(screen.getByTitle(`Endereço para o celular: ${HOME_URL}`)).toBeInTheDocument();
    expect(screen.getByText(HOME_URL)).toBeInTheDocument();
    expect(screen.getByText(/mesmo Wi-Fi/)).toBeInTheDocument();
  });

  it('offers the other networks of the PC and switches the QR code', async () => {
    show(access([HOME_URL, CABLE_URL]));

    const select = await screen.findByLabelText('Outra rede');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['192.168.98.10', '10.0.0.5']);
    fireEvent.change(select, { target: { value: CABLE_URL } });

    expect(screen.getByText(CABLE_URL)).toBeInTheDocument();
  });

  it('does not offer other networks when there is only one', async () => {
    show(access([HOME_URL]));
    await screen.findByText('K7P2QX');
    expect(screen.queryByLabelText('Outra rede')).not.toBeInTheDocument();
  });

  it('explains when the PC is not on any network', async () => {
    show(access([]));
    expect(await screen.findByRole('alert')).toHaveTextContent('O PC não está conectado a uma rede');
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
  });

  it('asks before creating a new code, and does nothing when the user gives up', async () => {
    const { fetchMock } = show(access([HOME_URL]));

    fireEvent.click(await screen.findByRole('button', { name: /Gerar novo código/ }));
    expect(screen.getByText(/precisar escanear o QR code de novo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(requestsTo(fetchMock, 'POST', '/api/system/access/regenerate')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Gerar novo código/ })).toBeInTheDocument();
  });

  it('creates a new code after the confirmation and shows it', async () => {
    const { fetchMock } = show({
      ...access([HOME_URL]),
      'POST /api/system/access/regenerate': {
        body: { code: 'NEW234', urls: ['http://192.168.98.10:5173/m?c=NEW234'] },
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: /Gerar novo código/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, gerar código novo' }));

    expect(await screen.findByText('NEW234')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.98.10:5173/m?c=NEW234')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/api/system/access/regenerate')).toHaveLength(1);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
      'Código novo gerado. Os celulares precisam escanear de novo.',
    );
  });

  it('warns when the new code cannot be created', async () => {
    show({ ...access([HOME_URL]), 'POST /api/system/access/regenerate': { status: 500 } });

    fireEvent.click(await screen.findByRole('button', { name: /Gerar novo código/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, gerar código novo' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        'Não foi possível gerar um código novo',
      ),
    );
    expect(screen.getByText('K7P2QX')).toBeInTheDocument();
  });

  it('shows an error when the code cannot be loaded', async () => {
    show({ 'GET /api/system/access': { status: 500 } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar o QR code.');
  });

  it('closes with the button', async () => {
    const { onClose } = show(access([HOME_URL]));
    await screen.findByText('K7P2QX');

    const [headerClose, footerClose] = screen.getAllByRole('button', { name: 'Fechar' });
    fireEvent.click(footerClose as HTMLElement);
    expect(headerClose).toBeInTheDocument();

    expect(onClose).toHaveBeenCalled();
  });
});
