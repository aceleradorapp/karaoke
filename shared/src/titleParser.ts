export interface ParsedTitle {
  artist: string;
  title: string;
}

const STRONG_NOISE_WORDS = new Set([
  'karaoke',
  'instrumental',
  'playback',
  'backing',
  'official',
  'oficial',
  'video',
  'videoclipe',
  'clipe',
  'lyric',
  'lyrics',
  'letra',
  'legendado',
  'audio',
  'hd',
  '4k',
  'version',
  'versao',
]);

const FILLER_NOISE_WORDS = new Set([
  'music',
  'musica',
  'track',
  'com',
  'sem',
  'with',
  'no',
  'vocal',
  'vocals',
  'and',
  'e',
  'a',
]);

const CHANNEL_SUFFIX_PATTERNS = [/\s*-\s*topic$/i, /vevo$/i, /\s+(official|oficial)$/i];
const SEGMENT_SEPARATOR = /\s+[-–—|]\s+/;
const BRACKET_GROUP = /[([{][^)\]}]*[)\]}]/g;

function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isNoise(text: string): boolean {
  const words = text.split(/\s+/).map(normalizeWord).filter(Boolean);
  const onlyKnownWords = words.every((word) => STRONG_NOISE_WORDS.has(word) || FILLER_NOISE_WORDS.has(word));
  const hasStrongWord = words.some((word) => STRONG_NOISE_WORDS.has(word));
  return onlyKnownWords && hasStrongWord;
}

function removeNoiseGroups(title: string): string {
  return title.replace(BRACKET_GROUP, (group) => (isNoise(group.slice(1, -1)) ? '' : group));
}

function cleanChannel(channel: string): string {
  const cleaned = CHANNEL_SUFFIX_PATTERNS.reduce(
    (name, pattern) => name.replace(pattern, ''),
    channel,
  ).trim();
  const looksLikeKaraokeChannel = cleaned
    .split(/\s+/)
    .some((word) => normalizeWord(word).startsWith('karaok'));
  return looksLikeKaraokeChannel ? '' : cleaned;
}

export function parseYoutubeTitle(rawTitle: string, channel = ''): ParsedTitle {
  const withoutNoiseGroups = removeNoiseGroups(rawTitle).replace(/\s+/g, ' ').trim();
  const segments = withoutNoiseGroups
    .split(SEGMENT_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !isNoise(segment));

  const [first, second, ...rest] = segments;
  if (first && second) return { artist: first, title: [second, ...rest].join(' - ') };
  return { artist: cleanChannel(channel), title: first ?? rawTitle.trim() };
}
