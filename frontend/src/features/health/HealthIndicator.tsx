import { Link } from 'react-router';
import { useHealthReportQuery } from '../../api/health';
import { StatusIcon } from './HealthPage';

export function HealthIndicator() {
  const report = useHealthReportQuery();
  const status = report.data?.status;
  if (!status || status === 'ok') return null;

  const problems = report.data?.checks.filter((check) => check.status !== 'ok').length ?? 0;
  return (
    <Link
      to="/saude"
      aria-label={`Saúde do sistema: ${problems} ${problems === 1 ? 'aviso' : 'avisos'}`}
      title="Algo precisa de atenção: veja a Saúde do sistema"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
    >
      <StatusIcon status={status} className="size-6" />
    </Link>
  );
}
