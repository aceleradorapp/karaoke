import { describe, expect, it } from 'vitest';
import {
  HOP_SECONDS,
  analyzeSamples,
  computeEnvelope,
  findVocalOnset,
  normalizeForDrawing,
  offsetToAlignFirstLine,
  type ChannelSource,
} from './vocalAnalysis';

const RATE = 8000;

function source(parts: Array<[seconds: number, amplitude: number]>, channels = 1): ChannelSource {
  const total = parts.reduce((sum, [seconds]) => sum + Math.round(seconds * RATE), 0);
  const data = new Float32Array(total);
  let cursor = 0;
  for (const [seconds, amplitude] of parts) {
    const length = Math.round(seconds * RATE);
    for (let index = 0; index < length; index++) {
      data[cursor + index] = amplitude * Math.sin((2 * Math.PI * 220 * index) / RATE);
    }
    cursor += length;
  }
  return { numberOfChannels: channels, sampleRate: RATE, getChannelData: () => data };
}

describe('computeEnvelope', () => {
  it('produces one value per hop with the RMS level of the signal', () => {
    const envelope = computeEnvelope(source([[2, 0.5]]));
    expect(envelope).toHaveLength(Math.floor(2 / HOP_SECONDS));
    expect(envelope[0]).toBeCloseTo(0.5 / Math.SQRT2, 1);
  });

  it('returns an empty envelope for empty audio', () => {
    expect(computeEnvelope(source([]))).toHaveLength(0);
  });

  it('mixes stereo channels instead of reading only the first', () => {
    const left = new Float32Array(RATE).fill(1);
    const right = new Float32Array(RATE).fill(-1);
    const stereo: ChannelSource = {
      numberOfChannels: 2,
      sampleRate: RATE,
      getChannelData: (channel) => (channel === 0 ? left : right),
    };
    expect(computeEnvelope(stereo)[0]).toBeCloseTo(0, 5);
  });
});

describe('findVocalOnset', () => {
  it('finds where the voice starts after a silent intro', () => {
    const { onset } = analyzeSamples(
      source([
        [12, 0],
        [20, 0.4],
      ]),
    );
    expect(onset).toBeCloseTo(12, 1);
  });

  it('ignores leakage far below the voice level', () => {
    const { onset } = analyzeSamples(
      source([
        [10, 0.002],
        [20, 0.4],
      ]),
    );
    expect(onset).toBeCloseTo(10, 1);
  });

  it('ignores a short click before the voice', () => {
    const { onset } = analyzeSamples(
      source([
        [5, 0],
        [0.1, 0.8],
        [5, 0],
        [20, 0.4],
      ]),
    );
    expect(onset).toBeCloseTo(10.1, 1);
  });

  it('finds the voice even when it takes a small part of the song', () => {
    const { onset } = analyzeSamples(
      source([
        [100, 0],
        [10, 0.4],
        [100, 0],
      ]),
    );
    expect(onset).toBeCloseTo(100, 1);
  });

  it('returns null for silence and for an empty envelope', () => {
    expect(analyzeSamples(source([[10, 0]])).onset).toBeNull();
    expect(findVocalOnset(new Float32Array(0))).toBeNull();
  });

  it('reports the duration of the analyzed audio', () => {
    expect(analyzeSamples(source([[10, 0.3]])).duration).toBeCloseTo(10, 1);
  });
});

describe('normalizeForDrawing', () => {
  it('scales the loud parts to 1 and never exceeds it', () => {
    const normalized = normalizeForDrawing(Float32Array.from([0, 0.2, 0.4, 0.4, 0.4, 2]));
    expect(Math.max(...normalized)).toBe(1);
    expect(normalized[0]).toBe(0);
  });

  it('keeps silence flat', () => {
    expect(Array.from(normalizeForDrawing(new Float32Array(4)))).toEqual([0, 0, 0, 0]);
  });
});

describe('offsetToAlignFirstLine', () => {
  it('is positive when the voice starts after the first lyric line', () => {
    expect(offsetToAlignFirstLine(19.24, 34.65)).toBe(15410);
  });

  it('is negative when the voice starts before it', () => {
    expect(offsetToAlignFirstLine(20, 12.5)).toBe(-7500);
  });
});
