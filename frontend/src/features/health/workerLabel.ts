import type { WorkerInfo } from '../../api/system';

const DEVICE_LABELS: Record<string, string> = {
  cpu: 'CPU',
  cuda: 'GPU',
};

export function workerLabel(worker: WorkerInfo | undefined): string {
  if (!worker?.online) return 'Worker offline';
  const device = worker.device ? (DEVICE_LABELS[worker.device] ?? worker.device) : 'dispositivo desconhecido';
  return `Worker online · ${device}`;
}
