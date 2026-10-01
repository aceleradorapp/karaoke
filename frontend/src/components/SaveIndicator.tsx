import type { SaveStatus } from '../lib/useAutoSave';

interface SaveIndicatorProps {
  status: SaveStatus;
  onRetry?: () => void;
}

export function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  return (
    <span aria-live="polite" className="inline-flex min-h-6 items-center text-sm text-muted">
      {status === 'saving' && 'Salvando…'}
      {status === 'saved' && 'Salvo ✓'}
      {status === 'error' && (
        <span className="text-danger">
          Não foi possível salvar ·{' '}
          <button type="button" onClick={onRetry} className="min-h-6 underline">
            Tentar de novo
          </button>
        </span>
      )}
    </span>
  );
}
