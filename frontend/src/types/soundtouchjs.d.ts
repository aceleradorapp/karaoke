declare module 'soundtouchjs' {
  export interface FrameSource {
    extract(target: Float32Array, numFrames: number, position: number): number;
  }

  export class SoundTouch {
    pitchSemitones: number;
    tempo: number;
  }

  export class SimpleFilter {
    constructor(source: FrameSource, pipe: SoundTouch);
    extract(target: Float32Array, numFrames: number): number;
  }
}
