import type { JobStep, SongSource } from '@caraoke/shared';
import { FEATURE_MELODY } from '../../features.js';

export function stepsForSource(source: SongSource, includeMelody: boolean = FEATURE_MELODY): JobStep[] {
  const steps: JobStep[] = [];
  if (source === 'YOUTUBE') steps.push('DOWNLOAD');
  steps.push('SEPARATE', 'LYRICS', 'COVER');
  if (includeMelody) steps.push('MELODY');
  steps.push('FINALIZE');
  return steps;
}
