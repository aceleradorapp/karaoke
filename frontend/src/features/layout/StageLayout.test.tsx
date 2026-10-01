import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { StageLayout } from './StageLayout';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

function CurrentLocation() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{`${pathname}${search}`}</p>;
}

function renderLayout(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<StageLayout />}>
          <Route path="*" element={<CurrentLocation />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const currentLocation = () => screen.getByTestId('location').textContent;

describe('StageLayout', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: ANA });
  });

  it('shows the main navigation and the page content', () => {
    renderLayout();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    for (const label of ['Início', 'Biblioteca', 'YouTube', 'Playlists', 'Ranking']) {
      expect(nav).toHaveTextContent(label);
    }
    expect(screen.getByTestId('location')).toBeInTheDocument();
  });

  it('highlights the active section', () => {
    renderLayout('/biblioteca');
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toHaveClass('text-primary');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveClass('text-primary');
  });

  it('toggles the navigation menu on small screens', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu after navigating', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));

    fireEvent.click(screen.getByRole('link', { name: 'Ranking' }));

    expect(currentLocation()).toBe('/ranking');
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();
  });

  it('opens the profile menu with the profile options and closes it with Escape', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil Ana' }));
    const menu = screen.getByRole('menu');
    for (const label of ['Favoritas', 'Histórico', 'Configurações', 'Trocar perfil']) {
      expect(menu).toHaveTextContent(label);
    }

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the profile menu when clicking outside and after choosing an option', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil Ana' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil Ana' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configurações' }));
    expect(currentLocation()).toBe('/configuracoes');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('searches the library with the typed text', () => {
    renderLayout();

    const search = screen.getByRole('searchbox', { name: 'Buscar músicas' });
    fireEvent.change(search, { target: { value: '  Evidências  ' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(currentLocation()).toBe('/biblioteca?q=Evid%C3%AAncias');
  });

  it('ignores an empty search', () => {
    renderLayout('/');

    const search = screen.getByRole('searchbox', { name: 'Buscar músicas' });
    fireEvent.change(search, { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(currentLocation()).toBe('/');
  });

  it('links to the processing queue and has the QR code placeholder disabled', () => {
    renderLayout();

    expect(screen.getByRole('link', { name: 'Fila de processamento' })).toHaveAttribute('href', '/fila');
    expect(screen.getByRole('button', { name: /QR code de acesso/ })).toBeDisabled();
  });
});
