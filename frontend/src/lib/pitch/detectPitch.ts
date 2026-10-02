import { PitchDetector } from 'pitchy';

const SILENCE_RMS = 0.01;
const MIN_CLARITY = 0.85;
const MIN_FREQUENCY_HZ = 70;
const MAX_FREQUENCY_HZ = 1100;
const A4_HZ = 440;
const A4_MIDI = 69;

export function rootMeanSquare(buffer: Float32Array): number {
  let sum = 0;
  for (const value of buffer) sum += value * value;
  return Math.sqrt(sum / buffer.length);
}

export function frequencyToMidi(frequency: number): number {
  return A4_MIDI + 12 * Math.log2(frequency / A4_HZ);
}

export function createPitchDetector(size: number): PitchDetector<Float32Array> {
  return PitchDetector.forFloat32Array(size);
}

export function detectMidi(
  buffer: Float32Array,
  sampleRate: number,
  detector: PitchDetector<Float32Array> = createPitchDetector(buffer.length),
): number | null {
  if (rootMeanSquare(buffer) < SILENCE_RMS) return null;
  const [frequency, clarity] = detector.findPitch(buffer, sampleRate);
  if (clarity < MIN_CLARITY || frequency < MIN_FREQUENCY_HZ || frequency > MAX_FREQUENCY_HZ) return null;
  return frequencyToMidi(frequency);
}
