import type { SongDTO } from '@caraoke/shared';
import { buildJob } from './builders';

let songCounter = 0;

export function buildSong(overrides: Partial<SongDTO> = {}): SongDTO {
  songCounter += 1;
  return {
    id: `song${songCounter}`,
    title: `Música ${songCounter}`,
    artist: 'Artista',
    durationSec: 215,
    source: 'UPLOAD',
    youtubeId: null,
    status: 'READY',
    coverUrl: null,
    instrumentalUrl: `/media/song${songCounter}/instrumental.mp3`,
    vocalsUrl: `/media/song${songCounter}/voz.mp3`,
    lyricsUrl: null,
    melodyUrl: null,
    lyricsSource: 'NONE',
    lyricsNeedsReview: false,
    lyricsOffsetMs: 0,
    fillPercent: 100,
    playCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function buildProcessingSong(overrides: Partial<SongDTO> = {}): SongDTO {
  return buildSong({
    status: 'PROCESSING',
    instrumentalUrl: null,
    vocalsUrl: null,
    job: buildJob({ status: 'RUNNING', step: 'SEPARATE', progress: 40 }),
    ...overrides,
  });
}
