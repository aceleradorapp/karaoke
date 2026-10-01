import { describe, expect, it } from 'vitest';
import { stepsForSource } from './steps.js';

describe('stepsForSource', () => {
  it('includes the download step only for YouTube songs', () => {
    expect(stepsForSource('YOUTUBE', false)).toEqual(['DOWNLOAD', 'SEPARATE', 'LYRICS', 'COVER', 'FINALIZE']);
    expect(stepsForSource('UPLOAD', false)).toEqual(['SEPARATE', 'LYRICS', 'COVER', 'FINALIZE']);
  });

  it('adds the melody step when the feature is enabled', () => {
    expect(stepsForSource('UPLOAD', true)).toEqual(['SEPARATE', 'LYRICS', 'COVER', 'MELODY', 'FINALIZE']);
  });
});
