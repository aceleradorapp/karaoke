import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSingRequest, buildSong } from '../../test/songBuilder';
import { AddRequestModal } from './AddRequestModal';
import { NextSingerBanner } from './NextSingerBanner';
import { SingQueuePage } from './SingQueuePage';

function PlayerProbe() {
  const location = useLocation();
  return <p>Player {`${location.pathname}${location.search}`}</p>;
}

function renderAt(ui: ReactElement, routes: MockRoutes, path = '/proximos') {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/player/:songId" element={<PlayerProbe />} />
          <Route path="/proximos" element={<p>Página Próximos</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const ANA = { id: 'p1', name: 'Ana', avatar: 'lion', isGuest: false };
const BIA = { id: 'p2', name: 'Bia', avatar: 'cat', isGuest: false };

const queueOf = (...items: ReturnType<typeof buildSingRequest>[]): MockRoutes => ({
  'GET /api/sing-queue': { body: { items } },
});

describe('SingQueuePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const anaPreparing = () =>
    buildSingRequest({ id: 'r1', profile: ANA, song: buildProcessingSong({ id: 's1', title: 'Nova' }) });
  const biaReady = () =>
    buildSingRequest({ id: 'r2', profile: BIA, song: buildSong({ id: 's2', title: 'Evidências' }) });
  const carlaReady = () => buildSingRequest({ id: 'r3', song: buildSong({ id: 's3', title: 'Azul' }) });

  it('lists who sings next in order, saying which songs are still being prepared', async () => {
    renderAt(<SingQueuePage />, queueOf(anaPreparing(), biaReady()));

    const list = await screen.findByRole('list', { name: 'Fila de cantores' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^1.*Ana.*Nova.*preparando…/),
      expect.stringMatching(/^2.*Bia.*Evidências/),
    ]);
    expect(within(rows[0]!).getByRole('button', { name: 'Chamar Ana, Nova' })).toBeDisabled();
  });

  it('calls the first person whose song is ready', async () => {
    renderAt(<SingQueuePage />, queueOf(anaPreparing(), biaReady()));
    await screen.findByRole('list', { name: 'Fila de cantores' });

    fireEvent.click(screen.getByRole('button', { name: 'Chamar o próximo' }));

    expect(await screen.findByText('Player /player/s2?pedido=r2')).toBeInTheDocument();
  });

  it('calls a specific person', async () => {
    renderAt(<SingQueuePage />, queueOf(biaReady(), carlaReady()));

    fireEvent.click(await screen.findByRole('button', { name: 'Chamar Carla, Azul' }));

    expect(await screen.findByText('Player /player/s3?pedido=r3')).toBeInTheDocument();
  });

  it('cannot call anyone while no song is ready', async () => {
    renderAt(<SingQueuePage />, queueOf(anaPreparing()));
    await screen.findByRole('list', { name: 'Fila de cantores' });
    expect(screen.getByRole('button', { name: 'Chamar o próximo' })).toBeDisabled();
  });

  it('moves a person down right away and saves the new order', async () => {
    const fetchMock = renderAt(<SingQueuePage />, {
      ...queueOf(biaReady(), carlaReady()),
      'PUT /api/sing-queue/order': { body: { items: [carlaReady(), biaReady()] } },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Descer Bia, Evidências' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Fila de cantores' })).getAllByRole('listitem')[0],
      ).toHaveTextContent('Carla'),
    );
    await waitFor(() => expect(requestsTo(fetchMock, 'PUT', '/api/sing-queue/order')).toHaveLength(1));
    const [, init] = requestsTo(fetchMock, 'PUT', '/api/sing-queue/order')[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ['r3', 'r2'] });
  });

  it('does not move the first one up nor the last one down', async () => {
    renderAt(<SingQueuePage />, queueOf(biaReady(), carlaReady()));

    expect(await screen.findByRole('button', { name: 'Subir Bia, Evidências' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Carla, Azul' })).toBeDisabled();
  });

  it('takes a request out of the queue without asking', async () => {
    let isRemoved = false;
    const fetchMock = renderAt(<SingQueuePage />, {
      'GET /api/sing-queue': () => ({
        body: { items: isRemoved ? [carlaReady()] : [biaReady(), carlaReady()] },
      }),
      'DELETE /api/sing-queue/r2': () => {
        isRemoved = true;
        return { status: 204 };
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Tirar Bia, Evidências da fila' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/sing-queue/r2')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Bia')).not.toBeInTheDocument());
    expect(screen.getByText('Carla')).toBeInTheDocument();
  });

  it('explains how to ask for songs when nobody is in line', async () => {
    renderAt(<SingQueuePage />, queueOf());

    expect(await screen.findByText('Ninguém na fila.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar o QR code' })).toBeInTheDocument();
  });
});

describe('SingQueuePage v2', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SETTINGS = { 'queue.shuffle': false };
  const bia = () =>
    buildSingRequest({ id: 'r2', profile: BIA, song: buildSong({ id: 's2', title: 'Evidências' }) });
  const carla = () => buildSingRequest({ id: 'r3', song: buildSong({ id: 's3', title: 'Azul' }) });
  const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, url: string) =>
    JSON.parse(String(requestsTo(fetchMock, method, url)[0]?.[1]?.body));

  it('highlights and calls the next one chosen by the server', async () => {
    renderAt(<SingQueuePage />, {
      'GET /api/sing-queue': { body: { items: [bia(), carla()], nextId: 'r3' } },
      'GET /api/settings': { body: SETTINGS },
    });

    const rows = within(await screen.findByRole('list', { name: 'Fila de cantores' })).getAllByRole(
      'listitem',
    );
    expect(rows[1]).toHaveTextContent('Próximo');
    expect(rows[0]).not.toHaveTextContent('Próximo');

    fireEvent.click(screen.getByRole('button', { name: 'Chamar o próximo' }));
    expect(await screen.findByText('Player /player/s3?pedido=r3')).toBeInTheDocument();
  });

  it('turns the shuffle on and keeps it in the settings', async () => {
    const fetchMock = renderAt(<SingQueuePage />, {
      'GET /api/sing-queue': { body: { items: [bia()], nextId: 'r2' } },
      'GET /api/settings': { body: SETTINGS },
      'PATCH /api/settings': { body: { 'queue.shuffle': true } },
    });

    const toggle = await screen.findByRole('button', { name: 'Aleatório' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);

    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/settings')).toHaveLength(1));
    expect(bodyOf(fetchMock, 'PATCH', '/api/settings')).toEqual({ 'queue.shuffle': true });
  });

  it('has a handle to drag each person to a new place', async () => {
    renderAt(<SingQueuePage />, { ...queueOf(bia(), carla()), 'GET /api/settings': { body: SETTINGS } });

    expect(await screen.findByRole('button', { name: 'Arrastar Bia, Evidências' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrastar Carla, Azul' })).toBeInTheDocument();
  });

  it('puts someone in line from the TV, choosing the person and the song', async () => {
    const song = buildSong({ id: 's9', title: 'Flores', artist: 'Titãs' });
    const fetchMock = renderAt(<SingQueuePage />, {
      ...queueOf(),
      'GET /api/settings': { body: SETTINGS },
      'GET /api/profiles': { body: { items: [{ ...ANA, theme: 'cinema', createdAt: '', lastUsedAt: '' }] } },
      'GET /api/songs?sort=title': {
        body: { items: [song, buildSong({ title: 'Quebrada', status: 'ERROR' })], nextCursor: null },
      },
      'POST /api/sing-queue': { status: 201, body: buildSingRequest({ song }) },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pôr na fila de cantores' });
    expect(within(dialog).getByRole('button', { name: 'Pôr na fila' })).toBeDisabled();
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'Ana' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Flores/ }));
    expect(within(dialog).queryByText('Quebrada')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pôr na fila' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/sing-queue')).toHaveLength(1));
    expect(bodyOf(fetchMock, 'POST', '/api/sing-queue')).toEqual({ profileId: 'p1', songId: 's9' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates a guest inside the window and selects them', async () => {
    const created = {
      id: 'g7',
      name: 'Edu',
      avatar: 'lion',
      theme: 'cinema',
      isGuest: true,
      createdAt: '',
      lastUsedAt: '',
    };
    let profiles: unknown[] = [];
    renderAt(
      <AddRequestModal
        isOpen
        presetSong={buildSong({ id: 's1', title: 'Evidências' })}
        onClose={() => undefined}
      />,
      {
        'GET /api/profiles': () => ({ body: { items: profiles } }),
        'POST /api/profiles': () => {
          profiles = [created];
          return { status: 201, body: created };
        },
        'GET /api/songs?sort=title': { body: { items: [], nextCursor: null } },
      },
    );

    expect(await screen.findByText('Evidências')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\+ Convidado/ }));
    fireEvent.change(screen.getByLabelText('Nome do convidado'), { target: { value: 'Edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar convidado' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Edu' })).toBeChecked());
    expect(screen.getByRole('button', { name: 'Pôr na fila' })).toBeEnabled();
  });
});

describe('NextSingerBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invites the first person with a ready song and tells how many are waiting', async () => {
    renderAt(
      <NextSingerBanner />,
      queueOf(
        buildSingRequest({ id: 'r1', profile: ANA, song: buildProcessingSong({ title: 'Nova' }) }),
        buildSingRequest({ id: 'r2', profile: BIA, song: buildSong({ id: 's2', title: 'Evidências' }) }),
      ),
      '/',
    );

    expect(await screen.findByText('Vez de Bia!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'e mais 1 na fila' })).toHaveAttribute('href', '/proximos');
    expect(screen.getByRole('link', { name: 'Chamar' })).toHaveAttribute('href', '/player/s2?pedido=r2');
  });

  it('does not show up when nobody has a ready song', async () => {
    const fetchMock = renderAt(
      <NextSingerBanner />,
      queueOf(buildSingRequest({ song: buildProcessingSong() })),
      '/',
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Próximo a cantar' })).not.toBeInTheDocument();
  });
});
