import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { ThemeSync } from '../../components/ThemeSync';
import { useProfileStore } from '../../stores/useProfileStore';
import { mockApi } from '../../test/mockApi';
import { RequireProfile } from './RequireProfile';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'neon',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ThemeSync />
        <Routes>
          <Route path="/perfis" element={<p>Escolha o perfil</p>} />
          <Route element={<RequireProfile />}>
            <Route path="/" element={<p>Início</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireProfile', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects to profile selection when there is no profile', async () => {
    mockApi({ 'GET /api/profiles': { body: { items: [ANA] } } });
    renderAt('/');
    expect(await screen.findByText('Escolha o perfil')).toBeInTheDocument();
  });

  it('renders the page when a profile is selected', async () => {
    useProfileStore.setState({ currentProfile: ANA });
    mockApi({ 'GET /api/profiles': { body: { items: [ANA] } } });
    renderAt('/');
    expect(await screen.findByText('Início')).toBeInTheDocument();
  });

  it('forgets a stored profile that no longer exists on the server', async () => {
    useProfileStore.setState({ currentProfile: ANA });
    mockApi({ 'GET /api/profiles': { body: { items: [] } } });
    renderAt('/');

    expect(await screen.findByText('Escolha o perfil')).toBeInTheDocument();
    expect(useProfileStore.getState().currentProfile).toBeNull();
  });

  it('refreshes a stored profile that changed on the server', async () => {
    useProfileStore.setState({ currentProfile: ANA });
    mockApi({ 'GET /api/profiles': { body: { items: [{ ...ANA, name: 'Ana Maria' }] } } });
    renderAt('/');

    await waitFor(() => expect(useProfileStore.getState().currentProfile?.name).toBe('Ana Maria'));
  });
});

describe('ThemeSync', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the theme of the selected profile outside the profile screens', async () => {
    useProfileStore.setState({ currentProfile: ANA });
    mockApi({ 'GET /api/profiles': { body: { items: [ANA] } } });
    renderAt('/');

    await screen.findByText('Início');
    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('uses the default theme on the profile selection screen', async () => {
    useProfileStore.setState({ currentProfile: ANA });
    mockApi({ 'GET /api/profiles': { body: { items: [ANA] } } });
    renderAt('/perfis');

    await screen.findByText('Escolha o perfil');
    expect(document.documentElement.dataset.theme).toBe('cinema');
  });
});
