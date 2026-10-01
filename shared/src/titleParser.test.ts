import { describe, expect, it } from 'vitest';
import { parseYoutubeTitle } from './titleParser.js';

describe('parseYoutubeTitle', () => {
  it.each([
    ['Chitãozinho & Xororó - Evidências (Karaoke Version)', '', 'Chitãozinho & Xororó', 'Evidências'],
    ['Queen - Bohemian Rhapsody [Official Video]', '', 'Queen', 'Bohemian Rhapsody'],
    ['Legião Urbana - Tempo Perdido (Com Letra)', '', 'Legião Urbana', 'Tempo Perdido'],
    ['KARAOKE | Evidências - Chitãozinho & Xororó', '', 'Evidências', 'Chitãozinho & Xororó'],
    ['Adele - Hello (Instrumental) (HD)', '', 'Adele', 'Hello'],
    ['Artista – Música – Karaoke Version', '', 'Artista', 'Música'],
  ])('splits "%s"', (rawTitle, channel, artist, title) => {
    expect(parseYoutubeTitle(rawTitle, channel)).toEqual({ artist, title });
  });

  it('keeps meaningful bracket groups such as "ao vivo"', () => {
    expect(parseYoutubeTitle('Artista - Música (Ao Vivo) [Karaoke]')).toEqual({
      artist: 'Artista',
      title: 'Música (Ao Vivo)',
    });
  });

  it('keeps song titles that merely contain noise words', () => {
    expect(parseYoutubeTitle('Queen - Video Killed the Radio Star')).toEqual({
      artist: 'Queen',
      title: 'Video Killed the Radio Star',
    });
    expect(parseYoutubeTitle('Artista - A')).toEqual({ artist: 'Artista', title: 'A' });
  });

  it('falls back to the channel name when the title has no artist', () => {
    expect(parseYoutubeTitle('Evidências (Karaoke)', 'Chitãozinho & Xororó - Topic')).toEqual({
      artist: 'Chitãozinho & Xororó',
      title: 'Evidências',
    });
    expect(parseYoutubeTitle('Hello', 'AdeleVEVO')).toEqual({ artist: 'Adele', title: 'Hello' });
  });

  it('does not use a karaoke channel as the artist', () => {
    expect(parseYoutubeTitle('Evidências', 'Karaoke Brasil')).toEqual({ artist: '', title: 'Evidências' });
  });

  it('never returns an empty title', () => {
    expect(parseYoutubeTitle('(Karaoke Version)', 'Canal')).toEqual({
      artist: 'Canal',
      title: '(Karaoke Version)',
    });
  });
});
