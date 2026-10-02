import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSocketAuth } from '../realtime/socket';
import { useMobileAccessStore } from '../stores/useMobileAccessStore';
import { FakeXhr, installFakeXhr, lastRequest } from '../test/fakeXhr';
import { ApiError, apiGet } from './client';
import { uploadAudioFile } from './uploads';

function goTo(path: string) {
  window.history.pushState({}, '', path);
}

function mockFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) =>
  (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;

describe('access code on the phone', () => {
  beforeEach(() => {
    useMobileAccessStore.setState({ code: 'K7P2QX', status: 'ok' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    goTo('/');
  });

  it('sends the code with every request made from the phone pages', async () => {
    goTo('/m/buscar');
    const fetchMock = mockFetch(200);

    await apiGet('/jobs?scope=active');

    expect(sentHeaders(fetchMock)).toHaveProperty('X-Access-Code', 'K7P2QX');
  });

  it('never sends the code from the stage, not even on pages that start with m', async () => {
    goTo('/musica/abc');
    const fetchMock = mockFetch(200);

    await apiGet('/songs/abc');

    expect(sentHeaders(fetchMock)).not.toHaveProperty('X-Access-Code');
  });

  it('marks the access as refused when the phone gets an access error', async () => {
    goTo('/m/buscar');
    mockFetch(401, { error: { code: 'ACCESS_DENIED', message: 'Código de acesso inválido.' } });

    await expect(apiGet('/jobs')).rejects.toBeInstanceOf(ApiError);

    expect(useMobileAccessStore.getState().status).toBe('denied');
  });

  it('does not mark the access as refused for other errors or on the stage', async () => {
    goTo('/m/buscar');
    mockFetch(500);
    await expect(apiGet('/jobs')).rejects.toBeInstanceOf(ApiError);
    expect(useMobileAccessStore.getState().status).toBe('ok');

    goTo('/configuracoes');
    mockFetch(401, { error: { code: 'ACCESS_DENIED', message: 'x' } });
    await expect(apiGet('/settings')).rejects.toBeInstanceOf(ApiError);
    expect(useMobileAccessStore.getState().status).toBe('ok');
  });

  it('sends the code with uploads made from the phone', () => {
    installFakeXhr();
    goTo('/m/enviar');

    void uploadAudioFile(new File(['x'], 'musica.mp3')).catch(() => undefined);

    expect((lastRequest() as FakeXhr).headers).toEqual({ 'X-Access-Code': 'K7P2QX' });
  });

  it('identifies the socket as a phone with the code, or as the stage', () => {
    goTo('/m/fila');
    expect(currentSocketAuth()).toEqual({ client: 'mobile', code: 'K7P2QX' });

    useMobileAccessStore.setState({ code: null });
    expect(currentSocketAuth()).toEqual({ client: 'mobile' });

    goTo('/');
    expect(currentSocketAuth()).toEqual({ client: 'stage' });
  });

  it('keeps the code in upper case without spaces', () => {
    useMobileAccessStore.getState().setCode(' k7p2qx ');
    expect(useMobileAccessStore.getState()).toMatchObject({ code: 'K7P2QX', status: 'unknown' });
  });
});
