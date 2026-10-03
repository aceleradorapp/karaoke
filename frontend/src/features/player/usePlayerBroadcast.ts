import type { PlayerEffectState, PlayerStateInput } from '@caraoke/shared';
import { useEffect, useRef } from 'react';
import { apiSend } from '../../api/client';

const CHECK_INTERVAL_MS = 500;
const HEARTBEAT_MS = 5000;
const JUMP_TOLERANCE_SEC = 0.4;
const MS_PER_SECOND = 1000;

export interface BroadcastSnapshot {
  songId: string;
  singer: { name: string; avatar: string } | null;
  isActive: boolean;
  isPlaying: boolean;
  offsetMs: number;
  effect: PlayerEffectState;
  getTime: () => number;
}

interface LastSent {
  position: number;
  playing: boolean;
  offsetMs: number;
  effectKey: string;
  sentAt: number;
}

function send(body: PlayerStateInput): void {
  void apiSend('POST', '/player/state', body).catch(() => undefined);
}

export function usePlayerBroadcast(snapshot: BroadcastSnapshot): void {
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const lastSent = useRef<LastSent | null>(null);

  useEffect(() => {
    if (!snapshot.isActive) return;

    const check = () => {
      const current = latest.current;
      const now = Date.now();
      const position = current.getTime();
      const effectKey = JSON.stringify(current.effect);
      const previous = lastSent.current;
      const expected = previous
        ? previous.position + (previous.playing ? (now - previous.sentAt) / MS_PER_SECOND : 0)
        : null;
      const hasChanged =
        !previous ||
        previous.playing !== current.isPlaying ||
        previous.offsetMs !== current.offsetMs ||
        previous.effectKey !== effectKey ||
        Math.abs(position - (expected ?? position)) > JUMP_TOLERANCE_SEC ||
        now - previous.sentAt >= HEARTBEAT_MS;
      if (!hasChanged) return;

      lastSent.current = {
        position,
        playing: current.isPlaying,
        offsetMs: current.offsetMs,
        effectKey,
        sentAt: now,
      };
      send({
        songId: current.songId,
        singer: current.singer,
        position,
        playing: current.isPlaying,
        offsetMs: current.offsetMs,
        effect: current.effect,
      });
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      lastSent.current = null;
      send({ stopped: true });
    };
  }, [snapshot.isActive]);
}
