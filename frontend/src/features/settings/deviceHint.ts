import { MIN_VRAM_FOR_AUTO_GPU_MB } from '@caraoke/shared';
import type { WorkerInfo } from '../../api/system';

const MB_PER_GB = 1024;

export function deviceHint(worker: WorkerInfo | undefined): string {
  if (!worker?.online) {
    return 'O worker está offline: a detecção da GPU aparece quando ele estiver rodando.';
  }
  if (!worker.cudaAvailable) {
    return 'Nenhuma GPU compatível detectada: será usada a CPU.';
  }

  const vramMb = worker.vramMb ?? 0;
  const gpuName = worker.gpuName ?? 'GPU';
  const detected = `GPU detectada: ${gpuName} (${Math.round(vramMb / MB_PER_GB)} GB).`;
  const behavior =
    vramMb >= MIN_VRAM_FOR_AUTO_GPU_MB
      ? 'No modo automático será usada a GPU.'
      : 'No modo automático será usada a CPU, porque a GPU tem pouca memória.';
  return `${detected} ${behavior}`;
}
