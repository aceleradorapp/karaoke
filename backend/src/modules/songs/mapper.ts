import type { Job, Song } from '@prisma/client';
import type { JobDTO, SongDTO } from '@caraoke/shared';
import { workerLabel } from '../../services/workerNames.js';

type SongSummary = Pick<Song, 'id' | 'title' | 'artist' | 'hasCover' | 'updatedAt' | 'durationSec'>;

const MEDIA_PREFIX = '/media';

function mediaUrl(songId: string, filename: string, version?: Date): string {
  const suffix = version ? `?v=${version.getTime()}` : '';
  return `${MEDIA_PREFIX}/${songId}/${filename}${suffix}`;
}

export function coverUrlOf(song: SongSummary): string | null {
  return song.hasCover ? mediaUrl(song.id, 'capa.jpg', song.updatedAt) : null;
}

export function toJobDTO(job: Job, song: SongSummary): JobDTO {
  return {
    id: job.id,
    songId: job.songId,
    status: job.status,
    step: job.step,
    progress: job.progress,
    message: job.message,
    position: job.position,
    device: job.device,
    workerId: job.workerId,
    workerName: workerLabel(job.workerId),
    targetWorkerId: job.targetWorkerId,
    targetWorkerName: workerLabel(job.targetWorkerId),
    error: job.error,
    attempts: job.attempts,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    song: { title: song.title, artist: song.artist, coverUrl: coverUrlOf(song), durationSec: song.durationSec },
  };
}

export function toSongDTO(song: Song, job?: Job | null, isFavorite?: boolean): SongDTO {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    durationSec: song.durationSec,
    source: song.source,
    youtubeId: song.youtubeId,
    status: song.status,
    coverUrl: coverUrlOf(song),
    instrumentalUrl: song.hasInstrumental ? mediaUrl(song.id, 'instrumental.mp3') : null,
    vocalsUrl: song.hasVocals ? mediaUrl(song.id, 'voz.mp3') : null,
    lyricsUrl: song.lyricsSource === 'NONE' ? null : mediaUrl(song.id, 'letra.json', song.updatedAt),
    melodyUrl: song.hasMelody ? mediaUrl(song.id, 'melodia.json') : null,
    lyricsSource: song.lyricsSource,
    lyricsNeedsReview: song.lyricsNeedsReview,
    lyricsNotice: (song.lyricsNotice as SongDTO['lyricsNotice']) ?? null,
    lyricsOffsetMs: song.lyricsOffsetMs,
    fillPercent: song.fillPercent,
    keyShift: song.keyShift,
    playCount: song.playCount,
    createdAt: song.createdAt.toISOString(),
    ...(job !== undefined ? { job: job ? toJobDTO(job, song) : null } : {}),
    ...(isFavorite !== undefined ? { isFavorite } : {}),
  };
}
