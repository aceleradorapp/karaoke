import type { SongDTO } from '@caraoke/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KaraokeEngine } from '../../lib/audio/KaraokeEngine';
import { analyzeVocals, normalizeForDrawing } from '../../lib/lyrics/vocalAnalysis';

export type PreviewStatus = 'loading' | 'ready' | 'error';

export interface VoiceProfile {
  envelope: Float32Array;
  onset: number | null;
  duration: number;
}

export interface SyncPreview {
  status: PreviewStatus;
  error: string | null;
  isPlaying: boolean;
  voiceOn: boolean;
  duration: number;
  profile: VoiceProfile | null;
  getTime: () => number;
  togglePlay: () => void;
  playFrom: (seconds: number) => void;
  pause: () => void;
  seek: (seconds: number) => void;
  seekBy: (seconds: number) => void;
  toggleVoice: () => void;
}

export function useSyncPreview(song: SongDTO): SyncPreview {
  const engine = useRef<KaraokeEngine | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);

  useEffect(() => {
    const { instrumentalUrl, vocalsUrl } = song;
    if (!instrumentalUrl || !vocalsUrl) {
      setError('Esta música não tem a faixa de voz separada');
      setStatus('error');
      return;
    }

    let isCurrent = true;
    const instance = new KaraokeEngine();
    engine.current = instance;
    instance.onEnded = () => setIsPlaying(false);

    Promise.all([instance.load(instrumentalUrl, vocalsUrl), analyzeVocals(vocalsUrl)])
      .then(([, analysis]) => {
        if (!isCurrent) return;
        instance.setVoiceGuide(true);
        setDuration(instance.duration);
        setProfile({
          envelope: normalizeForDrawing(analysis.envelope),
          onset: analysis.onset,
          duration: analysis.duration,
        });
        setStatus('ready');
      })
      .catch((caught: unknown) => {
        if (!isCurrent) return;
        setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o áudio');
        setStatus('error');
      });

    return () => {
      isCurrent = false;
      instance.destroy();
      engine.current = null;
    };
  }, [song.instrumentalUrl, song.vocalsUrl]);

  const getTime = useCallback(() => engine.current?.currentTime ?? 0, []);

  const playFrom = useCallback((seconds: number) => {
    const instance = engine.current;
    if (!instance) return;
    instance.play(Math.max(0, seconds));
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    engine.current?.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    const instance = engine.current;
    if (!instance) return;
    if (instance.isPlaying) instance.pause();
    else instance.play();
    setIsPlaying(instance.isPlaying);
  }, []);

  const seek = useCallback((seconds: number) => engine.current?.seek(seconds), []);

  const seekBy = useCallback((seconds: number) => {
    const instance = engine.current;
    if (instance) instance.seek(instance.currentTime + seconds);
  }, []);

  const toggleVoice = useCallback(() => {
    const instance = engine.current;
    if (!instance) return;
    const next = !instance.voiceGuide;
    instance.setVoiceGuide(next);
    setVoiceOn(next);
  }, []);

  return {
    status,
    error,
    isPlaying,
    voiceOn,
    duration,
    profile,
    getTime,
    togglePlay,
    playFrom,
    pause,
    seek,
    seekBy,
    toggleVoice,
  };
}
