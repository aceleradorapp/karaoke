import type {
  ImportResultDTO,
  JobDTO,
  LyricsAvailability,
  LyricsCheckDTO,
  ProcessingEstimate,
  ProcessingWorkerDTO,
  SongListResponse,
  YoutubeSearchResult,
} from '@caraoke/shared';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ImportRequest {
  youtubeId: string;
  artist: string;
  title: string;
  durationSec?: number;
  targetWorkerId?: string;
}

export type SongOrder = 'recent' | 'title' | 'artist' | 'popular';

export class KaraokeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 60_000;
const UNAUTHORIZED = 401;

export class KaraokeApi {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly key: string,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  searchYoutube(term: string, limit: number): Promise<{ items: YoutubeSearchResult[] }> {
    return this.request('GET', `/api/youtube/search?${new URLSearchParams({ q: term, limit: String(limit) })}`);
  }

  async checkLyrics(artist: string, title: string, durationSec?: number): Promise<LyricsAvailability> {
    const params = new URLSearchParams({ artist, title });
    if (durationSec) params.set('duration', String(Math.round(durationSec)));
    return (await this.request<LyricsCheckDTO>('GET', `/api/lyrics/check?${params}`)).status;
  }

  listSongs(term: string | undefined, order: SongOrder, limit: number): Promise<SongListResponse> {
    const params = new URLSearchParams({ sort: order, limit: String(limit) });
    if (term) params.set('q', term);
    return this.request('GET', `/api/songs?${params}`);
  }

  importSong(song: ImportRequest): Promise<ImportResultDTO> {
    return this.request('POST', '/api/youtube/import', song);
  }

  async listJobs(scope: 'active' | 'recent'): Promise<JobDTO[]> {
    return (await this.request<{ items: JobDTO[] }>('GET', `/api/jobs?scope=${scope}`)).items;
  }

  estimate(): Promise<ProcessingEstimate> {
    return this.request('GET', '/api/jobs/estimate');
  }

  cancelJob(jobId: string): Promise<void> {
    return this.request('POST', `/api/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  async listWorkers(): Promise<ProcessingWorkerDTO[]> {
    return (await this.request<{ items: ProcessingWorkerDTO[] }>('GET', '/api/workers')).items;
  }

  reorderJobs(ids: string[]): Promise<{ ids: string[] }> {
    return this.request('PATCH', '/api/jobs/reorder', { ids });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new KaraokeApiError(
        `Não consegui falar com o karaokê em ${this.baseUrl}. Ele está ligado e na mesma rede?`,
        0,
      );
    }
    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } } | undefined)?.error?.message ?? `Erro ${response.status}`;
      const hint = response.status === UNAUTHORIZED ? ' Confira a CARAOKE_KEY (Configurações › IA).' : '';
      throw new KaraokeApiError(`${message}${hint}`, response.status);
    }
    return payload as T;
  }
}
