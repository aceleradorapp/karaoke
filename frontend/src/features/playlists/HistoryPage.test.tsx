import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryItemDTO, ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { mockApi, requestsTo } from '../../test/mockApi';
import { renderWithQuery } from '../../test/renderWithQuery';
import { buildSong } from '../../test/songBuilder';
import { HistoryPage } from './HistoryPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const FIRST_PAGE_URL = '/api/profiles/p1/history?limit=30';

function entry(id: string, overrides: Partial<HistoryItemDTO> = {}): HistoryItemDTO {
  return {
    id,
    song: buildSong({ id: `song-${id}`, title: `Música ${id}`, artist: `Artista ${id}` }),
    startedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    finalScore: null,
    pitchScore: null,
    audienceScore: null,
    completed: true,
    ...overrides,
  };
}

describe('HistoryPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists what the profile sang, with when and how it went', async () => {
    mockApi({
      [`GET ${FIRST_PAGE_URL}`]: {
        body: {
          items: [entry('1'), entry('2', { completed: false })],
          nextCursor: null,
        },
      },
    });
    renderWithQuery(<HistoryPage />);

    expect(await screen.findByRole('link', { name: 'Música 1' })).toHaveAttribute('href', '/musica/song-1');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Artista 1');
    expect(rows[0]).toHaveTextContent('há 2 h');
    expect(rows[0]).toHaveTextContent('Cantou até o fim');
    expect(rows[1]).toHaveTextContent('Parou no meio');
    expect(screen.getByText(/O que Ana já cantou/)).toBeInTheDocument();
  });

  it('shows the final score only when there is one', async () => {
    mockApi({
      [`GET ${FIRST_PAGE_URL}`]: {
        body: { items: [entry('1', { finalScore: 87 }), entry('2')], nextCursor: null },
      },
    });
    renderWithQuery(<HistoryPage />);

    expect(await screen.findByLabelText('Nota 87')).toHaveTextContent('87');
    expect(screen.getAllByLabelText(/^Nota /)).toHaveLength(1);
  });

  it('lets the user sing a ready song again, but not one that failed', async () => {
    const failed = entry('2');
    failed.song = buildSong({ id: 'song-2', title: 'Quebrada', status: 'ERROR' });
    mockApi({
      [`GET ${FIRST_PAGE_URL}`]: { body: { items: [entry('1'), failed], nextCursor: null } },
    });
    renderWithQuery(<HistoryPage />);

    expect(await screen.findByRole('link', { name: 'Cantar Música 1 de novo' })).toHaveAttribute(
      'href',
      '/player/song-1',
    );
    expect(screen.queryByRole('link', { name: 'Cantar Quebrada de novo' })).not.toBeInTheDocument();
  });

  it('loads more when asked, and hides the button on the last page', async () => {
    const fetchMock = mockApi({
      [`GET ${FIRST_PAGE_URL}`]: { body: { items: [entry('1')], nextCursor: 'c1' } },
      [`GET ${FIRST_PAGE_URL}&cursor=c1`]: { body: { items: [entry('2')], nextCursor: null } },
    });
    renderWithQuery(<HistoryPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(requestsTo(fetchMock, 'GET', `${FIRST_PAGE_URL}&cursor=c1`)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('invites the user to sing when the history is empty', async () => {
    mockApi({ [`GET ${FIRST_PAGE_URL}`]: { body: { items: [], nextCursor: null } } });
    renderWithQuery(<HistoryPage />);

    expect(await screen.findByText('Ainda não cantou nenhuma música')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'biblioteca' })).toHaveAttribute('href', '/biblioteca');
  });

  it('shows an error when the history cannot be loaded', async () => {
    mockApi({ [`GET ${FIRST_PAGE_URL}`]: { status: 500 } });
    renderWithQuery(<HistoryPage />);

    expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  });
});
