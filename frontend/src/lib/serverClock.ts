import type { PlayerStateDTO } from '@caraoke/shared';
import { apiGet } from '../api/client';

const SAMPLES = 8;
const MS_PER_SECOND = 1000;

export async function measureClockOffset(
  fetchTime: () => Promise<{ now: number }> = () => apiGet<{ now: number }>('/system/time'),
  clock: () => number = Date.now,
  samples: number = SAMPLES,
): Promise<number> {
  const offsets: Array<{ offset: number; roundTrip: number }> = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const sentAt = clock();
    const { now } = await fetchTime();
    const receivedAt = clock();
    offsets.push({ offset: now - (sentAt + receivedAt) / 2, roundTrip: receivedAt - sentAt });
  }
  offsets.sort((a, b) => a.roundTrip - b.roundTrip);
  return offsets[0]?.offset ?? 0;
}

export function positionAt(state: PlayerStateDTO, clockOffsetMs: number, now: number = Date.now()): number {
  if (!state.playing) return state.position;
  return state.position + (now + clockOffsetMs - state.at) / MS_PER_SECOND;
}
