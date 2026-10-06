import { describe, expect, it } from 'vitest';
import { shiftPitch } from './pitchShift';

const SAMPLE_RATE = 44100;
const SECONDS = 2;

function tone(frequency: number): Float32Array {
  return Float32Array.from({ length: SAMPLE_RATE * SECONDS }, (_, index) =>
    0.4 * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE),
  );
}

function frequencyOf(channel: Float32Array | undefined): number {
  if (!channel) return 0;
  const from = SAMPLE_RATE / 2;
  const to = from + SAMPLE_RATE;
  let crossings = 0;
  for (let index = from + 1; index < to; index++) {
    if ((channel[index - 1] ?? 0) < 0 && (channel[index] ?? 0) >= 0) crossings += 1;
  }
  return crossings;
}

describe('shiftPitch', () => {
  it('raises the pitch by the semitones asked for, keeping the length', () => {
    const [left, right] = shiftPitch([tone(220), tone(220)], 12);

    expect(left).toHaveLength(SAMPLE_RATE * SECONDS);
    expect(right).toHaveLength(SAMPLE_RATE * SECONDS);
    expect(frequencyOf(left)).toBeGreaterThanOrEqual(438);
    expect(frequencyOf(left)).toBeLessThanOrEqual(442);
  });

  it('lowers the pitch of a mono track', () => {
    const shifted = shiftPitch([tone(440)], -5);

    expect(shifted).toHaveLength(1);
    expect(frequencyOf(shifted[0])).toBeGreaterThanOrEqual(328);
    expect(frequencyOf(shifted[0])).toBeLessThanOrEqual(332);
  });

  it('returns a copy when there is nothing to shift', () => {
    const original = tone(220);
    const [copy] = shiftPitch([original], 0);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
  });
});
