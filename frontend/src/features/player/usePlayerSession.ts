import type { SongDTO } from '@caraoke/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFinishPerformanceMutation, useStartPerformanceMutation } from '../../api/performances';
import { KaraokeEngine } from '../../lib/audio/KaraokeEngine';

export type PlayerPhase = 'choosing' | 'loading' | 'playing' | 'finished' | 'error';

const COMPLETED_FRACTION = 0.9;
const MAX_LYRICS_OFFSET_MS = 5000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface PlayerSession {
  phase: PlayerPhase;
  error: string | null;
  isPlaying: boolean;
  voiceGuide: boolean;
  hasVocals: boolean;
  volume: number;
  duration: number;
  liveOffsetMs: number;
  getTime: () => number;
  start: (singerId: string) => Promise<void>;
  restart: () => Promise<void>;
  togglePlay: () => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  toggleVoiceGuide: () => void;
  changeVolumeBy: (delta: number) => void;
  setVolume: (volume: number) => void;
  adjustLyricsOffset: (deltaMs: number) => void;
  hasSungForAWhile: () => boolean;
  stop: () => void;
}

export function usePlayerSession(song: SongDTO): PlayerSession {
  const engine = useRef<KaraokeEngine | null>(null);
  const performanceId = useRef<string | null>(null);
  const singerId = useRef<string | null>(null);
  const voiceGuideUsed = useRef(false);
  const volumeRef = useRef(1);
  const startPerformance = useStartPerformanceMutation();
  const finishPerformance = useFinishPerformanceMutation();

  const [phase, setPhase] = useState<PlayerPhase>('choosing');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceGuide, setVoiceGuide] = useState(false);
  const [hasVocals, setHasVocals] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [duration, setDuration] = useState(0);
  const [liveOffsetMs, setLiveOffsetMs] = useState(0);

  const getTime = useCallback(() => engine.current?.currentTime ?? 0, []);

  const closePerformance = useCallback(() => {
    const id = performanceId.current;
    const instance = engine.current;
    if (!id || !instance) return;

    performanceId.current = null;
    const completed = instance.duration > 0 && instance.currentTime >= COMPLETED_FRACTION * instance.duration;
    finishPerformance.mutate({ id, completed, voiceGuideUsed: voiceGuideUsed.current, pitchScore: null });
  }, [finishPerformance]);

  const closePerformanceRef = useRef(closePerformance);
  closePerformanceRef.current = closePerformance;

  useEffect(
    () => () => {
      closePerformanceRef.current();
      engine.current?.destroy();
      engine.current = null;
    },
    [],
  );

  const beginPerformance = useCallback(
    async (instance: KaraokeEngine, profileId: string) => {
      const { id } = await startPerformance.mutateAsync({ profileId, songId: song.id });
      performanceId.current = id;
      voiceGuideUsed.current = false;
      instance.setVoiceGuide(false);
      setVoiceGuide(false);
      instance.play(0);
      setIsPlaying(true);
      setPhase('playing');
    },
    [song.id, startPerformance],
  );

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    closePerformanceRef.current();
    setPhase('finished');
  }, []);

  const start = useCallback(
    async (profileId: string) => {
      if (!song.instrumentalUrl) {
        setError('Esta música não tem o áudio instrumental');
        setPhase('error');
        return;
      }

      singerId.current = profileId;
      setPhase('loading');
      setError(null);
      const instance = new KaraokeEngine();
      engine.current = instance;
      instance.onEnded = handleEnded;

      try {
        await instance.load(song.instrumentalUrl, song.vocalsUrl);
        setDuration(instance.duration);
        setHasVocals(instance.hasVocals);
        await beginPerformance(instance, profileId);
      } catch (caught) {
        instance.destroy();
        engine.current = null;
        setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar a música');
        setPhase('error');
      }
    },
    [song.instrumentalUrl, song.vocalsUrl, handleEnded, beginPerformance],
  );

  const restart = useCallback(async () => {
    const instance = engine.current;
    const profileId = singerId.current;
    if (!instance || !profileId) return;

    setPhase('loading');
    try {
      await beginPerformance(instance, profileId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível reiniciar a música');
      setPhase('error');
    }
  }, [beginPerformance]);

  const togglePlay = useCallback(() => {
    const instance = engine.current;
    if (!instance) return;
    if (instance.isPlaying) instance.pause();
    else instance.play();
    setIsPlaying(instance.isPlaying);
  }, []);

  const seekTo = useCallback((seconds: number) => engine.current?.seek(seconds), []);

  const seekBy = useCallback((seconds: number) => {
    const instance = engine.current;
    if (instance) instance.seek(instance.currentTime + seconds);
  }, []);

  const toggleVoiceGuide = useCallback(() => {
    const instance = engine.current;
    if (!instance?.hasVocals) return;
    const next = !instance.voiceGuide;
    instance.setVoiceGuide(next);
    if (next) voiceGuideUsed.current = true;
    setVoiceGuide(next);
  }, []);

  const setVolume = useCallback((value: number) => {
    const next = clamp(Math.round(value * 100) / 100, 0, 1);
    volumeRef.current = next;
    engine.current?.setVolume(next);
    setVolumeState(next);
  }, []);

  const changeVolumeBy = useCallback((delta: number) => setVolume(volumeRef.current + delta), [setVolume]);

  const adjustLyricsOffset = useCallback((deltaMs: number) => {
    setLiveOffsetMs((current) => clamp(current + deltaMs, -MAX_LYRICS_OFFSET_MS, MAX_LYRICS_OFFSET_MS));
  }, []);

  const hasSungForAWhile = useCallback(() => getTime() > 5, [getTime]);

  const stop = useCallback(() => {
    closePerformance();
    engine.current?.destroy();
    engine.current = null;
    setIsPlaying(false);
  }, [closePerformance]);

  return {
    phase,
    error,
    isPlaying,
    voiceGuide,
    hasVocals,
    volume,
    duration,
    liveOffsetMs,
    getTime,
    start,
    restart,
    togglePlay,
    seekBy,
    seekTo,
    toggleVoiceGuide,
    changeVolumeBy,
    setVolume,
    adjustLyricsOffset,
    hasSungForAWhile,
    stop,
  };
}
