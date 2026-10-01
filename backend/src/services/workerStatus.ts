import type { WorkerStatus } from '@caraoke/shared';
import { emitToRoom } from '../realtime.js';

const ONLINE_THRESHOLD_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 5_000;

export interface WorkerHeartbeat {
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

let lastHeartbeat: WorkerHeartbeat | null = null;
let lastSeenAt: number | null = null;
let announcedOnline = false;

function isOnline(now: number): boolean {
  return lastSeenAt !== null && now - lastSeenAt < ONLINE_THRESHOLD_MS;
}

export function getWorkerInfo(now: number = Date.now()): WorkerInfo {
  return {
    online: isOnline(now),
    lastSeen: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    device: lastHeartbeat?.device ?? null,
    gpuName: lastHeartbeat?.gpuName ?? null,
    cudaAvailable: lastHeartbeat?.cudaAvailable ?? false,
    vramMb: lastHeartbeat?.vramMb ?? null,
    ytdlpVersion: lastHeartbeat?.ytdlpVersion ?? null,
  };
}

function announceStatus(now: number): void {
  const { online, device, gpuName } = getWorkerInfo(now);
  announcedOnline = online;
  emitToRoom('stage', 'worker:status', { online, device, gpuName });
}

export function recordHeartbeat(heartbeat: WorkerHeartbeat, now: number = Date.now()): void {
  const deviceChanged = lastHeartbeat?.device !== heartbeat.device;
  lastHeartbeat = heartbeat;
  lastSeenAt = now;
  if (!announcedOnline || deviceChanged) announceStatus(now);
}

export function startWorkerWatchdog(): NodeJS.Timeout {
  const timer = setInterval(() => {
    const now = Date.now();
    if (announcedOnline && !isOnline(now)) announceStatus(now);
  }, WATCHDOG_INTERVAL_MS);
  timer.unref();
  return timer;
}

export function resetWorkerStatus(): void {
  lastHeartbeat = null;
  lastSeenAt = null;
  announcedOnline = false;
}
