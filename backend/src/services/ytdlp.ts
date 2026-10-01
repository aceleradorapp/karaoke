import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../env.js';
import { AppError } from '../utils/errors.js';

const execFileAsync = promisify(execFile);

const SEARCH_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const BAD_GATEWAY = 502;

export interface YtdlpSearchEntry {
  id?: string;
  title?: string;
  channel?: string | null;
  uploader?: string | null;
  duration?: number | null;
  live_status?: string | null;
}

interface YtdlpSearchResponse {
  entries?: YtdlpSearchEntry[];
}

function searchFailed(): AppError {
  return new AppError(
    'YOUTUBE_SEARCH_FAILED',
    'Falha na busca do YouTube. Tente atualizar o yt-dlp nas configurações.',
    BAD_GATEWAY,
  );
}

export async function searchYoutubeEntries(query: string, limit: number): Promise<YtdlpSearchEntry[]> {
  const args = [
    `ytsearch${limit}:${query}`,
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
  ];

  try {
    const { stdout } = await execFileAsync(env.YTDLP_PATH, args, {
      timeout: SEARCH_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    const response = JSON.parse(stdout) as YtdlpSearchResponse;
    return response.entries ?? [];
  } catch {
    throw searchFailed();
  }
}
