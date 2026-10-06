import type { JobDTO } from '@caraoke/shared';
import { useEffect, useMemo, useState } from 'react';
import { useProcessingEstimateQuery } from '../../api/jobs';
import { estimateQueue, type QueueEta } from '../../lib/processingEstimate';

const REFRESH_MS = 15_000;

export function useQueueEta(jobs: JobDTO[]): QueueEta | null {
  const hasJobs = jobs.length > 0;
  const estimate = useProcessingEstimateQuery(hasJobs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasJobs) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [hasJobs, jobs]);

  return useMemo(
    () => (estimate.data && hasJobs ? estimateQueue(jobs, estimate.data, now) : null),
    [estimate.data, hasJobs, jobs, now],
  );
}
