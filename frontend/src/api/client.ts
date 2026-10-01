const API_PREFIX = '/api';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new ApiError(
    body.error?.code ?? 'UNKNOWN_ERROR',
    body.error?.message ?? 'Não foi possível completar a requisição',
    response.status,
  );
}

function buildHeaders(init?: RequestInit): HeadersInit {
  const hasBody = init?.body !== undefined && init.body !== null;
  return hasBody ? { 'Content-Type': 'application/json', ...init?.headers } : { ...init?.headers };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers: buildHeaders(init) });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return apiRequest<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
