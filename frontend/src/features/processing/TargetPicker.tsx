import type { JobDTO, ProcessingWorkerDTO } from '@caraoke/shared';

const ANY_MACHINE = '';

interface TargetPickerProps {
  job: JobDTO;
  workers: ProcessingWorkerDTO[];
  onChange: (targetWorkerId: string | null) => void;
}

export function TargetPicker({ job, workers, onChange }: TargetPickerProps) {
  const target = workers.find((worker) => worker.id === job.targetWorkerId);
  const isWaitingForOfflineMachine = target !== undefined && !target.online;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted">Processar em</span>
        <select
          value={job.targetWorkerId ?? ANY_MACHINE}
          onChange={(event) => onChange(event.target.value === ANY_MACHINE ? null : event.target.value)}
          aria-label={`Onde processar ${job.song.title}`}
          className="min-h-11 rounded-lg bg-surface-2 px-2 text-sm"
        >
          <option value={ANY_MACHINE}>Qualquer uma</option>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
              {worker.online ? '' : ' (desligada)'}
            </option>
          ))}
        </select>
      </label>
      {isWaitingForOfflineMachine && (
        <p role="status" className="text-xs text-danger">
          {target.name} está desligada: a música espera até ela ligar.
        </p>
      )}
    </div>
  );
}
