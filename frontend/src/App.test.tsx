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

  it('sends visitors without a selected profile to "Quem vai cantar?"', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Quem vai cantar?' })).toBeInTheDocument();
  });

  it('serves the profile management screen without requiring a profile', async () => {
    renderApp('/perfis/gerenciar');
    expect(await screen.findByRole('heading', { name: 'Gerenciar perfis' })).toBeInTheDocument();
  });
});
