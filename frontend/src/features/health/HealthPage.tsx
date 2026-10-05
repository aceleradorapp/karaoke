import type { HealthCheck, HealthStatus } from '@caraoke/shared';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useCheckHealthNowMutation, useHealthReportQuery } from '../../api/health';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { RestartButton } from './RestartButton';

const STATUS_TEXT: Record<HealthStatus, string> = {
  ok: 'Tudo funcionando',
  warning: 'Funcionando, com avisos',
  error: 'Há problemas que precisam de atenção',
};

export function StatusIcon({ status, className }: { status: HealthStatus; className?: string }) {
  if (status === 'ok')
    return <CheckCircle2 aria-hidden="true" className={clsx('text-emerald-500', className)} />;
  if (status === 'warning')
    return <AlertTriangle aria-hidden="true" className={clsx('text-amber-500', className)} />;
  return <XCircle aria-hidden="true" className={clsx('text-danger', className)} />;
}

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-surface p-4">
      <StatusIcon status={check.status} className="mt-0.5 size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold">{check.label}</p>
        <p className="text-base break-words">{check.message}</p>
        {check.hint && check.status !== 'ok' && (
          <p className="mt-1 text-sm text-muted">
            <strong>O que fazer:</strong> {check.hint}
          </p>
        )}
      </div>
    </li>
  );
}

export function HealthPage() {
  const report = useHealthReportQuery();
  const checkNow = useCheckHealthNowMutation();
  const data = report.data;
  const sorted = data
    ? [...data.checks].sort((a, b) => Number(a.status === 'ok') - Number(b.status === 'ok'))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl sm:text-5xl">Saúde do sistema</h1>
        <Button variant="secondary" onClick={() => checkNow.mutate()} isLoading={checkNow.isPending}>
          <RefreshCw aria-hidden="true" className="size-5" />
          Verificar agora
        </Button>
      </div>

      {report.isLoading && <Spinner className="mx-auto size-10" />}
      {report.isError && (
        <p role="alert" className="text-danger">
          Não foi possível verificar o sistema. Se a página não carrega, o servidor pode estar desligado.
        </p>
      )}

      {data && (
        <>
          <section aria-label="Resumo" className="flex items-center gap-3 rounded-2xl bg-surface p-4">
            <StatusIcon status={data.status} className="size-8 shrink-0" />
            <div>
              <p className="text-xl font-semibold">{STATUS_TEXT[data.status]}</p>
              <p className="text-sm text-muted">
                Verificado às{' '}
                {new Date(data.checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{' '}
                · modo {data.mode === 'festa' ? 'festa' : 'de desenvolvimento'}
              </p>
            </div>
          </section>

          <ul aria-label="Verificações" className="flex flex-col gap-2">
            {sorted.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>

          <section aria-label="Reiniciar" className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-6">
            <h2 className="text-2xl font-semibold">Reiniciar</h2>
            <RestartButton canRestart={data.canRestart} />
          </section>
        </>
      )}
    </div>
  );
}
