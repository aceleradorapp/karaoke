import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SongDTO } from '@caraoke/shared';
import { usePlaylistPickerStore } from '../../stores/usePlaylistPickerStore';
import { renderWithQuery } from '../../test/renderWithQuery';
import { buildJob } from '../../test/builders';
import { buildProcessingSong, buildSong } from '../../test/songBuilder';
import { SongCard } from './SongCard';

function renderCard(song: SongDTO) {
  renderWithQuery(<SongCard song={song} />);
}

describe('SongCard', () => {
  describe('a song that is ready', () => {
    const song = buildSong({
      id: 'abc',
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      coverUrl: '/media/abc/capa.jpg',
    });

    it('shows the title, the artist and the cover', () => {
      renderCard(song);

      expect(screen.getByText('Evidências')).toBeInTheDocument();
      expect(screen.getByText('Chitãozinho & Xororó')).toBeInTheDocument();
      expect(document.querySelector('img')).toHaveAttribute('src', '/media/abc/capa.jpg');
    });

    it('opens the song details when the card is clicked', () => {
      renderCard(song);
      expect(screen.getByRole('link', { name: 'Evidências' })).toHaveAttribute('href', '/musica/abc');
    });

    it('has a separate button that goes straight to singing', () => {
      renderCard(song);
      expect(screen.getByRole('link', { name: 'Cantar Evidências' })).toHaveAttribute('href', '/player/abc');
    });

    it('draws a gradient with the name when there is no cover', () => {
      renderCard(buildSong({ id: 'nocover', title: 'Sem capa', coverUrl: null }));

      const fallback = screen.getByTestId('cover-fallback');
      expect(fallback.style.background).toContain('linear-gradient');
      expect(fallback).toHaveTextContent('Sem capa');
      expect(fallback).toHaveAttribute('aria-hidden', 'true');
      expect(document.querySelector('img')).toBeNull();
    });

    it('has buttons to favorite the song and to add it to a playlist', () => {
      renderCard(song);
      expect(screen.getByRole('button', { name: 'Favoritar Evidências' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Adicionar Evidências a uma playlist' })).toBeInTheDocument();
    });

    it('keeps its buttons outside of the zoomed cover so they stay above the clickable card', () => {
      renderCard(song);
      for (const name of ['Favoritar Evidências', 'Cantar Evidências']) {
        expect(
          screen.getByRole(/Cantar/.test(name) ? 'link' : 'button', { name }).closest('.aspect-video'),
        ).toBeNull();
      }
    });

    it('opens the playlist picker for this song', () => {
      usePlaylistPickerStore.setState({ song: null });
      renderCard(song);

      fireEvent.click(screen.getByRole('button', { name: 'Adicionar Evidências a uma playlist' }));

      expect(usePlaylistPickerStore.getState().song).toEqual({ id: 'abc', title: 'Evidências' });
    });

    it('shows the heart as pressed for a favorite song', () => {
      renderCard({ ...song, isFavorite: true });
      expect(screen.getByRole('button', { name: 'Tirar Evidências das favoritas' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('warns when the lyrics need a review', () => {
      renderCard(buildSong({ lyricsNeedsReview: true }));
      expect(screen.getByText('Letra para revisar')).toBeInTheDocument();
    });

    it('has no warning when the lyrics are fine', () => {
      renderCard(buildSong());
      expect(screen.queryByText('Letra para revisar')).not.toBeInTheDocument();
    });
  });

  describe('a song that is not ready yet', () => {
    it('shows the progress and the step being processed, and cannot be sung', () => {
      renderCard(buildProcessingSong({ title: 'Processando' }));

      expect(screen.getByRole('progressbar', { name: 'Progresso de Processando' })).toHaveAttribute(
        'aria-valuenow',
        '40',
      );
      expect(screen.getByText('Separando a voz')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^Cantar/ })).not.toBeInTheDocument();
    });

    it('has no favorite or playlist buttons', () => {
      renderCard(buildProcessingSong({ title: 'Processando' }));
      expect(screen.queryByRole('button', { name: /Favoritar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /playlist/ })).not.toBeInTheDocument();
    });

    it('sends the user to the queue instead of the details', () => {
      renderCard(buildProcessingSong({ title: 'Processando' }));
      expect(screen.getByRole('link', { name: 'Processando' })).toHaveAttribute('href', '/fila');
    });

    it('says the song is waiting when its job has not started', () => {
      renderCard(
        buildProcessingSong({ status: 'QUEUED', job: buildJob({ status: 'PENDING', progress: 0 }) }),
      );
      expect(screen.getByText('Na fila')).toBeInTheDocument();
    });

    it('still says it is waiting when the job is unknown', () => {
      renderCard(buildProcessingSong({ status: 'QUEUED', job: null }));
      expect(screen.getByText('Na fila')).toBeInTheDocument();
    });
  });

  describe('a song that failed', () => {
    it('is marked as failed, links to the queue and cannot be sung', () => {
      renderCard(buildSong({ status: 'ERROR', title: 'Quebrada' }));

      expect(screen.getByText('Falhou')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Quebrada' })).toHaveAttribute('href', '/fila');
      expect(screen.queryByRole('link', { name: /^Cantar/ })).not.toBeInTheDocument();
    });
  });
});
