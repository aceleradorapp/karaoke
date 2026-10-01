import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  WEB_DEV_PORT: z.coerce.number().int().positive().default(5173),
  STORAGE_DIR: z.string().default('./storage'),
  WORKER_TOKEN: z.string().min(16),
  API_URL: z.string().url().default('http://127.0.0.1:3333'),
  YTDLP_PATH: z.string().default('./worker/.venv/Scripts/yt-dlp.exe'),
  PYTHON_PATH: z.string().default('./worker/.venv/Scripts/python.exe'),
  LRCLIB_USER_AGENT: z.string().default('caraoke-michael/0.1 (personal use)'),
});

function resolveFromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value);
}

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment (.env):\n${problems.join('\n')}`);
  }
  const env = parsed.data;
  return {
    ...env,
    STORAGE_DIR: resolveFromRoot(env.STORAGE_DIR),
    YTDLP_PATH: resolveFromRoot(env.YTDLP_PATH),
    PYTHON_PATH: resolveFromRoot(env.PYTHON_PATH),
  };
}

export const env = loadEnv();
