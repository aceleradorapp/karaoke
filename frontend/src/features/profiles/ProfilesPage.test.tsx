import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo } from '../../test/mockApi';
import { ProfilesPage } from './ProfilesPage';

function buildProfile(overrides: Partial<ProfileDTO>): ProfileDTO {
  return {
    id: 'p1',
    name: 'Ana',
    avatar: 'lion',
    theme: 'neon',
    isGuest: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    lastUsedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

const ANA = buildProfile({ id: 'p1', name: 'Ana' });
const TIO_BETO = buildProfile({
  id: 'p2',
  name: 'Tio Beto',
  avatar: 'robot',
  isGuest: true,
  theme: 'cinema',
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/perfis']}>
        <Routes>
          <Route path="/perfis" element={<ProfilesPage />} />
          <Route path="/" element={<p>Início</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfilesPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: null });
    useToastStore.setState({ toasts: [] });
    document.documentElement.dataset.theme = 'cinema';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists family profiles and guests in their own sections', async () => {
    mockApi({ 'GET /api/profiles': { body: { items: [ANA, TIO_BETO] } } });
    renderPage();

    const family = await screen.findByRole('region', { name: 'Perfis da família' });
    expect(within(family).getByText('Ana')).toBeInTheDocument();
    expect(within(family).queryByText('Tio Beto')).not.toBeInTheDocument();

    const guests = screen.getByRole('region', { name: 'Convidados' });
    expect(within(guests).getByText('Tio Beto')).toBeInTheDocument();
  });

  it('selects a profile: touches it, stores it, applies its theme and goes home', async () => {
    const touched = { ...ANA, lastUsedAt: '2026-10-01T12:00:00.000Z' };
    const fetchMock = mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      'POST /api/profiles/p1/touch': { body: touched },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

    expect(await screen.findByText('Início')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/api/profiles/p1/touch')).toHaveLength(1);
    expect(useProfileStore.getState().currentProfile).toEqual(touched);
    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('stays on the page and warns when the profile cannot be selected', async () => {
    mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      'POST /api/profiles/p1/touch': {
        status: 500,
        body: { error: { code: 'X', message: 'Falha no servidor' } },
      },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe('Falha no servidor'));
    expect(screen.queryByText('Início')).not.toBeInTheDocument();
    expect(useProfileStore.getState().currentProfile).toBeNull();
  });

  it('validates the name before creating a profile', async () => {
    const fetchMock = mockApi({ 'GET /api/profiles': { body: { items: [] } } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Adicionar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um nome');
    expect(requestsTo(fetchMock, 'POST', '/api/profiles')).toHaveLength(0);
  });

  it('creates a profile with the chosen name, avatar and theme', async () => {
    const created = buildProfile({ id: 'p9', name: 'Bia', avatar: 'cat', theme: 'retro' });
    const fetchMock = mockApi({
      'GET /api/profiles': { body: { items: [] } },
      'POST /api/profiles': { status: 201, body: created },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Adicionar/ }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bia' } });
    fireEvent.click(screen.getByRole('radio', { name: 'cat' }));
    fireEvent.click(screen.getByRole('radio', { name: /Retrô/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/profiles')).toHaveLength(1));
    const body = JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/profiles')[0]?.[1]?.body));
    expect(body).toEqual({ name: 'Bia', avatar: 'cat', theme: 'retro', isGuest: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates a guest without asking for a theme', async () => {
    const fetchMock = mockApi({
      'GET /api/profiles': { body: { items: [] } },
      'POST /api/profiles': { status: 201, body: buildProfile({ isGuest: true }) },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Convidado/ }));
    expect(screen.queryByRole('radiogroup', { name: 'Tema' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Carla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/profiles')).toHaveLength(1));
    const body = JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/profiles')[0]?.[1]?.body));
    expect(body).toMatchObject({ name: 'Carla', isGuest: true });
  });
});
