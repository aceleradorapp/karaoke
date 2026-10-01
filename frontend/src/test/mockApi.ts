import { vi } from 'vitest';

export interface MockRoute {
  status?: number;
  body?: unknown;
}

export type MockRoutes = Record<string, MockRoute | (() => MockRoute)>;

export function mockApi(routes: MockRoutes) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const handler = routes[`${method} ${url}`];
    const route = typeof handler === 'function' ? handler() : (handler ?? { status: 500 });
    const status = route.status ?? 200;
    const body = status === 204 ? null : JSON.stringify(route.body ?? {});
    return Promise.resolve(new Response(body, { status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function requestsTo(fetchMock: ReturnType<typeof mockApi>, method: string, url: string) {
  return fetchMock.mock.calls.filter(
    ([calledUrl, init]) => calledUrl === url && (init?.method ?? 'GET') === method,
  );
}
