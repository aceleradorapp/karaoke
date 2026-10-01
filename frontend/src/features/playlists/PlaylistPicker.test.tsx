import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaylistSummaryDTO, ProfileDTO } from '@caraoke/shared';
import { usePlaylistPickerStore } from '../../stores/usePlaylistPickerStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { renderWithQuery } from '../../test/renderWithQuery';
import { PlaylistPicker } from './PlaylistPicker';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const SONG = { id: 's1', title: 'Evidências' };
const LIST_URL = '/api/profiles/p1/playlists?songId=s1';

interface World {
  playlists: PlaylistSummaryDTO[];
}

function playlist(id: string, name: string, count: number, containsSong: boolean): PlaylistSummaryDTO {
  return { id, name, count, coverUrls: [], containsSong };
}

function routes(world: World, extra: MockRoutes = {}): MockRoutes {
  return {
    [`GET ${LIST_URL}`]: () => ({ body: { items: world.playlists } }),
    ...extra,
  };
}

const toasts = () => useToastStore.getState().toasts.map((toast) => toast.message);

function openPicker() {
  act(() => usePlaylistPickerStore.getState().open(SONG));
}

describe('PlaylistPicker', () => {
  let world: World;

  beforeEach(() => {
    world = {
      playlists: [playlist('pl1', 'Sertanejo raiz', 3, true), playlist('pl2', 'Festa de sábado', 1, false)],
    };
    useProfileStore.setState({ currentProfile: ANA });
    useToastStore.setState({ toasts: [] });
    usePlaylistPickerStore.setState({ song: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows nothing until a song is chosen', () => {
    const fetchMock = mockApi(routes(world));
    renderWithQuery(<PlaylistPicker />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the playlists of the profile, checking the ones that already have the song', async () => {
    mockApi(routes(world));
    renderWithQuery(<PlaylistPicker />);

    openPicker();

    expect(await screen.findByRole('checkbox', { name: /Sertanejo raiz/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Festa de sábado/ })).not.toBeChecked();
    expect(screen.getByText('3 músicas')).toBeInTheDocument();
    expect(screen.getByText('1 música')).toBeInTheDocument();
    expect(screen.getByText('Evidências', { selector: 'strong' })).toBeInTheDocument();
  });

  it('invites the user to create the first playlist', async () => {
    world.playlists = [];
    mockApi(routes(world));
    renderWithQuery(<PlaylistPicker />);

    openPicker();

    expect(await screen.findByText(/ainda não tem playlists/)).toBeInTheDocument();
  });

  it('adds the song when a playlist is checked, right away, and says so', async () => {
    const fetchMock = mockApi(
      routes(world, {
        'POST /api/playlists/pl2/items': () => {
          world.playlists = [
            playlist('pl1', 'Sertanejo raiz', 3, true),
            playlist('pl2', 'Festa de sábado', 2, true),
          ];
          return { status: 204 };
        },
      }),
    );
    renderWithQuery(<PlaylistPicker />);
    openPicker();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Festa de sábado/ }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Festa de sábado/ })).toBeChecked());
    expect(screen.getByText('2 músicas')).toBeInTheDocument();
    await waitFor(() => expect(toasts()).toContain('Adicionada a Festa de sábado'));
    const [, init] = requestsTo(fetchMock, 'POST', '/api/playlists/pl2/items')[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ songId: 's1' });
  });

  it('removes the song when a checked playlist is unchecked', async () => {
    const fetchMock = mockApi(
      routes(world, {
        'DELETE /api/playlists/pl1/items/s1': () => {
          world.playlists = [
            playlist('pl1', 'Sertanejo raiz', 2, false),
            playlist('pl2', 'Festa de sábado', 1, false),
          ];
          return { status: 204 };
        },
      }),
    );
    renderWithQuery(<PlaylistPicker />);
    openPicker();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Sertanejo raiz/ }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Sertanejo raiz/ })).not.toBeChecked());
    await waitFor(() => expect(toasts()).toContain('Removida de Sertanejo raiz'));
    expect(requestsTo(fetchMock, 'DELETE', '/api/playlists/pl1/items/s1')).toHaveLength(1);
  });

  it('undoes the check and warns when the server fails', async () => {
    mockApi(routes(world, { 'POST /api/playlists/pl2/items': { status: 500 } }));
    renderWithQuery(<PlaylistPicker />);
    openPicker();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Festa de sábado/ }));

    await waitFor(() => expect(toasts()).toContain('Não foi possível atualizar a playlist'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Festa de sábado/ })).not.toBeChecked());
  });

  it('creates a playlist and already puts the song in it', async () => {
    const fetchMock = mockApi(
      routes(world, {
        'POST /api/profiles/p1/playlists': () => {
          world.playlists = [...world.playlists, playlist('pl3', 'Para treinar', 0, false)];
          return { status: 201, body: { id: 'pl3', name: 'Para treinar', count: 0, coverUrls: [] } };
        },
        'POST /api/playlists/pl3/items': { status: 204 },
      }),
    );
    renderWithQuery(<PlaylistPicker />);
    openPicker();
    await screen.findByRole('checkbox', { name: /Sertanejo raiz/ });

    fireEvent.change(screen.getByLabelText('Nova playlist'), { target: { value: '  Para treinar ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(toasts()).toContain('Adicionada a Para treinar'));
    const [, createInit] = requestsTo(fetchMock, 'POST', '/api/profiles/p1/playlists')[0] ?? [];
    expect(JSON.parse(String(createInit?.body))).toEqual({ name: 'Para treinar' });
    expect(requestsTo(fetchMock, 'POST', '/api/playlists/pl3/items')).toHaveLength(1);
    expect(screen.getByLabelText('Nova playlist')).toHaveValue('');
  });

  it('does not create a playlist without a name', async () => {
    const fetchMock = mockApi(routes(world));
    renderWithQuery(<PlaylistPicker />);
    openPicker();
    await screen.findByRole('checkbox', { name: /Sertanejo raiz/ });

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome da playlist');
    expect(requestsTo(fetchMock, 'POST', '/api/profiles/p1/playlists')).toHaveLength(0);
  });

  it('explains when the name is already used and adds nothing', async () => {
    const fetchMock = mockApi(
      routes(world, {
        'POST /api/profiles/p1/playlists': {
          status: 409,
          body: { error: { code: 'PLAYLIST_NAME_TAKEN', message: 'Você já tem uma playlist com esse nome' } },
        },
      }),
    );
    renderWithQuery(<PlaylistPicker />);
    openPicker();
    await screen.findByRole('checkbox', { name: /Sertanejo raiz/ });

    fireEvent.change(screen.getByLabelText('Nova playlist'), { target: { value: 'Festa de sábado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Você já tem uma playlist com esse nome');
    expect(screen.getByLabelText('Nova playlist')).toHaveValue('Festa de sábado');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/items'))).toBe(false);
  });

  it('clears the error as soon as the user types again', async () => {
    mockApi(routes(world));
    renderWithQuery(<PlaylistPicker />);
    openPicker();
    await screen.findByRole('checkbox', { name: /Sertanejo raiz/ });

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nova playlist'), { target: { value: 'N' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes with the Done button', async () => {
    mockApi(routes(world));
    renderWithQuery(<PlaylistPicker />);
    openPicker();
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Pronto' }));

    expect(usePlaylistPickerStore.getState().song).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an error when the playlists cannot be loaded', async () => {
    mockApi({ [`GET ${LIST_URL}`]: { status: 500 } });
    renderWithQuery(<PlaylistPicker />);

    openPicker();

    expect(await screen.findByText('Não foi possível carregar as playlists.')).toBeInTheDocument();
  });
});
