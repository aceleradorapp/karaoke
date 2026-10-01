import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo } from '../../test/mockApi';
import { renderWithQuery } from '../../test/renderWithQuery';
import { FavoriteButton } from './FavoriteButton';

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

describe('FavoriteButton', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an empty heart for a song that is not a favorite', () => {
    mockApi({});
    renderWithQuery(<FavoriteButton song={{ ...SONG, isFavorite: false }} />);

    const button = screen.getByRole('button', { name: 'Favoritar Evidências' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('treats a song without the favorite information as not favorite', () => {
    mockApi({});
    renderWithQuery(<FavoriteButton song={SONG} />);
    expect(screen.getByRole('button', { name: 'Favoritar Evidências' })).toBeInTheDocument();
  });

  it('favorites on the click and shows it right away', async () => {
    const fetchMock = mockApi({ 'PUT /api/profiles/p1/favorites/s1': { status: 204 } });
    renderWithQuery(<FavoriteButton song={SONG} />);

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar Evidências' }));

    expect(screen.getByRole('button', { name: 'Tirar Evidências das favoritas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(requestsTo(fetchMock, 'PUT', '/api/profiles/p1/favorites/s1')).toHaveLength(1),
    );
  });

  it('removes the favorite on the click', async () => {
    const fetchMock = mockApi({ 'DELETE /api/profiles/p1/favorites/s1': { status: 204 } });
    renderWithQuery(<FavoriteButton song={{ ...SONG, isFavorite: true }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tirar Evidências das favoritas' }));

    expect(screen.getByRole('button', { name: 'Favoritar Evidências' })).toBeInTheDocument();
    await waitFor(() =>
      expect(requestsTo(fetchMock, 'DELETE', '/api/profiles/p1/favorites/s1')).toHaveLength(1),
    );
  });

  it('goes back and warns when the server refuses', async () => {
    mockApi({ 'PUT /api/profiles/p1/favorites/s1': { status: 500 } });
    renderWithQuery(<FavoriteButton song={SONG} />);

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar Evidências' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Favoritar Evidências' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
      'Não foi possível atualizar as favoritas',
    );
  });

  it('follows the song when it changes outside of the button', () => {
    mockApi({});
    const { rerender } = renderWithQuery(<FavoriteButton song={{ ...SONG, isFavorite: false }} />);
    expect(screen.getByRole('button', { name: 'Favoritar Evidências' })).toBeInTheDocument();

    rerender(<FavoriteButton song={{ ...SONG, isFavorite: true }} />);

    expect(screen.getByRole('button', { name: 'Tirar Evidências das favoritas' })).toBeInTheDocument();
  });

  it('can show a text label next to the heart', () => {
    mockApi({});
    renderWithQuery(<FavoriteButton song={{ ...SONG, isFavorite: true }} labeled />);
    expect(screen.getByRole('button', { name: /Tirar Evidências/ })).toHaveTextContent('Favorita');
  });
});
