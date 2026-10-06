import { LOCAL_WORKER_ID } from './workerStatus.js';

export const LOCAL_WORKER_NAME = 'Este PC';
export const UNKNOWN_WORKER_NAME = 'Outra máquina';

const names = new Map<string, string>();

export function workerLabel(workerId: string | null): string | null {
  if (workerId === null) return null;
  if (workerId === LOCAL_WORKER_ID) return LOCAL_WORKER_NAME;
  return names.get(workerId) ?? UNKNOWN_WORKER_NAME;
}

export function rememberWorkerName(workerId: string, name: string): void {
  names.set(workerId, name);
}

export function forgetWorkerName(workerId: string): void {
  names.delete(workerId);
}

export function replaceWorkerNames(entries: Array<{ id: string; name: string }>): void {
  names.clear();
  for (const entry of entries) names.set(entry.id, entry.name);
}
