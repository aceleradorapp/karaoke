import { shiftPitch } from './pitchShift';

export interface PitchShiftRequest {
  id: number;
  tracks: Float32Array[][];
  semitones: number;
}

export type PitchShiftResponse = { id: number; tracks: Float32Array[][] } | { id: number; error: string };

self.onmessage = (event: MessageEvent<PitchShiftRequest>) => {
  const { id, tracks, semitones } = event.data;
  try {
    const shifted = tracks.map((channels) => shiftPitch(channels, semitones));
    const transfer = shifted.flat().map((channel) => channel.buffer);
    self.postMessage({ id, tracks: shifted } satisfies PitchShiftResponse, { transfer });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : 'Falha ao mudar o tom';
    self.postMessage({ id, error } satisfies PitchShiftResponse);
  }
};
