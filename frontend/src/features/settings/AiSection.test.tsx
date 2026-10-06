import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { AiSection, claudeCodeCommand, claudeDesktopConfig } from './AiSection';

const KEY = 'ck_abcdefghijklmnopqrstuvwxyz012345';
const STATUS = {
  hasKey: false,
  createdAt: null,
  serverUrls: ['http://192.168.0.10:3333'],
  mcpDownloadPath: '/downloads/caraoke-mcp.mjs',
};

function renderSection(routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AiSection />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('AiSection', () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));
  afterEach(() => vi.unstubAllGlobals());

  it('generates a key, shows it once and fills the Claude instructions with it', async () => {
    const fetchMock = renderSection({
      'GET /api/ai-key': { body: STATUS },
      'POST /api/ai-key': { status: 201, body: { key: KEY, createdAt: '2026-10-06T12:00:00.000Z' } },
    });

    const generateButton = await screen.findByRole('button', { name: 'Gerar chave para IA' });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    expect(await screen.findByText('Guarde agora: esta chave não aparece de novo.')).toBeInTheDocument();
    expect(screen.getByText(KEY)).toBeInTheDocument();
    expect(
      screen.getByText(`claude mcp add karaoke -e CARAOKE_URL=http://192.168.0.10:3333 -e CARAOKE_KEY=${KEY} -- node C:\\karaoke\\caraoke-mcp.mjs`),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Baixar caraoke-mcp.mjs' })).toHaveAttribute(
      'href',
      '/downloads/caraoke-mcp.mjs',
    );
    expect(requestsTo(fetchMock, 'POST', '/api/ai-key')).toHaveLength(1);
  });

  it('never shows an existing key and lets it be replaced or revoked', async () => {
    const fetchMock = renderSection({
      'GET /api/ai-key': { body: { ...STATUS, hasKey: true, createdAt: new Date().toISOString() } },
      'DELETE /api/ai-key': { status: 204 },
    });

    expect(await screen.findByText(/Chave criada agora/)).toBeInTheDocument();
    expect(screen.getByText(/CARAOKE_KEY=<sua chave>/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar chave' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revogar' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/ai-key')).toHaveLength(1));
  });

  it('builds the setup for both Claude apps', () => {
    expect(claudeCodeCommand('http://pc:3333', 'ck_x')).toBe(
      'claude mcp add karaoke -e CARAOKE_URL=http://pc:3333 -e CARAOKE_KEY=ck_x -- node C:\\karaoke\\caraoke-mcp.mjs',
    );
    expect(JSON.parse(claudeDesktopConfig('http://pc:3333', 'ck_x'))).toEqual({
      mcpServers: {
        karaoke: {
          command: 'node',
          args: ['C:\\karaoke\\caraoke-mcp.mjs'],
          env: { CARAOKE_URL: 'http://pc:3333', CARAOKE_KEY: 'ck_x' },
        },
      },
    });
  });
});
