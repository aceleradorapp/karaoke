import { THEMES } from '@caraoke/shared';
import { useHealthQuery } from '../../api/health';
import { useSystemInfoQuery } from '../../api/system';
import { applyTheme } from '../../lib/theme';
import { workerLabel } from './workerLabel';

function serverLabel(isLoading: boolean, isError: boolean, version?: string): string {
  if (isLoading) return 'Verificando o servidor…';
  if (isError) return 'Servidor indisponível';
  return `Servidor online · v${version}`;
}

interface StatusLineProps {
  isOk: boolean;
  label: string;
}

function StatusLine({ isOk, label }: StatusLineProps) {
  return (
    <p
      role="status"
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface px-4 py-4 text-base sm:text-lg"
    >
      <span aria-hidden="true" className={`size-3 rounded-full ${isOk ? 'bg-accent' : 'bg-muted'}`} />
      {label}
    </p>
  );
}

export function HealthPage() {
  const health = useHealthQuery();
  const system = useSystemInfoQuery();
  const isServerOnline = Boolean(health.data) && !health.isError;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="mb-2 font-display text-5xl text-primary sm:text-6xl">Karaokê</h1>

      <StatusLine
        isOk={isServerOnline}
        label={serverLabel(health.isLoading, health.isError, health.data?.version)}
      />
      <StatusLine isOk={Boolean(system.data?.worker.online)} label={workerLabel(system.data?.worker)} />

      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => applyTheme(theme.id)}
            className="min-h-11 rounded-lg bg-surface-2 px-4 text-base hover:bg-primary hover:text-primary-contrast"
          >
            {theme.name}
          </button>
        ))}
      </div>
    </main>
  );
}
