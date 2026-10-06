import type { WorkerStatus } from '@caraoke/shared';
import { emitToRoom } from '../realtime.js';

export const LOCAL_WORKER_ID = 'local';

const ONLINE_THRESHOLD_MS = 30_000;
const LOST_THRESHOLD_MS = 120_000;
const WATCHDOG_INTERVAL_MS = 5_000;

export interface WorkerHeartbeat {
  instanceId: string;
  device: string;
  cudaAvailable: boolean;
  gpuName: string | null;
  vramMb: number | null;
  ytdlpVersion: string | null;
}

export interface WorkerInfo extends WorkerStatus {
  lastSeen: string | null;
  cudaAvailable: boolean;
  vramMb: number | null;
  ytdlpVersion: string | null;
}

interface TrackedWorker {
  heartbeat: WorkerHeartbeat;
  lastSeenAt: number;
  announcedOnline: boolean;
  isRecovered: boolean;
}

const tracked = new Map<string, TrackedWorker>();

function isOnline(worker: TrackedWorker | undefined, now: number): boolean {
  return worker !== undefined && now - worker.lastSeenAt < ONLINE_THRESHOLD_MS;
}

export function getWorkerInfo(now: number = Date.now(), workerId: string = LOCAL_WORKER_ID): WorkerInfo {
  const worker = tracked.get(workerId);
  return {
    online: isOnline(worker, now),
    lastSeen: worker ? new Date(worker.lastSeenAt).toISOString() : null,
    device: worker?.heartbeat.device ?? null,
    gpuName: worker?.heartbeat.gpuName ?? null,
    cudaAvailable: worker?.heartbeat.cudaAvailable ?? false,
    vramMb: worker?.heartbeat.vramMb ?? null,
    ytdlpVersion: worker?.heartbeat.ytdlpVersion ?? null,
  };
}

export function isWorkerOnline(workerId: string, now: number = Date.now()): boolean {
  return isOnline(tracked.get(workerId), now);
}

function announce(workerId: string, now: number): void {
  const worker = tracked.get(workerId);
  if (worker) worker.announcedOnline = isOnline(worker, now);
  if (workerId === LOCAL_WORKER_ID) {
    const { online, device, gpuName } = getWorkerInfo(now);
    emitToRoom('stage', 'worker:status', { online, device, gpuName });
  }
  emitToRoom('stage', 'workers:changed', { workerId });
}

export function recordHeartbeat(
  heartbeat: WorkerHeartbeat,
  now: number = Date.now(),
  workerId: string = LOCAL_WORKER_ID,
): boolean {
  const previous = tracked.get(workerId);
  const deviceChanged = previous?.heartbeat.device !== heartbeat.device;
  const hasRestarted = previous !== undefined && previous.heartbeat.instanceId !== heartbeat.instanceId;

  tracked.set(workerId, {
    heartbeat,
    lastSeenAt: now,
    announcedOnline: previous?.announcedOnline ?? false,
    isRecovered: false,
  });
  if (!previous?.announcedOnline || deviceChanged) announce(workerId, now);
  return hasRestarted;
}

export function forgetWorker(workerId: string): void {
  if (tracked.delete(workerId)) emitToRoom('stage', 'workers:changed', { workerId });
}

export function startWorkerWatchdog(onWorkerLost: (workerId: string) => void = () => undefined): NodeJS.Timeout {
  const timer = setInterval(() => checkWorkers(Date.now(), onWorkerLost), WATCHDOG_INTERVAL_MS);
  timer.unref();
  return timer;
}

export function checkWorkers(now: number, onWorkerLost: (workerId: string) => void): void {
  for (const [workerId, worker] of tracked) {
    if (worker.announcedOnline && !isOnline(worker, now)) announce(workerId, now);
    if (!worker.isRecovered && now - worker.lastSeenAt >= LOST_THRESHOLD_MS) {
      worker.isRecovered = true;
      onWorkerLost(workerId);
    }
  }
}

export function resetWorkerStatus(): void {
  tracked.clear();
}
