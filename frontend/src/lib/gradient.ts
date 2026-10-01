const HASH_MULTIPLIER = 31;
const HUE_RANGE = 360;
const HUE_SHIFT = 45;

export function coverGradient(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = (hash * HASH_MULTIPLIER + character.charCodeAt(0)) >>> 0;

  const hue = hash % HUE_RANGE;
  const secondHue = (hue + HUE_SHIFT) % HUE_RANGE;
  return `linear-gradient(135deg, hsl(${hue} 55% 38%), hsl(${secondHue} 60% 22%))`;
}
