import type {
  AppSettings,
  FinalScore,
  JobDTO,
  PlayerStateDTO,
  SingQueueResponse,
  SongDTO,
  VotingSummary,
  WorkerStatus,
} from './types.js';

export const SOCKET_EVENTS = {
  jobUpdated: 'job:updated',
  jobsReordered: 'jobs:reordered',
  songUpdated: 'song:updated',
  songDeleted: 'song:deleted',
  singQueueChanged: 'singQueue:changed',
  profilesChanged: 'profiles:changed',
  playerState: 'player:state',
  competitionChanged: 'competition:changed',
  systemRestarting: 'system:restarting',
  voteOpen: 'vote:open',
  voteProgress: 'vote:progress',
  scoreFinal: 'score:final',
  settingsUpdated: 'settings:updated',
  accessChanged: 'access:changed',
  workerStatus: 'worker:status',
} as const;

export const SOCKET_ACCESS_DENIED_MESSAGE = 'ACCESS_DENIED';

export const SOCKET_ROOMS = {
  stage: 'stage',
  mobile: 'mobile',
} as const;

export type SocketRoom = (typeof SOCKET_ROOMS)[keyof typeof SOCKET_ROOMS];

export interface ServerToClientEvents {
  'job:updated': (job: JobDTO) => void;
  'jobs:reordered': (payload: { ids: string[] }) => void;
  'song:updated': (song: SongDTO) => void;
  'song:deleted': (payload: { id: string }) => void;
  'singQueue:changed': (queue: SingQueueResponse) => void;
  'profiles:changed': () => void;
  'player:state': (state: PlayerStateDTO | null) => void;
  'competition:changed': (payload: { id: string }) => void;
  'system:restarting': () => void;
  'vote:open': (voting: VotingSummary) => void;
  'vote:progress': (payload: { performanceId: string; count: number }) => void;
  'score:final': (score: FinalScore) => void;
  'settings:updated': (settings: AppSettings) => void;
  'access:changed': () => void;
  'worker:status': (status: WorkerStatus) => void;
}

export type ClientToServerEvents = Record<string, never>;

export interface SocketHandshakeAuth {
  client: 'stage' | 'mobile';
  code?: string;
}
