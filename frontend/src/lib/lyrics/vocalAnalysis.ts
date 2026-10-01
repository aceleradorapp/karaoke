export const HOP_SECONDS = 0.05;

const REFERENCE_PERCENTILE = 0.9;
const THRESHOLD_RATIO = 0.15;
const SUSTAIN_SECONDS = 0.5;
const SUSTAIN_MIN_FRACTION = 0.8;
const MIN_REFERENCE_LEVEL = 1e-4;
const DRAW_PERCENTILE = 0.97;

export interface ChannelSource {
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface VocalAnalysis {
  envelope: Float32Array;
  onset: number | null;
  duration: number;
}

function percentile(values: Float32Array, fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  const index = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
  return sorted[index] as number;
}

export function computeEnvelope(source: ChannelSource): Float32Array {
  const hop = Math.max(1, Math.round(source.sampleRate * HOP_SECONDS));
  const frames = Math.floor(source.getChannelData(0).length / hop);
  const channels = Array.from({ length: source.numberOfChannels }, (_, index) =>
    source.getChannelData(index),
  );
  const envelope = new Float32Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    const from = frame * hop;
    for (let position = from; position < from + hop; position++) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[position] as number;
      mixed /= channels.length;
      sum += mixed * mixed;
    }
    envelope[frame] = Math.sqrt(sum / hop);
  }
  return envelope;
}

export function findVocalOnset(envelope: Float32Array): number | null {
  const audible = envelope.filter((value) => value > MIN_REFERENCE_LEVEL);
  if (audible.length === 0) return null;
  const reference = percentile(audible, REFERENCE_PERCENTILE);

  const window = Math.max(1, Math.round(SUSTAIN_SECONDS / HOP_SECONDS));
  if (envelope.length < window) return null;

  const threshold = reference * THRESHOLD_RATIO;
  const required = window * SUSTAIN_MIN_FRACTION;
  let loudInWindow = 0;
  for (let index = 0; index < envelope.length; index++) {
    if ((envelope[index] as number) > threshold) loudInWindow++;
    if (index >= window && (envelope[index - window] as number) > threshold) loudInWindow--;
    if (index >= window - 1 && loudInWindow >= required) {
      let first = index - window + 1;
      while ((envelope[first] as number) <= threshold) first++;
      return first * HOP_SECONDS;
    }
  }
  return null;
}

export function normalizeForDrawing(envelope: Float32Array): Float32Array {
  const ceiling = percentile(envelope, DRAW_PERCENTILE);
  if (ceiling <= 0) return new Float32Array(envelope.length);
  return envelope.map((value) => Math.min(1, value / ceiling));
}

export function analyzeSamples(source: ChannelSource): VocalAnalysis {
  const envelope = computeEnvelope(source);
  return { envelope, onset: findVocalOnset(envelope), duration: envelope.length * HOP_SECONDS };
}

export async function analyzeVocals(url: string): Promise<VocalAnalysis> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar a voz (${response.status})`);
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return analyzeSamples(buffer);
  } finally {
    void context.close();
  }
}

export function offsetToAlignFirstLine(firstLineStart: number, onset: number): number {
  return Math.round((onset - firstLineStart) * 1000);
}
