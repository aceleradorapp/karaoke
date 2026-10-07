import type { JobStep } from '@caraoke/shared';

export const STEP_LABELS: Record<JobStep, string> = {
  DOWNLOAD: 'Baixando',
  SEPARATE: 'Separando a voz',
  LYRICS: 'Buscando a letra',
  COVER: 'Buscando a capa',
  MELODY: 'Analisando a melodia',
  FINALIZE: 'Finalizando',
  RESYNC: 'Refazendo a sincronização da letra',
};

const MAX_RAW_ERROR_LENGTH = 140;

const ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/not available|unavailable/i, 'Vídeo indisponível no YouTube'],
  [/private video/i, 'O vídeo é privado'],
  [/confirm you.re not a bot/i, 'O YouTube pediu confirmação de login'],
  [/age.restricted|confirm your age/i, 'Vídeo com restrição de idade'],
  [/12 minutos/i, 'O vídeo tem mais de 12 minutos'],
  [/ffmpeg não encontrado/i, 'FFmpeg não está instalado no PC'],
  [/origem não foi encontrado/i, 'O arquivo original não foi encontrado'],
  [/interrompida várias vezes/i, 'Interrompida várias vezes'],
];

export function friendlyJobError(error: string | null): string {
  if (!error) return 'Falha desconhecida';
  const known = ERROR_PATTERNS.find(([pattern]) => pattern.test(error));
  if (known) return known[1];

  const firstLine = (error.split('\n')[0] ?? '').trim();
  return firstLine.length > MAX_RAW_ERROR_LENGTH ? `${firstLine.slice(0, MAX_RAW_ERROR_LENGTH)}…` : firstLine;
}
