import type { LyricsSource } from './types.js';

export interface LyricWord {
  start: number;
  end: number;
  text: string;
}

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  words?: LyricWord[];
}

export interface LyricsDoc {
  version: 1;
  source: LyricsSource;
  synced: boolean;
  language?: string;
  lines: LyricLine[];
}

const LAST_LINE_DURATION_SECONDS = 4;
const TIMESTAMP_PATTERN = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LEADING_TIMESTAMPS_PATTERN = /^(?:\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/;
const OFFSET_TAG_PATTERN = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const CENTISECONDS_PER_SECOND = 100;

interface TimedEntry {
  start: number;
  text: string;
}

function roundToCentiseconds(seconds: number): number {
  return Math.round(seconds * CENTISECONDS_PER_SECOND) / CENTISECONDS_PER_SECOND;
}

function toSeconds(minutes: string, seconds: string, fraction: string | undefined): number {
  const fractionSeconds = fraction ? Number(`0.${fraction}`) : 0;
  return Number(minutes) * SECONDS_PER_MINUTE + Number(seconds) + fractionSeconds;
}

function readOffsetSeconds(content: string): number {
  for (const rawLine of content.split(/\r?\n/)) {
    const match = OFFSET_TAG_PATTERN.exec(rawLine);
    if (match?.[1]) return Number(match[1]) / MILLISECONDS_PER_SECOND;
  }
  return 0;
}

function readTimedEntries(content: string, offsetSeconds: number): TimedEntry[] {
  const entries: TimedEntry[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const prefix = LEADING_TIMESTAMPS_PATTERN.exec(rawLine)?.[0];
    if (!prefix) continue;

    const text = rawLine.slice(prefix.length).trim();
    for (const match of prefix.matchAll(TIMESTAMP_PATTERN)) {
      const start = toSeconds(match[1] ?? '0', match[2] ?? '0', match[3]) - offsetSeconds;
      entries.push({ start: Math.max(0, start), text });
    }
  }

  return entries.sort((a, b) => a.start - b.start);
}

export function parseLrc(content: string): LyricLine[] {
  const entries = readTimedEntries(content, readOffsetSeconds(content));
  const lines: LyricLine[] = [];

  entries.forEach((entry, index) => {
    if (!entry.text) return;
    const next = entries[index + 1];
    const end = next ? next.start : entry.start + LAST_LINE_DURATION_SECONDS;
    lines.push({
      start: roundToCentiseconds(entry.start),
      end: roundToCentiseconds(Math.max(end, entry.start)),
      text: entry.text,
    });
  });

  return lines;
}

const CENTISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * CENTISECONDS_PER_SECOND;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTimestamp(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) * CENTISECONDS_PER_SECOND);
  const minutes = Math.floor(total / CENTISECONDS_PER_MINUTE);
  const wholeSeconds = Math.floor((total % CENTISECONDS_PER_MINUTE) / CENTISECONDS_PER_SECOND);
  const centiseconds = total % CENTISECONDS_PER_SECOND;
  return `${twoDigits(minutes)}:${twoDigits(wholeSeconds)}.${twoDigits(centiseconds)}`;
}

export function toLrc(lines: LyricLine[]): string {
  return lines.map((line) => `[${formatTimestamp(line.start)}]${line.text}`).join('\n');
}

export function lyricsFromLrc(content: string, source: LyricsSource, language?: string): LyricsDoc {
  return { version: 1, source, synced: true, ...(language ? { language } : {}), lines: parseLrc(content) };
}

export function lyricsFromPlainText(text: string, source: LyricsSource = 'PLAIN'): LyricsDoc {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ start: 0, end: 0, text: line }));
  return { version: 1, source, synced: false, lines };
}
