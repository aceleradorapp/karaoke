export interface MelodyDoc {
  version: number;
  step: number;
  start: number;
  midi: Array<number | null>;
}

const MIN_SCORED_FRAMES = 50;
const GENEROUS_RAW_CEILING = 0.8;
const CURVE_EXPONENT = 0.8;
const SEMITONES_PER_OCTAVE = 12;

export function semitoneDistance(sung: number, target: number): number {
  const difference = (sung - target) % SEMITONES_PER_OCTAVE;
  return Math.abs(((difference + 18) % SEMITONES_PER_OCTAVE) - 6);
}

export function pointsFor(distance: number): number {
  if (distance <= 0.5) return 1;
  if (distance <= 1) return 0.75;
  if (distance <= 2) return 0.35;
  return 0;
}

export class PitchScorer {
  private total = 0;
  private points = 0;

  constructor(
    private readonly reference: MelodyDoc,
    private readonly latencySec: number,
  ) {}

  referenceAt(time: number, keyShift = 0): number | null {
    const index = Math.round((time - this.latencySec - this.reference.start) / this.reference.step);
    const note = this.reference.midi[index];
    return note == null ? null : note + keyShift;
  }

  add(time: number, sung: number | null, keyShift = 0): void {
    const target = this.referenceAt(time, keyShift);
    if (target == null) return;
    this.total += 1;
    if (sung == null) return;
    this.points += pointsFor(semitoneDistance(sung, target));
  }

  get score(): number | null {
    if (this.total < MIN_SCORED_FRAMES) return null;
    const raw = this.points / this.total;
    return Math.round(Math.min(1, raw / GENEROUS_RAW_CEILING) ** CURVE_EXPONENT * 100);
  }

  get live(): number {
    return this.score ?? 0;
  }
}
