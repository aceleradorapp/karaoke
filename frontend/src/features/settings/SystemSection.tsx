import { Activity } from 'lucide-react';
import { Link } from 'react-router';
import { useHealthReportQuery } from '../../api/health';
import { RestartButton } from '../health/RestartButton';
import { StatusIcon } from '../health/HealthPage';
import { SettingsSection } from './fields';

export function SystemSection() {
  const report = useHealthReportQuery();
  const status = report.data?.status;

  return (
    <SettingsSection title="Sistema">
      <Link
        to="/saude"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-surface-2 px-4 font-semibold"
      >
        {status ? (
          <StatusIcon status={status} className="size-5" />
        ) : (
          <Activity aria-hidden="true" className="size-5" />
        )}
        Saúde do sistema
      </Link>
      <RestartButton canRestart={report.data?.canRestart ?? false} />
    </SettingsSection>
  );
}
