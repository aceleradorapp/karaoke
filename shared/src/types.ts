export type SongSource = 'YOUTUBE' | 'UPLOAD';

export type SongStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR';

export type LyricsSource = 'NONE' | 'LRCLIB' | 'PLAIN' | 'ALIGNED' | 'TRANSCRIBED' | 'MANUAL';

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELED';

export type JobStep = 'DOWNLOAD' | 'SEPARATE' | 'LYRICS' | 'COVER' | 'MELODY' | 'FINALIZE';

export interface ProfileDTO {
  id: string;
  name: string;
  avatar: string;
  theme: string;
  isGuest: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export interface JobDTO {
  id: string;
  songId: string;
  status: JobStatus;
  step: JobStep | null;
  progress: number;
  message: string | null;
  position: number;
  device: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  song: {
    title: string;
    artist: string;
    coverUrl: string | null;
  };
}

export interface SongDTO {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  source: SongSource;
  youtubeId: string | null;
  status: SongStatus;
  coverUrl: string | null;
  instrumentalUrl: string | null;
  vocalsUrl: string | null;
  lyricsUrl: string | null;
  melodyUrl: string | null;
  lyricsSource: LyricsSource;
  lyricsNeedsReview: boolean;
  lyricsOffsetMs: number;
  playCount: number;
  createdAt: string;
  job?: JobDTO | null;
  isFavorite?: boolean;
}

export type ProcessingDevice = 'auto' | 'gpu' | 'cpu';
export type DemucsModel = 'htdemucs' | 'htdemucs_ft';
export type WhisperModel = 'base' | 'small' | 'medium';
export type ScoringMode = 'pitch+audience' | 'pitch' | 'audience' | 'off';

export interface AppSettings {
  'processing.device': ProcessingDevice;
  'processing.demucsModel': DemucsModel;
  'processing.whisperModel': WhisperModel;
  'processing.autoAlign': boolean;
  'scoring.mode': ScoringMode;
  'scoring.audienceWeight': number;
  'scoring.voteSeconds': number;
  'scoring.micLatencyMs': number;
  'scoring.micDeviceId': string | null;
  'ui.defaultTheme': string;
}

export interface SingerSummary {
  name: string;
  avatar: string;
}

export interface VotingSummary {
  performanceId: string;
  singer: SingerSummary;
  song: { title: string; artist: string };
  endsAt: string;
}

export interface FinalScore {
  performanceId: string;
  pitchScore: number | null;
  audienceScore: number | null;
  finalScore: number | null;
  votes: number;
}

export interface WorkerStatus {
  online: boolean;
  device: string | null;
  gpuName: string | null;
}

export interface YoutubeSearchResult {
  youtubeId: string;
  title: string;
  channel: string;
  durationSec: number;
  thumbnailUrl: string;
  suggested: { artist: string; title: string };
  existingSongId: string | null;
}

export interface ImportResultDTO {
  song: SongDTO;
  alreadyExists: boolean;
}
