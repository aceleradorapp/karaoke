import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GuestDTO } from '@caraoke/shared';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { GuestsPage } from './GuestsPage';

const DAY_MS = 24 * 60 * 60 * 1000;

function guest(id: string, name: string, overrides: Partial<GuestDTO> = {}): GuestDTO {
  return {
    id,
    name,
    avatar: 'lion',
    theme: 'cinema',
    isGuest: true,
    createdAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
    lastUsedAt: new Date().toISOString(),
    lastSungAt: null,
    timesSung: 0,
    ...overrides,
  };
}

const TIO = guest('g1', 'Tio Beto', { lastSungAt: new Date(Date.now() - 2 * DAY_MS).toISOString(), timesSung: 4 });
const DUDA = guest('g2', 'Duda');
const CAIO = guest('g3', 'Caio', { lastSungAt: new Date(Date.now() - 45 * DAY_MS).toISOString(), timesSung: 1 });

function renderPage(routes: MockRoutes) {
  const fetchMock = mockApi({ 'GET /api/profiles/guests': { body: { items: [TIO, DUDA, CAIO] } }, ...routes });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GuestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const deletedIds = (fetchMock: ReturnType<typeof mockApi>) =>
  JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/profiles/guests/delete-many')[0]?.[1]?.body)).ids;

describe('GuestsPage', () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));
  afterEach(() => vi.unstubAllGlobals());

  it('lists the guests with when they last sang, and finds them by name', async () => {
    renderPage({});

    expect(await screen.findByText('cantou há 2 dias · 4 vezes')).toBeInTheDocument();
    expect(screen.getByText(/ainda não cantou · chegou há 60 dias/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar convidado' }), { target: { value: 'tio' } });
    const list = screen.getByRole('list', { name: 'Lista de convidados' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Tio Beto')).toBeInTheDocument();
  });

  it('selects several guests and deletes them after confirming', async () => {
    const fetchMock = renderPage({
      'POST /api/profiles/guests/delete-many': { body: { deleted: ['g1', 'g3'] } },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tio Beto' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Caio' }));
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Excluir' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Excluir 2 convidados (Tio Beto, Caio)?');
    expect(dialog).toHaveTextContent('saem do ranking');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/profiles/guests/delete-many')).toHaveLength(1));
    expect(deletedIds(fetchMock)).toEqual(['g1', 'g3']);
  });

  it('cleans the guests who have not sung for a month, showing who first', async () => {
    const fetchMock = renderPage({
      'GET /api/profiles/guests/stale?days=30': { body: { items: [DUDA, CAIO] } },
      'POST /api/profiles/guests/delete-many': { body: { deleted: ['g2', 'g3'] } },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Limpar antigos' }));
    const preview = await screen.findByRole('dialog');
    await waitFor(() => expect(preview).toHaveTextContent('2 convidados não canta(m) há mais de 30 dias: Duda, Caio.'));
    fireEvent.click(within(preview).getByRole('button', { name: 'Revisar e excluir' }));

    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent('Excluir 2 convidados (Duda, Caio)?');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deletedIds(fetchMock)).toEqual(['g2', 'g3']));
  });

  it('edits a guest on its own and can turn them into a profile of the house', async () => {
    const fetchMock = renderPage({
      'PATCH /api/profiles/g1': { body: { ...TIO, name: 'Tio Roberto' } },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Tio Beto' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar convidado' });
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Tio Roberto' } });

    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/profiles/g1')).toHaveLength(1), { timeout: 3000 });
    expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/profiles/g1')[0]?.[1]?.body))).toEqual({
      name: 'Tio Roberto',
      avatar: 'lion',
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tornar da casa' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/profiles/g1')).toHaveLength(2));
    expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/profiles/g1')[1]?.[1]?.body))).toEqual({
      isGuest: false,
    });
  });
});
