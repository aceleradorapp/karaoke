import type { JobDTO } from '@caraoke/shared';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Button } from '../../components/Button';
import { moveItem } from '../../lib/reorder';
import { JobRow } from './JobRow';

interface PendingListProps {
  jobs: JobDTO[];
  onReorder: (orderedIds: string[]) => void;
  onCancel: (job: JobDTO) => void;
}

const ICON_BUTTON_CLASSES = 'size-11 px-0';

export function PendingList({ jobs, onReorder, onCancel }: PendingListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function moveTo(jobId: string, targetIndex: number) {
    const fromIndex = jobs.findIndex((job) => job.id === jobId);
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    onReorder(moveItem(jobs, fromIndex, targetIndex).map((job) => job.id));
  }

  function handleDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (draggedId) moveTo(draggedId, targetIndex);
    setDraggedId(null);
  }

  return (
    <ul className="flex flex-col gap-2">
      {jobs.map((job, index) => (
        <li
          key={job.id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            setDraggedId(job.id);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, index)}
          onDragEnd={() => setDraggedId(null)}
          className={`rounded-2xl bg-surface p-3 transition ${draggedId === job.id ? 'opacity-50' : ''}`}
        >
          <JobRow
            job={job}
            leading={
              <GripVertical
                aria-hidden="true"
                className="hidden size-5 shrink-0 cursor-grab text-muted sm:block"
              />
            }
            actions={
              <>
                <Button
                  variant="ghost"
                  className={ICON_BUTTON_CLASSES}
                  aria-label={`Mover ${job.song.title} para cima`}
                  disabled={index === 0}
                  onClick={() => moveTo(job.id, index - 1)}
                >
                  <ArrowUp aria-hidden="true" className="size-5" />
                </Button>
                <Button
                  variant="ghost"
                  className={ICON_BUTTON_CLASSES}
                  aria-label={`Mover ${job.song.title} para baixo`}
                  disabled={index === jobs.length - 1}
                  onClick={() => moveTo(job.id, index + 1)}
                >
                  <ArrowDown aria-hidden="true" className="size-5" />
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onCancel(job)}
                  aria-label={`Cancelar ${job.song.title}`}
                >
                  <X aria-hidden="true" className="size-5" />
                  Cancelar
                </Button>
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}
