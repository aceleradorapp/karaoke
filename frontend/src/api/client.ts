import { isMobileApp } from '../lib/mobileApp';
import { currentAccessCode, useMobileAccessStore } from '../stores/useMobileAccessStore';

const API_PREFIX = '/api';
const ACCESS_CODE_HEADER = 'X-Access-Code';
const ACCESS_DENIED_CODE = 'ACCESS_DENIED';
const UNAUTHORIZED = 401;

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

export function accessHeaders(): Record<string, string> {
  const code = isMobileApp() ? currentAccessCode() : null;
  return code ? { [ACCESS_CODE_HEADER]: code } : {};
}

export function reportAccessDenied(status: number, code: string): void {
  if (status === UNAUTHORIZED && code === ACCESS_DENIED_CODE && isMobileApp()) {
    useMobileAccessStore.getState().markDenied();
  }
}

function buildHeaders(init?: RequestInit): HeadersInit {
  const hasBody = init?.body !== undefined && init.body !== null;
  const base: Record<string, string> = hasBody ? { 'Content-Type': 'application/json' } : {};
  return { ...base, ...accessHeaders(), ...(init?.headers as Record<string, string> | undefined) };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers: buildHeaders(init) });
  if (!response.ok) {
    const error = await toApiError(response);
    reportAccessDenied(error.status, error.code);
    throw error;
  }
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
