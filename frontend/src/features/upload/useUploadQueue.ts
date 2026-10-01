import { MAX_UPLOAD_BYTES, isSupportedAudioFile } from '@caraoke/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadAudioFile } from '../../api/uploads';

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: number;
  file: File;
  status: UploadStatus;
  progress: number;
  error: string | null;
  isRetryable: boolean;
}

const UNSUPPORTED_MESSAGE = 'Formato não suportado';
const TOO_LARGE_MESSAGE = 'O arquivo tem mais de 60 MB';

function validationError(file: File): string | null {
  if (!isSupportedAudioFile(file.name)) return UNSUPPORTED_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return TOO_LARGE_MESSAGE;
  return null;
}

function toItem(id: number, file: File): UploadItem {
  const error = validationError(file);
  return {
    id,
    file,
    status: error ? 'error' : 'waiting',
    progress: 0,
    error,
    isRetryable: false,
  };
}

export interface UploadQueue {
  items: UploadItem[];
  addFiles: (files: File[]) => void;
  retry: (id: number) => void;
  clearFinished: () => void;
}

export function useUploadQueue(profileId?: string): UploadQueue {
  const [items, setItems] = useState<UploadItem[]>([]);
  const nextId = useRef(1);
  const startedIds = useRef(new Set<number>());
  const controller = useRef(new AbortController());

  const update = useCallback((id: number, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  useEffect(() => {
    const abortController = controller.current;
    return () => abortController.abort();
  }, []);

  const isUploading = items.some((item) => item.status === 'uploading');

  useEffect(() => {
    if (isUploading) return;
    const next = items.find((item) => item.status === 'waiting' && !startedIds.current.has(item.id));
    if (!next) return;

    startedIds.current.add(next.id);
    update(next.id, { status: 'uploading', progress: 0 });

    uploadAudioFile(next.file, {
      profileId,
      signal: controller.current.signal,
      onProgress: (fraction) => update(next.id, { progress: fraction }),
    })
      .then(() => update(next.id, { status: 'done', progress: 1 }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Não foi possível enviar o arquivo';
        update(next.id, { status: 'error', error: message, isRetryable: true });
      });
  }, [items, isUploading, profileId, update]);

  const addFiles = useCallback((files: File[]) => {
    const created = files.map((file) => toItem(nextId.current++, file));
    setItems((current) => [...current, ...created]);
  }, []);

  const retry = useCallback(
    (id: number) => {
      startedIds.current.delete(id);
      update(id, { status: 'waiting', progress: 0, error: null, isRetryable: false });
    },
    [update],
  );

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'waiting' || item.status === 'uploading'));
  }, []);

  return { items, addFiles, retry, clearFinished };
}
