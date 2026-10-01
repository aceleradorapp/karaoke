import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiSend } from './client';

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastRequestInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return fetchMock.mock.calls[0]?.[1] as RequestInit;
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not send a JSON content type when there is no body', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));
    await apiSend('POST', '/profiles/1/touch');
    expect(lastRequestInit(fetchMock).headers).not.toHaveProperty('Content-Type');
  });

  it('sends the body as JSON with the content type', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 201 }));
    await apiSend('POST', '/profiles', { name: 'Ana' });
    const init = lastRequestInit(fetchMock);
    expect(init.body).toBe('{"name":"Ana"}');
    expect(init.headers).toHaveProperty('Content-Type', 'application/json');
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(apiSend('DELETE', '/profiles/1')).resolves.toBeUndefined();
  });

  it('throws an ApiError with the server code and message', async () => {
    mockFetch(
      new Response(
        JSON.stringify({ error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado' } }),
        {
          status: 404,
        },
      ),
    );

    const error = await apiGet('/profiles/x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado', status: 404 });
  });
});
