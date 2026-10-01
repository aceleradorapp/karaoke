import { describe, expect, it } from 'vitest';
import { lyricsFromLrc, lyricsFromPlainText, parseLrc, toLrc } from './lyrics.js';

const SAMPLE_LRC = `[ar: Artista]
[ti: Música]
[00:12.34]Primeira linha
[00:15.80]Segunda linha
[00:20.00]
[00:25.50]Terceira linha`;

describe('parseLrc', () => {
  it('reads timed lines and ignores metadata tags', () => {
    const lines = parseLrc(SAMPLE_LRC);
    expect(lines.map((line) => line.text)).toEqual(['Primeira linha', 'Segunda linha', 'Terceira linha']);
    expect(lines[0]).toMatchObject({ start: 12.34, end: 15.8 });
  });

  it('ends a line where the next timed entry starts, including instrumental pauses', () => {
    const lines = parseLrc(SAMPLE_LRC);
    expect(lines[1]).toMatchObject({ start: 15.8, end: 20 });
  });

  it('gives the last line a default duration', () => {
    const lines = parseLrc(SAMPLE_LRC);
    expect(lines[2]).toMatchObject({ start: 25.5, end: 29.5 });
  });

  it('expands several timestamps on one line and keeps chronological order', () => {
    const lines = parseLrc('[00:30.00]Refrão\n[00:10.00][00:50.00]Refrão repetido\n[00:20.00]Meio');
    expect(lines.map((line) => [line.start, line.text])).toEqual([
      [10, 'Refrão repetido'],
      [20, 'Meio'],
      [30, 'Refrão'],
      [50, 'Refrão repetido'],
    ]);
  });

  it('understands timestamps with and without fractions', () => {
    const lines = parseLrc('[01:02]Sem fração\n[01:03.5]Um dígito\n[01:04.250]Milésimos');
    expect(lines.map((line) => line.start)).toEqual([62, 63.5, 64.25]);
  });

  it('applies the offset tag (positive offset makes lyrics appear earlier)', () => {
    const lines = parseLrc('[offset:+500]\n[00:10.00]Linha');
    expect(lines[0]?.start).toBe(9.5);
  });

  it('never produces negative times', () => {
    const lines = parseLrc('[offset:+5000]\n[00:01.00]Linha');
    expect(lines[0]?.start).toBe(0);
  });

  it('handles Windows line endings and returns nothing for plain text', () => {
    expect(parseLrc('[00:01.00]A\r\n[00:02.00]B\r\n').map((line) => line.text)).toEqual(['A', 'B']);
    expect(parseLrc('Só texto\nsem tempos')).toEqual([]);
  });
});

describe('toLrc', () => {
  it('writes mm:ss.cc timestamps', () => {
    const lrc = toLrc([
      { start: 12.34, end: 15, text: 'A' },
      { start: 75.5, end: 80, text: 'B' },
    ]);
    expect(lrc).toBe('[00:12.34]A\n[01:15.50]B');
  });

  it('rolls centisecond rounding over to the next second', () => {
    expect(toLrc([{ start: 59.999, end: 61, text: 'A' }])).toBe('[01:00.00]A');
  });

  it('round-trips with parseLrc', () => {
    const lines = parseLrc(SAMPLE_LRC);
    expect(parseLrc(toLrc(lines)).map(({ start, text }) => ({ start, text }))).toEqual(
      lines.map(({ start, text }) => ({ start, text })),
    );
  });
});

describe('lyrics documents', () => {
  it('builds a synced document from LRC', () => {
    const doc = lyricsFromLrc(SAMPLE_LRC, 'LRCLIB', 'pt');
    expect(doc).toMatchObject({ version: 1, source: 'LRCLIB', synced: true, language: 'pt' });
    expect(doc.lines).toHaveLength(3);
  });

  it('builds an unsynced document from plain text, skipping blank lines', () => {
    const doc = lyricsFromPlainText('Linha um\n\n  Linha dois  \n');
    expect(doc).toMatchObject({ source: 'PLAIN', synced: false });
    expect(doc.lines.map((line) => line.text)).toEqual(['Linha um', 'Linha dois']);
    expect(doc.lines.every((line) => line.start === 0 && line.end === 0)).toBe(true);
  });
});
