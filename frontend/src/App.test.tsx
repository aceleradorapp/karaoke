import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useProfileStore } from './stores/useProfileStore';
import { mockApi } from './test/mockApi';

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: null });
    mockApi({ 'GET /api/profiles': { body: { items: [] } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends visitors without a selected profile to "Quem está usando?"', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Quem está usando?' })).toBeInTheDocument();
  });

  it('shows the profile management screen inside the stage layout, with the top bar', async () => {
    useProfileStore.setState({
      currentProfile: {
        id: 'p1',
        name: 'Ana',
        avatar: 'lion',
        theme: 'cinema',
        isGuest: false,
        createdAt: '',
        lastUsedAt: '',
      },
    });
    renderApp('/perfis/gerenciar');

    expect(await screen.findByRole('heading', { name: 'Gerenciar perfis' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
  });

  it('asks who is using the TV before managing profiles', async () => {
    renderApp('/perfis/gerenciar');
    expect(await screen.findByRole('heading', { name: 'Quem está usando?' })).toBeInTheDocument();
  });
});
