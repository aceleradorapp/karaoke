import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo } from '../../test/mockApi';
import { ManageProfilesPage } from './ManageProfilesPage';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const PATCH_URL = '/api/profiles/p1';
const AUTO_SAVE_TIMEOUT_MS = 3000;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/perfis/gerenciar']}>
        <Routes>
          <Route path="/perfis/gerenciar" element={<ManageProfilesPage />} />
          <Route path="/perfis" element={<p>Quem vai cantar?</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function patchBodies(fetchMock: ReturnType<typeof mockApi>) {
  return requestsTo(fetchMock, 'PATCH', PATCH_URL).map(([, init]) => JSON.parse(String(init?.body)));
}

async function openEditor() {
  fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));
  return screen.findByRole('dialog', { name: 'Editar perfil' });
}

describe('ManageProfilesPage', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfile: null });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has no save button: edits are saved automatically', async () => {
    mockApi({ 'GET /api/profiles': { body: { items: [ANA] } } });
    renderPage();

    await openEditor();

    expect(screen.queryByRole('button', { name: /^Salvar/ })).not.toBeInTheDocument();
  });

  it('saves a renamed profile after typing stops', async () => {
    const fetchMock = mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      [`PATCH ${PATCH_URL}`]: { body: { ...ANA, name: 'Ana Maria' } },
    });
    renderPage();
    await openEditor();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Maria' } });
    expect(patchBodies(fetchMock)).toHaveLength(0);

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1), { timeout: AUTO_SAVE_TIMEOUT_MS });
    expect(patchBodies(fetchMock)[0]).toEqual({ name: 'Ana Maria', avatar: 'lion', theme: 'cinema' });
    expect(await screen.findByText('Salvo ✓')).toBeInTheDocument();
  });

  it('saves an avatar or theme change right away', async () => {
    const fetchMock = mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      [`PATCH ${PATCH_URL}`]: { body: { ...ANA, theme: 'neon' } },
    });
    renderPage();
    await openEditor();

    fireEvent.click(screen.getByRole('radio', { name: /Neon/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1), { timeout: 500 });
    expect(patchBodies(fetchMock)[0]).toMatchObject({ theme: 'neon' });
  });

  it('does not save an empty name and shows the error', async () => {
    const fetchMock = mockApi({ 'GET /api/profiles': { body: { items: [ANA] } } });
    renderPage();
    await openEditor();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '   ' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um nome');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(patchBodies(fetchMock)).toHaveLength(0);
  });

  it('offers a retry when saving fails', async () => {
    mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      [`PATCH ${PATCH_URL}`]: { status: 500, body: { error: { code: 'X', message: 'Falhou' } } },
    });
    renderPage();
    await openEditor();

    fireEvent.click(screen.getByRole('radio', { name: 'cat' }));

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a profile', async () => {
    const fetchMock = mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      [`DELETE ${PATCH_URL}`]: { status: 204 },
    });
    renderPage();
    await openEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir perfil' }));
    expect(requestsTo(fetchMock, 'DELETE', PATCH_URL)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', PATCH_URL)).toHaveLength(1));
  });

  it('sends the user back to profile selection after deleting the current profile', async () => {
    useProfileStore.setState({ currentProfile: ANA });
    mockApi({
      'GET /api/profiles': { body: { items: [ANA] } },
      [`DELETE ${PATCH_URL}`]: { status: 204 },
    });
    renderPage();
    await openEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir perfil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Quem vai cantar?')).toBeInTheDocument();
    expect(useProfileStore.getState().currentProfile).toBeNull();
  });
});
