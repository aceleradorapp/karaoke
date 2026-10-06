const INSTRUMENTAL_HINTS = [
  'karaoke',
  'karaoque',
  'instrumental',
  'playback',
  'sem voz',
  'backing track',
  'minus one',
  'base musical',
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function looksWithoutVoice(title: string): boolean {
  const normalized = normalize(title);
  return INSTRUMENTAL_HINTS.some((hint) => normalized.includes(hint));
}
