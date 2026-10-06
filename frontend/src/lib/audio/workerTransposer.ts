import type { AudioBufferLike, Transposer } from './KaraokeEngine';
import type { PitchShiftRequest, PitchShiftResponse } from './pitchShift.worker';

interface Pending {
  resolve: (tracks: Float32Array[][]) => void;
  reject: (error: Error) => void;
}

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice());
}

function toAudioBuffer(context: BaseAudioContext, channels: Float32Array[], sampleRate: number): AudioBuffer {
  const buffer = context.createBuffer(channels.length, channels[0]?.length ?? 1, sampleRate);
  channels.forEach((channel, index) => buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index));
  return buffer;
}

export function createWorkerTransposer(context: unknown): Transposer {
  const audioContext = context as BaseAudioContext;
  const pending = new Map<number, Pending>();
  let worker: Worker | null = null;
  let nextId = 0;

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./pitchShift.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PitchShiftResponse>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if ('error' in event.data) request.reject(new Error(event.data.error));
      else request.resolve(event.data.tracks);
    };
    worker.onerror = () => {
      for (const request of pending.values()) request.reject(new Error('Falha ao mudar o tom'));
      pending.clear();
    };
    return worker;
  };

  return {
    async transpose(buffers: AudioBufferLike[], semitones: number): Promise<AudioBufferLike[]> {
      const sources = buffers as AudioBuffer[];
      const tracks = sources.map(channelsOf);
      const id = ++nextId;
      const shifted = await new Promise<Float32Array[][]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const message: PitchShiftRequest = { id, tracks, semitones };
        ensureWorker().postMessage(message, tracks.flat().map((channel) => channel.buffer));
      });
      return shifted.map((channels, index) =>
        toAudioBuffer(audioContext, channels, sources[index]?.sampleRate ?? audioContext.sampleRate),
      );
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const request of pending.values()) request.reject(new Error('Cancelado'));
      pending.clear();
    },
  };
}
