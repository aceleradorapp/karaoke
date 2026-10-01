import type { LyricsSource, SongSource } from '@caraoke/shared';

export const LYRICS_LABELS: Record<LyricsSource, string> = {
  NONE: 'Não encontrada',
  LRCLIB: 'Sincronizada (LRCLIB)',
  PLAIN: 'Sem sincronia (só o texto)',
  ALIGNED: 'Alinhada com a voz',
  TRANSCRIBED: 'Transcrita por IA (vale revisar)',
  MANUAL: 'Editada manualmente',
};

export const SOURCE_LABELS: Record<SongSource, string> = {
  YOUTUBE: 'YouTube',
  UPLOAD: 'Arquivo enviado',
};

export function describePlayCount(count: number): string {
  if (count === 0) return 'Ainda não foi cantada';
  return count === 1 ? 'Cantada 1 vez' : `Cantada ${count} vezes`;
}
