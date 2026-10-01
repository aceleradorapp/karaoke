import { env } from '../env.js';
import { AppError } from '../utils/errors.js';
import { runCommand } from './commands.js';

const SEARCH_TIMEOUT_MS = 25_000;
const VERSION_TIMEOUT_MS = 15_000;
const UPDATE_TIMEOUT_MS = 3 * 60 * 1000;
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
    const stdout = await runCommand(env.YTDLP_PATH, args, { timeoutMs: SEARCH_TIMEOUT_MS });
    const response = JSON.parse(stdout) as YtdlpSearchResponse;
    return response.entries ?? [];
  } catch {
    throw searchFailed();
  }
}

export async function updateYtdlp(): Promise<string> {
  try {
    await runCommand(env.PYTHON_PATH, ['-m', 'pip', 'install', '-U', 'yt-dlp'], {
      timeoutMs: UPDATE_TIMEOUT_MS,
    });
    const version = await runCommand(env.YTDLP_PATH, ['--version'], { timeoutMs: VERSION_TIMEOUT_MS });
    return version.trim();
  } catch {
    throw new AppError('YTDLP_UPDATE_FAILED', 'Não foi possível atualizar o yt-dlp', BAD_GATEWAY);
  }
}
