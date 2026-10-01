import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '../../test/renderWithQuery';
import { buildSong } from '../../test/songBuilder';
import { SongRow } from './SongRow';

function renderRow() {
  const songs = [
    buildSong({ title: 'Primeira' }),
    buildSong({ title: 'Segunda' }),
    buildSong({ title: 'Terceira' }),
  ];
  renderWithQuery(<SongRow title="Adicionadas recentemente" songs={songs} />);
}

describe('SongRow', () => {
  it('is a labeled section with one card per song', () => {
    renderRow();

    const section = screen.getByRole('region', { name: 'Adicionadas recentemente' });
    expect(within(section).getAllByRole('article')).toHaveLength(3);
    expect(within(section).getByRole('link', { name: 'Segunda' })).toBeInTheDocument();
  });

  it('scrolls sideways by most of its width with the arrow buttons', () => {
    renderRow();
    const list = screen.getByRole('list');
    Object.defineProperty(list, 'clientWidth', { value: 1000, configurable: true });
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;

    fireEvent.click(screen.getByRole('button', { name: 'Rolar Adicionadas recentemente para a direita' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rolar Adicionadas recentemente para a esquerda' }));

    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: 800, behavior: 'smooth' });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: -800, behavior: 'smooth' });
  });
});
