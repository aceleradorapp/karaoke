import fs from 'node:fs/promises';
import type { HealthCheck, HealthReport, HealthStatus } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { storagePaths } from '../../services/storage.js';
import { getWorkerInfo } from '../../services/workerStatus.js';

const CACHE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERNET_URL = 'https://www.gstatic.com/generate_204';
const LYRICS_URL = 'https://lrclib.net/api/search?q=evidencias';
const INTERNET_TIMEOUT_MS = 4000;
const LYRICS_TIMEOUT_MS = 6000;
const GB = 1024 ** 3;
const DISK_WARNING_BYTES = 5 * GB;
const DISK_ERROR_BYTES = 1 * GB;
const MAX_ERROR_LENGTH = 160;
const SEVERITY: Record<HealthStatus, number> = { ok: 0, warning: 1, error: 2 };

const STEP_LABELS: Record<string, string> = {
  DOWNLOAD: 'baixar do YouTube',
  SEPARATE: 'separar a voz',
  LYRICS: 'buscar a letra',
  COVER: 'buscar a capa',
  MELODY: 'extrair a melodia',
  FINALIZE: 'finalizar',
};

export interface HealthProbes {
  reach: (url: string, timeoutMs: number) => Promise<boolean>;
  freeBytes: (dir: string) => Promise<number>;
  now: () => number;
}

async function reachUrl(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

async function freeBytesOf(dir: string): Promise<number> {
  const stats = await fs.statfs(dir);
  return stats.bavail * stats.bsize;
}

export const defaultProbes: HealthProbes = { reach: reachUrl, freeBytes: freeBytesOf, now: Date.now };

let cached: { report: HealthReport; at: number } | null = null;

export function clearHealthCache(): void {
  cached = null;
}

function check(
  id: string,
  label: string,
  status: HealthStatus,
  message: string,
  hint: string | null = null,
): HealthCheck {
  return { id, label, status, message, hint };
}

export function shortError(error: string | null): string {
  const firstLine = (error ?? '').split('\n')[0]?.trim() ?? '';
  const withoutPrefix = firstLine.replace(/^[A-Za-z]+Error:\s*/, '');
  return withoutPrefix.length > MAX_ERROR_LENGTH
    ? `${withoutPrefix.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : withoutPrefix;
}

function formatGb(bytes: number): string {
  return `${(bytes / GB).toFixed(1).replace('.', ',')} GB`;
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return check('database', 'Banco de dados', 'ok', 'Respondendo normalmente.');
  } catch {
    return check(
      'database',
      'Banco de dados',
      'error',
      'O banco de dados não responde.',
      'Abra o XAMPP e ligue o MySQL. Depois reinicie o sistema.',
    );
  }
}

function checkWorker(now: number): HealthCheck {
  const worker = getWorkerInfo(now);
  if (worker.online) {
    const device = worker.device === 'cpu' || !worker.device ? 'CPU' : 'GPU';
    return check('worker', 'Processador de músicas', 'ok', `Ligado, usando a ${device}.`);
  }
  return check(
    'worker',
    'Processador de músicas',
    'error',
    'O processador de músicas está desligado: as músicas novas não serão preparadas.',
    'Reinicie o sistema (Configurações → Sistema). Se continuar, veja as mensagens na janela "Karaoke - sistema".',
  );
}

function checkInternet(isOnline: boolean): HealthCheck {
  return isOnline
    ? check('internet', 'Internet', 'ok', 'Conectado.')
    : check(
        'internet',
        'Internet',
        'error',
        'Sem internet: a busca no YouTube, as letras e as capas não funcionam.',
        'Confira o Wi-Fi ou o cabo do PC e o roteador. As músicas que já estão prontas continuam funcionando.',
      );
}

async function checkLyrics(isReachable: boolean, since: Date): Promise<HealthCheck> {
  const unreachable = await prisma.song.count({
    where: { lyricsNotice: 'SITE_UNREACHABLE', updatedAt: { gte: since } },
  });
  if (!isReachable) {
    return check(
      'lyrics',
      'Site das letras (LRCLIB)',
      'warning',
      'O site das letras não respondeu: as músicas novas podem ficar sem letra.',
      'Pode ser só uma instabilidade do site. Tente de novo mais tarde; dá para colar a letra pela página da música.',
    );
  }
  if (unreachable > 0) {
    return check(
      'lyrics',
      'Site das letras (LRCLIB)',
      'warning',
      `Respondendo agora, mas ${unreachable} ${unreachable === 1 ? 'música ficou' : 'músicas ficaram'} sem letra nas últimas 24 h porque o site não respondeu.`,
      'Abra essas músicas e use "Buscar a letra de novo".',
    );
  }
  return check('lyrics', 'Site das letras (LRCLIB)', 'ok', 'Respondendo normalmente.');
}

async function checkYoutube(since: Date, now: number): Promise<HealthCheck> {
  const failures = await prisma.job.findMany({
    where: { status: 'FAILED', step: 'DOWNLOAD', finishedAt: { gte: since } },
    orderBy: { finishedAt: 'desc' },
    select: { error: true },
  });
  const version = getWorkerInfo(now).ytdlpVersion;
  if (failures.length > 0) {
    return check(
      'youtube',
      'YouTube',
      'warning',
      `${failures.length} ${failures.length === 1 ? 'download falhou' : 'downloads falharam'} nas últimas 24 h. Último erro: ${shortError(failures[0]?.error ?? null)}`,
      'O YouTube muda com frequência: use "Atualizar yt-dlp" em Configurações → Processamento e tente de novo.',
    );
  }
  return check(
    'youtube',
    'YouTube',
    'ok',
    version ? `Downloads funcionando (yt-dlp ${version}).` : 'Nenhuma falha recente.',
  );
}

async function checkDisk(probes: HealthProbes): Promise<HealthCheck> {
  try {
    const free = await probes.freeBytes(storagePaths.root);
    if (free < DISK_ERROR_BYTES) {
      return check(
        'disk',
        'Espaço em disco',
        'error',
        `Quase sem espaço: ${formatGb(free)} livres. As músicas novas podem falhar.`,
        'Apague músicas que não usa mais ou libere espaço no disco do PC.',
      );
    }
    if (free < DISK_WARNING_BYTES) {
      return check(
        'disk',
        'Espaço em disco',
        'warning',
        `Pouco espaço: ${formatGb(free)} livres.`,
        'Cada música ocupa cerca de 15 MB. Considere apagar músicas antigas.',
      );
    }
    return check('disk', 'Espaço em disco', 'ok', `${formatGb(free)} livres.`);
  } catch {
    return check('disk', 'Espaço em disco', 'warning', 'Não foi possível medir o espaço livre.');
  }
}

async function checkRecentFailures(since: Date): Promise<HealthCheck> {
  const failures = await prisma.job.findMany({
    where: { status: 'FAILED', finishedAt: { gte: since }, NOT: { step: 'DOWNLOAD' } },
    orderBy: { finishedAt: 'desc' },
    select: { step: true, error: true },
  });
  if (failures.length === 0) {
    return check('failures', 'Processamento', 'ok', 'Nenhuma falha nas últimas 24 h.');
  }
  const byStep = new Map<string, { count: number; error: string | null }>();
  for (const failure of failures) {
    const key = failure.step ?? 'FINALIZE';
    const current = byStep.get(key);
    byStep.set(key, { count: (current?.count ?? 0) + 1, error: current?.error ?? failure.error });
  }
  const summary = [...byStep.entries()]
    .map(
      ([step, { count, error }]) =>
        `${STEP_LABELS[step] ?? step}: ${count} (último erro: ${shortError(error)})`,
    )
    .join(' · ');
  return check(
    'failures',
    'Processamento',
    'warning',
    `${failures.length} ${failures.length === 1 ? 'música falhou' : 'músicas falharam'} nas últimas 24 h. ${summary}`,
    'Veja a fila de processamento: dá para tentar de novo cada música. Se repetir, reinicie o sistema.',
  );
}

export function worstStatus(checks: HealthCheck[]): HealthStatus {
  return checks.reduce<HealthStatus>(
    (worst, item) => (SEVERITY[item.status] > SEVERITY[worst] ? item.status : worst),
    'ok',
  );
}

export async function buildHealthReport(probes: HealthProbes = defaultProbes): Promise<HealthReport> {
  const now = probes.now();
  const since = new Date(now - DAY_MS);
  const [hasInternet, hasLyricsSite] = await Promise.all([
    probes.reach(INTERNET_URL, INTERNET_TIMEOUT_MS),
    probes.reach(LYRICS_URL, LYRICS_TIMEOUT_MS),
  ]);
  const checks = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkWorker(now)),
    Promise.resolve(checkInternet(hasInternet)),
    checkLyrics(hasLyricsSite, since),
    checkYoutube(since, now),
    checkDisk(probes),
    checkRecentFailures(since),
  ]);
  return {
    status: worstStatus(checks),
    checkedAt: new Date(now).toISOString(),
    checks,
    canRestart: process.env.CARAOKE_SUPERVISED === '1',
    mode: env.NODE_ENV === 'production' ? 'festa' : 'dev',
  };
}

export async function getHealthReport(
  isFresh: boolean,
  probes: HealthProbes = defaultProbes,
): Promise<HealthReport> {
  const now = probes.now();
  if (!isFresh && cached && now - cached.at < CACHE_MS) return cached.report;
  const report = await buildHealthReport(probes);
  cached = { report, at: now };
  return report;
}
