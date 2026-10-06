import { useQueryClient } from '@tanstack/react-query';
import type { AppSettings, SongDTO } from '@caraoke/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../../api/client';
import { SETTINGS_QUERY_KEY } from '../../api/settings';
import { MicrophonePitch } from '../../lib/pitch/microphone';
import { PitchScorer, type MelodyDoc } from '../../lib/pitch/PitchScorer';

const SAMPLE_INTERVAL_MS = 20;
const DISPLAY_INTERVAL_MS = 200;
const MS_PER_SECOND = 1000;

export interface PitchReading {
  liveScore: number;
  target: number | null;
  sung: number | null;
}

export interface PitchScoring {
  isActive: boolean;
  reading: PitchReading;
  prepare: () => Promise<void>;
  begin: (getTime: () => number, isPlaying: () => boolean, getKeyShift?: () => number) => void;
  finish: () => number | null;
  release: () => void;
}

const EMPTY_READING: PitchReading = { liveScore: 0, target: null, sung: null };

async function fetchMelody(url: string): Promise<MelodyDoc> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Melodia indisponível (${response.status})`);
  return (await response.json()) as MelodyDoc;
}

function usesPitch(settings: AppSettings): boolean {
  const mode = settings['scoring.mode'];
  return mode === 'pitch' || mode === 'pitch+audience';
}

export function usePitchScoring(song: SongDTO): PitchScoring {
  const queryClient = useQueryClient();
  const microphone = useRef<MicrophonePitch | null>(null);
  const melody = useRef<MelodyDoc | null>(null);
  const latencySec = useRef(0);
  const scorer = useRef<PitchScorer | null>(null);
  const latest = useRef<PitchReading>(EMPTY_READING);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [reading, setReading] = useState<PitchReading>(EMPTY_READING);

  const stopTimers = useCallback(() => {
    for (const timer of timers.current) clearInterval(timer);
    timers.current = [];
  }, []);

  const release = useCallback(() => {
    stopTimers();
    microphone.current?.close();
    microphone.current = null;
    setIsActive(false);
  }, [stopTimers]);

  useEffect(() => release, [release]);

  const prepare = useCallback(async () => {
    if (!song.melodyUrl || microphone.current) return;
    try {
      const settings = await queryClient.ensureQueryData({
        queryKey: SETTINGS_QUERY_KEY,
        queryFn: () => apiGet<AppSettings>('/settings'),
      });
      if (!usesPitch(settings)) return;
      const [loadedMelody, openedMicrophone] = await Promise.all([
        fetchMelody(song.melodyUrl),
        MicrophonePitch.open({ deviceId: settings['scoring.micDeviceId'] }),
      ]);
      melody.current = loadedMelody;
      microphone.current = openedMicrophone;
      latencySec.current = settings['scoring.micLatencyMs'] / MS_PER_SECOND;
      setIsActive(true);
    } catch {
      setIsActive(false);
    }
  }, [song.melodyUrl, queryClient]);

  const begin = useCallback(
    (getTime: () => number, isPlaying: () => boolean, getKeyShift: () => number = () => 0) => {
      stopTimers();
      const currentMicrophone = microphone.current;
      if (!currentMicrophone || !melody.current) return;
      const currentScorer = new PitchScorer(melody.current, latencySec.current);
      scorer.current = currentScorer;
      latest.current = EMPTY_READING;
      setReading(EMPTY_READING);

      timers.current.push(
        setInterval(() => {
          if (!isPlaying()) return;
          const time = getTime();
          const sung = currentMicrophone.sample();
          const keyShift = getKeyShift();
          currentScorer.add(time, sung, keyShift);
          latest.current = { liveScore: currentScorer.live, target: currentScorer.referenceAt(time, keyShift), sung };
        }, SAMPLE_INTERVAL_MS),
        setInterval(() => setReading(latest.current), DISPLAY_INTERVAL_MS),
      );
    },
    [stopTimers],
  );

  const finish = useCallback(() => {
    stopTimers();
    return scorer.current?.score ?? null;
  }, [stopTimers]);

  return { isActive, reading, prepare, begin, finish, release };
}
