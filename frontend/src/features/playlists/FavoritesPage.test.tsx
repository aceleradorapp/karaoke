import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { mockApi } from '../../test/mockApi';
import { renderWithQuery } from '../../test/renderWithQuery';
import { buildSong } from '../../test/songBuilder';
import { FavoritesPage } from './FavoritesPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

describe('FavoritesPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the favorite songs of the profile as cards, already marked as favorite', async () => {
    mockApi({
      'GET /api/profiles/p1/favorites': {
        body: {
          items: [
            buildSong({ id: 'a', title: 'Alpha', isFavorite: true }),
            buildSong({ id: 'b', title: 'Bravo', isFavorite: true }),
          ],
        },
      },
    });
    renderWithQuery(<FavoritesPage />);

    expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/musica/a');
    expect(screen.getByRole('link', { name: 'Bravo' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Tirar .* das favoritas/ })).toHaveLength(2);
    expect(screen.getByText(/As músicas que Ana mais gosta de cantar/)).toBeInTheDocument();
  });

  it('explains how to favorite when there are none', async () => {
    mockApi({ 'GET /api/profiles/p1/favorites': { body: { items: [] } } });
    renderWithQuery(<FavoritesPage />);

    expect(await screen.findByText('Nenhuma favorita ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'biblioteca' })).toHaveAttribute('href', '/biblioteca');
  });

  it('shows an error when the favorites cannot be loaded', async () => {
    mockApi({ 'GET /api/profiles/p1/favorites': { status: 500 } });
    renderWithQuery(<FavoritesPage />);

    expect(await screen.findByText('Não foi possível carregar as favoritas.')).toBeInTheDocument();
  });
});
