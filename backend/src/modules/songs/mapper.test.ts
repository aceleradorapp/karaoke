import type { Job, Song } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toJobDTO, toSongDTO } from './mapper.js';

const UPDATED_AT = new Date('2026-10-01T12:00:00.000Z');

function buildSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song1',
    title: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    durationSec: null,
    source: 'YOUTUBE',
    youtubeId: 'abc123',
    originalFilename: null,
    status: 'QUEUED',
    hasInstrumental: false,
    hasVocals: false,
    hasCover: false,
    hasMelody: false,
    lyricsSource: 'NONE',
    lyricsNeedsReview: false,
    lyricsNotice: null,
    lyricsOffsetMs: 0,
    fillPercent: 100,
    keyShift: 0,
    playCount: 0,
    addedById: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job1',
    songId: 'song1',
    kind: 'PROCESS',
    status: 'PENDING',
    step: null,
    progress: 0,
    message: null,
    position: 1,
    sourcePath: null,
    device: null,
    workerId: null,
    targetWorkerId: null,
    error: null,
    attempts: 0,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe('toSongDTO', () => {
  it('has no media urls for a song that is still queued', () => {
    const dto = toSongDTO(buildSong());
    expect(dto).toMatchObject({
      coverUrl: null,
      instrumentalUrl: null,
      vocalsUrl: null,
      lyricsUrl: null,
      melodyUrl: null,
    });
    expect(dto).not.toHaveProperty('job');
  });

  it('builds media urls from the files that exist', () => {
    const dto = toSongDTO(
      buildSong({
        hasCover: true,
        hasInstrumental: true,
        hasVocals: true,
        hasMelody: true,
        lyricsSource: 'LRCLIB',
      }),
    );
    const version = UPDATED_AT.getTime();
    expect(dto.coverUrl).toBe(`/media/song1/capa.jpg?v=${version}`);
    expect(dto.instrumentalUrl).toBe('/media/song1/instrumental.mp3');
    expect(dto.vocalsUrl).toBe('/media/song1/voz.mp3');
    expect(dto.lyricsUrl).toBe(`/media/song1/letra.json?v=${version}`);
    expect(dto.melodyUrl).toBe('/media/song1/melodia.json');
  });

  it('serializes dates as ISO strings and includes the job when informed', () => {
    const dto = toSongDTO(buildSong(), buildJob({ status: 'RUNNING', progress: 40 }));
    expect(dto.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect(dto.job).toMatchObject({ status: 'RUNNING', progress: 40 });
  });

  it('keeps an explicit null job', () => {
    expect(toSongDTO(buildSong(), null).job).toBeNull();
  });
});

describe('toJobDTO', () => {
  it('summarizes the song and serializes dates', () => {
    const dto = toJobDTO(buildJob({ startedAt: UPDATED_AT }), buildSong({ hasCover: true }));
    expect(dto.startedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(dto.finishedAt).toBeNull();
    expect(dto.song).toEqual({
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      coverUrl: `/media/song1/capa.jpg?v=${UPDATED_AT.getTime()}`,
      durationSec: null,
    });
  });
});
