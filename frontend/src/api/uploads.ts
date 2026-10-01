import { ApiError } from './client';

const UPLOAD_URL = '/api/uploads';
const NETWORK_ERROR_MESSAGE = 'Falha de conexão durante o envio';
const FALLBACK_ERROR_MESSAGE = 'Não foi possível enviar o arquivo';
const SUCCESS_STATUSES = new Set([200, 201]);

export interface UploadOptions {
  profileId?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

function readError(request: XMLHttpRequest): ApiError {
  let payload: ErrorPayload = {};
  try {
    payload = JSON.parse(request.responseText) as ErrorPayload;
  } catch {
    payload = {};
  }
  return new ApiError(
    payload.error?.code ?? 'UPLOAD_FAILED',
    payload.error?.message ?? FALLBACK_ERROR_MESSAGE,
    request.status,
  );
}

function buildForm(file: File, profileId: string | undefined): FormData {
  const form = new FormData();
  if (profileId) form.append('profileId', profileId);
  form.append('files', file, file.name);
  return form;
}

export function uploadAudioFile(file: File, options: UploadOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', UPLOAD_URL);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      if (SUCCESS_STATUSES.has(request.status)) {
        options.onProgress?.(1);
        resolve();
      } else {
        reject(readError(request));
      }
    };
    request.onerror = () => reject(new ApiError('NETWORK_ERROR', NETWORK_ERROR_MESSAGE, 0));
    request.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

    options.signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(buildForm(file, options.profileId));
  });
}
