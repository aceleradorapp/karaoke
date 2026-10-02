import { MicrophonePitch } from './microphone';

export interface LevelSample {
  time: number;
  level: number;
}

const BEEP_COUNT = 4;
const BEEP_INTERVAL_SEC = 0.8;
const BEEP_DURATION_SEC = 0.08;
const BEEP_FREQUENCY_HZ = 1000;
const FIRST_BEEP_DELAY_SEC = 0.5;
const SAMPLE_INTERVAL_MS = 5;
const MAX_LATENCY_SEC = 0.6;
const PEAK_RATIO = 0.5;
const MIN_PEAK_LEVEL = 0.02;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function estimateLatencyMs(emittedAt: number[], samples: LevelSample[]): number | null {
  const delays: number[] = [];
  for (const emitted of emittedAt) {
    const window = samples.filter(
      (sample) => sample.time >= emitted && sample.time <= emitted + MAX_LATENCY_SEC,
    );
    const peak = Math.max(0, ...window.map((sample) => sample.level));
    if (peak < MIN_PEAK_LEVEL) continue;
    const arrival = window.find((sample) => sample.level >= peak * PEAK_RATIO);
    if (arrival) delays.push(arrival.time - emitted);
  }
  if (delays.length < Math.ceil(emittedAt.length / 2)) return null;
  return Math.round(median(delays) * 1000);
}

export async function calibrateLatency(deviceId: string | null): Promise<number | null> {
  const context = new AudioContext({ latencyHint: 'interactive' });
  const microphone = await MicrophonePitch.open({ deviceId, createContext: () => context });
  const firstBeep = context.currentTime + FIRST_BEEP_DELAY_SEC;
  const emittedAt = Array.from({ length: BEEP_COUNT }, (_, index) => firstBeep + index * BEEP_INTERVAL_SEC);

  for (const time of emittedAt) {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = BEEP_FREQUENCY_HZ;
    oscillator.connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + BEEP_DURATION_SEC);
  }

  const samples: LevelSample[] = [];
  const lastTime = (emittedAt.at(-1) ?? firstBeep) + MAX_LATENCY_SEC;
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      samples.push({ time: context.currentTime, level: microphone.level() });
      if (context.currentTime >= lastTime) {
        clearInterval(timer);
        resolve();
      }
    }, SAMPLE_INTERVAL_MS);
  });

  microphone.close();
  return estimateLatencyMs(emittedAt, samples);
}
