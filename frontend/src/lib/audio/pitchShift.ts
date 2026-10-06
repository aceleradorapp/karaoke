import { SimpleFilter, SoundTouch, type FrameSource } from 'soundtouchjs';

const CHUNK_FRAMES = 8192;

function interleavedSource(left: Float32Array, right: Float32Array): FrameSource {
  return {
    extract(target, numFrames, position) {
      const end = Math.min(left.length, position + numFrames);
      for (let frame = position, slot = 0; frame < end; frame++, slot += 2) {
        target[slot] = left[frame] ?? 0;
        target[slot + 1] = right[frame] ?? 0;
      }
      return Math.max(0, end - position);
    },
  };
}

function shiftPair(left: Float32Array, right: Float32Array, semitones: number): [Float32Array, Float32Array] {
  const length = left.length;
  const outLeft = new Float32Array(length);
  const outRight = new Float32Array(length);
  const pipe = new SoundTouch();
  pipe.pitchSemitones = semitones;
  pipe.tempo = 1;
  const filter = new SimpleFilter(interleavedSource(left, right), pipe);
  const chunk = new Float32Array(CHUNK_FRAMES * 2);

  let written = 0;
  while (written < length) {
    const extracted = filter.extract(chunk, CHUNK_FRAMES);
    if (extracted === 0) break;
    const usable = Math.min(extracted, length - written);
    for (let frame = 0; frame < usable; frame++, written++) {
      outLeft[written] = chunk[frame * 2] ?? 0;
      outRight[written] = chunk[frame * 2 + 1] ?? 0;
    }
  }
  return [outLeft, outRight];
}

export function shiftPitch(channels: Float32Array[], semitones: number): Float32Array[] {
  if (semitones === 0) return channels.map((channel) => channel.slice());
  const shifted: Float32Array[] = [];
  for (let index = 0; index < channels.length; index += 2) {
    const left = channels[index];
    const right = channels[index + 1];
    if (!left) continue;
    const [outLeft, outRight] = shiftPair(left, right ?? left, semitones);
    shifted.push(outLeft);
    if (right) shifted.push(outRight);
  }
  return shifted;
}
