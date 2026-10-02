import { vi } from 'vitest';

export class FakeXhr {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  body: FormData | null = null;
  headers: Record<string, string> = {};
  status = 0;
  responseText = '';
  aborted = false;
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: FormData): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  reportProgress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  respond(status: number, payload: unknown = {}): void {
    this.status = status;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }

  failNetwork(): void {
    this.onerror?.();
  }

  formKeys(): string[] {
    return this.body ? Array.from(this.body.keys()) : [];
  }
}

export function installFakeXhr(): void {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

export function lastRequest(): FakeXhr {
  const request = FakeXhr.instances.at(-1);
  if (!request) throw new Error('No upload request was made');
  return request;
}
