import type { LyricsAvailability } from '@caraoke/shared';
import clsx from 'clsx';
import { useLyricsCheckQuery, type LyricsCheckParams } from '../../api/lyrics';

const BADGES: Record<Exclude<LyricsAvailability, 'UNKNOWN'>, { label: string; className: string }> = {
  SYNCED: { label: 'Letra sincronizada', className: 'bg-accent/15 text-accent' },
  PLAIN: { label: 'Só o texto da letra', className: 'bg-surface-2 text-text' },
  INSTRUMENTAL: { label: 'Instrumental', className: 'bg-surface-2 text-muted' },
  NONE: { label: 'Sem letra', className: 'bg-danger/15 text-danger' },
};

const BADGE_BASE = 'inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

export function LyricsBadge(props: LyricsCheckParams) {
  const check = useLyricsCheckQuery(props);

  if (check.isLoading) {
    return <span className={clsx(BADGE_BASE, 'bg-surface-2 text-muted')}>Verificando a letra…</span>;
  }
  if (!check.data || check.data === 'UNKNOWN') return null;

  const badge = BADGES[check.data];
  return <span className={clsx(BADGE_BASE, badge.className)}>{badge.label}</span>;
}
