import { describe, expect, it, vi } from 'vitest';
import { estimateLatencyMs, type LevelSample } from './calibration';
import { detectMidi, frequencyToMidi } from './detectPitch';
import { listMicrophones, MicrophonePitch } from './microphone';
import { PitchScorer, pointsFor, semitoneDistance, type MelodyDoc } from './PitchScorer';

const SAMPLE_RATE = 44100;
const SIZE = 2048;
const STEP = 0.02;

function sine(frequency: number, amplitude = 0.4): Float32Array {
  const buffer = new Float32Array(SIZE);
  for (let index = 0; index < SIZE; index += 1) {
    buffer[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return buffer;
}

function noise(): Float32Array {
  let seed = 7;
  const buffer = new Float32Array(SIZE);
  for (let index = 0; index < SIZE; index += 1) {
    seed = (seed * 16807) % 2147483647;
    buffer[index] = (seed / 2147483647 - 0.5) * 0.8;
  }
  return buffer;
}

function melody(notes: Array<number | null>): MelodyDoc {
  return { version: 1, step: STEP, start: 0, midi: notes };
}

function sing(scorer: PitchScorer, frames: number, sung: (index: number) => number | null, latency = 0) {
  for (let index = 0; index < frames; index += 1) scorer.add(index * STEP + latency, sung(index));
}

const FRAMES = 500;
const A3 = 57;

describe('detectMidi', () => {
  it('finds the note of a clear tone', () => {
    expect(detectMidi(sine(220), SAMPLE_RATE)).toBeCloseTo(A3, 0);
    expect(detectMidi(sine(440), SAMPLE_RATE)).toBeCloseTo(69, 0);
  });

  it('ignores silence, noise and frequencies outside the human voice', () => {
    expect(detectMidi(sine(220, 0.001), SAMPLE_RATE)).toBeNull();
    expect(detectMidi(noise(), SAMPLE_RATE)).toBeNull();
    expect(detectMidi(sine(50), SAMPLE_RATE)).toBeNull();
    expect(detectMidi(sine(1500), SAMPLE_RATE)).toBeNull();
  });

  it('converts frequencies to MIDI notes', () => {
    expect(frequencyToMidi(440)).toBe(69);
    expect(frequencyToMidi(880)).toBe(81);
  });
});

describe('semitoneDistance', () => {
  it('ignores the octave, so children and adults are judged the same way', () => {
    expect(semitoneDistance(A3 + 12, A3)).toBe(0);
    expect(semitoneDistance(A3 - 24, A3)).toBe(0);
    expect(semitoneDistance(A3 + 1, A3)).toBe(1);
    expect(semitoneDistance(A3 + 11, A3)).toBe(1);
    expect(semitoneDistance(A3 + 6, A3)).toBe(6);
  });

  it('gives full points within a quarter of a tone and less as it goes off', () => {
    expect(pointsFor(0.4)).toBe(1);
    expect(pointsFor(1)).toBe(0.75);
    expect(pointsFor(1.8)).toBe(0.35);
    expect(pointsFor(3)).toBe(0);
  });
});

describe('PitchScorer', () => {
  const reference = () => melody(Array.from({ length: FRAMES }, () => A3));

  it('gives about 100 to someone singing in tune, even an octave above', () => {
    const scorer = new PitchScorer(reference(), 0);
    sing(scorer, FRAMES, () => A3 + 12.2);
    expect(scorer.score).toBe(100);
  });

  it('is generous with someone a whole semitone off', () => {
    const scorer = new PitchScorer(reference(), 0);
    sing(scorer, FRAMES, () => A3 + 1);
    expect(scorer.score).toBe(95);
  });

  it('gives a low score to random notes', () => {
    const scorer = new PitchScorer(reference(), 0);
    sing(scorer, FRAMES, (index) => A3 + ((index * 7) % 12));
    expect(scorer.score).toBeLessThan(45);
  });

  it('gives zero to silence where the original voice sings', () => {
    const scorer = new PitchScorer(reference(), 0);
    sing(scorer, FRAMES, () => null);
    expect(scorer.score).toBe(0);
  });

  it('does not count the parts where the original has no voice', () => {
    const notes = Array.from({ length: FRAMES }, (_, index) => (index % 2 === 0 ? A3 : null));
    const scorer = new PitchScorer(melody(notes), 0);
    sing(scorer, FRAMES, (index) => (index % 2 === 0 ? A3 : A3 + 6));
    expect(scorer.score).toBe(100);
  });

  it('has no score with less than one second of voice in the original', () => {
    const scorer = new PitchScorer(melody(Array.from({ length: 49 }, () => A3)), 0);
    sing(scorer, 49, () => A3);
    expect(scorer.score).toBeNull();
    expect(scorer.live).toBe(0);
  });

  it('compares with what the original sang a moment earlier, to cover the microphone delay', () => {
    const notes = Array.from({ length: FRAMES }, (_, index) => A3 + (Math.floor(index / 25) % 2) * 5);
    const late = new PitchScorer(melody(notes), 0.15);
    const ignoringDelay = new PitchScorer(melody(notes), 0);
    const sungLate = (index: number) => notes[index] ?? null;

    sing(late, FRAMES, sungLate, 0.15);
    sing(ignoringDelay, FRAMES, sungLate, 0.15);

    expect(late.score).toBe(100);
    expect(ignoringDelay.score ?? 0).toBeLessThan(100);
    expect(late.referenceAt(0.15)).toBe(A3);
  });
});

describe('MicrophonePitch', () => {
  function fakeContext() {
    const analyser = {
      fftSize: 0,
      getFloatTimeDomainData: vi.fn((buffer: Float32Array) => buffer.set(sine(220))),
    };
    const source = { connect: vi.fn() };
    return {
      analyser,
      source,
      context: {
        sampleRate: SAMPLE_RATE,
        createAnalyser: () => analyser,
        createMediaStreamSource: vi.fn(() => source),
        close: vi.fn(() => Promise.resolve()),
      },
    };
  }

  it('opens the chosen microphone without the filters that distort the voice, and reads notes', async () => {
    const fake = fakeContext();
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream));

    const microphone = await MicrophonePitch.open({
      deviceId: 'mic-2',
      mediaDevices: { getUserMedia },
      createContext: () => fake.context as unknown as AudioContext,
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'mic-2' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(fake.source.connect).toHaveBeenCalledWith(fake.analyser);
    expect(microphone.sample()).toBeCloseTo(A3, 0);
    expect(microphone.level()).toBeGreaterThan(0.2);

    microphone.close();
    expect(track.stop).toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('lists only the microphones, naming the ones without a label', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'a', label: 'USB Mic' },
      { kind: 'audiooutput', deviceId: 'b', label: 'Speakers' },
      { kind: 'audioinput', deviceId: 'c', label: '' },
    ] as MediaDeviceInfo[];

    const list = await listMicrophones({ enumerateDevices: () => Promise.resolve(devices) });

    expect(list).toEqual([
      { deviceId: 'a', label: 'USB Mic' },
      { deviceId: 'c', label: 'Microfone 2' },
    ]);
  });
});

describe('estimateLatencyMs', () => {
  function recording(emittedAt: number[], delaySec: number, peak = 0.3): LevelSample[] {
    const samples: LevelSample[] = [];
    for (let time = 0; time < 5; time += 0.005) {
      const isBeep = emittedAt.some(
        (emitted) => time >= emitted + delaySec && time < emitted + delaySec + 0.08,
      );
      samples.push({ time, level: isBeep ? peak : 0.005 });
    }
    return samples;
  }

  it('measures how long the microphone takes to hear the beeps', () => {
    const beeps = [0.5, 1.3, 2.1, 2.9];
    expect(estimateLatencyMs(beeps, recording(beeps, 0.18))).toBeGreaterThanOrEqual(175);
    expect(estimateLatencyMs(beeps, recording(beeps, 0.18))).toBeLessThanOrEqual(185);
  });

  it('gives up when the beeps were not heard', () => {
    const beeps = [0.5, 1.3, 2.1, 2.9];
    expect(estimateLatencyMs(beeps, recording(beeps, 0.18, 0.01))).toBeNull();
  });
});
