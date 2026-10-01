import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsDoc } from '@caraoke/shared';
import { LyricsView } from './LyricsView';

const FRAME_MS = 20;

const SYNCED: LyricsDoc = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 20, end: 24, text: 'Primeira linha' },
    { start: 24, end: 28, text: 'Segunda linha' },
    { start: 60, end: 64, text: 'Terceira linha' },
  ],
};

const WITH_WORDS: LyricsDoc = {
  version: 1,
  source: 'ALIGNED',
  synced: true,
  lines: [
    {
      start: 10,
      end: 14,
      text: 'Eu sei que',
      words: [
        { start: 10, end: 11, text: 'Eu' },
        { start: 11, end: 12, text: 'sei' },
        { start: 12, end: 14, text: 'que' },
      ],
    },
  ],
};

const PLAIN: LyricsDoc = {
  version: 1,
  source: 'PLAIN',
  synced: false,
  lines: [
    { start: 0, end: 0, text: 'Linha um' },
    { start: 0, end: 0, text: 'Linha dois' },
  ],
};

describe('LyricsView', () => {
  let time: number;

  beforeEach(() => {
    time = 0;
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function show(doc: LyricsDoc | null, offsetMs = 0, durationSec = 100) {
    const getTime = () => time;
    return render(<LyricsView doc={doc} getTime={getTime} offsetMs={offsetMs} durationSec={durationSec} />);
  }

  const advanceTo = (seconds: number) =>
    act(() => {
      time = seconds;
      vi.advanceTimersByTime(FRAME_MS * 2);
    });
  const fillOf = (text: string) => screen.getByText(text).closest('.lyric-fill') as HTMLElement;

  describe('synced lyrics', () => {
    it('shows the line being sung and previews the next one', () => {
      show(SYNCED);

      advanceTo(21);

      expect(screen.getByText('Primeira linha')).toBeInTheDocument();
      expect(screen.getByText('Segunda linha')).toBeInTheDocument();
    });

    it('moves to the next line exactly when it starts', () => {
      show(SYNCED);
      advanceTo(21);

      advanceTo(24);

      expect(screen.getByText('Segunda linha').closest('.lyric-fill')).not.toBeNull();
      expect(screen.getByText('Terceira linha')).toBeInTheDocument();
      expect(screen.queryByText('Primeira linha')).not.toBeInTheDocument();
    });

    it('fills the current line progressively', () => {
      show(SYNCED);

      advanceTo(22);
      expect(fillOf('Primeira linha').style.getPropertyValue('--p')).toBe('0.5');

      advanceTo(23);
      expect(fillOf('Primeira linha').style.getPropertyValue('--p')).toBe('0.75');
    });

    it('stays on the last line after the song ends', () => {
      show(SYNCED);

      advanceTo(500);

      expect(screen.getByText('Terceira linha')).toBeInTheDocument();
      expect(fillOf('Terceira linha').style.getPropertyValue('--p')).toBe('1');
    });

    it('delays the lyrics when the offset is positive', () => {
      show(SYNCED, 1000);

      advanceTo(24.5);
      expect(screen.getByText('Primeira linha').closest('.lyric-fill')).not.toBeNull();

      advanceTo(25);
      expect(screen.getByText('Segunda linha').closest('.lyric-fill')).not.toBeNull();
    });

    it('brings the lyrics earlier when the offset is negative', () => {
      show(SYNCED, -2000);

      advanceTo(18.5);

      expect(screen.getByText('Primeira linha').closest('.lyric-fill')).not.toBeNull();
    });

    it('reacts to an offset changed while playing', () => {
      const getTime = () => time;
      const { rerender } = render(
        <LyricsView doc={SYNCED} getTime={getTime} offsetMs={0} durationSec={100} />,
      );
      advanceTo(24.2);
      expect(screen.getByText('Segunda linha').closest('.lyric-fill')).not.toBeNull();

      rerender(<LyricsView doc={SYNCED} getTime={getTime} offsetMs={1000} durationSec={100} />);
      advanceTo(24.2);

      expect(screen.getByText('Primeira linha').closest('.lyric-fill')).not.toBeNull();
    });
  });

  describe('countdown', () => {
    it('counts down the last seconds of the intro with dots that go out one by one', () => {
      show(SYNCED);

      advanceTo(17.2);
      expect(screen.getByRole('img', { name: 'Começa em 3' })).toBeInTheDocument();

      advanceTo(18.5);
      expect(screen.getByRole('img', { name: 'Começa em 2' })).toBeInTheDocument();

      advanceTo(19.5);
      expect(screen.getByRole('img', { name: 'Começa em 1' })).toBeInTheDocument();
    });

    it('shows the next line while counting down and then switches to singing it', () => {
      show(SYNCED);

      advanceTo(18);
      expect(screen.getByText('Primeira linha')).toBeInTheDocument();
      expect(screen.queryByText('Primeira linha')?.closest('.lyric-fill')).toBeNull();

      advanceTo(20.5);
      expect(screen.queryByRole('img', { name: /Começa em/ })).not.toBeInTheDocument();
      expect(screen.getByText('Primeira linha').closest('.lyric-fill')).not.toBeNull();
    });

    it('also counts down after a long instrumental break', () => {
      show(SYNCED);

      advanceTo(58);

      expect(screen.getByRole('img', { name: 'Começa em 2' })).toBeInTheDocument();
    });

    it('does not count down in the middle of the intro', () => {
      show(SYNCED);

      advanceTo(5);

      expect(screen.queryByRole('img', { name: /Começa em/ })).not.toBeInTheDocument();
    });
  });

  describe('word by word', () => {
    it('fills each word on its own', () => {
      show(WITH_WORDS);

      advanceTo(11.5);

      expect(fillOf('Eu').style.getPropertyValue('--p')).toBe('1');
      expect(fillOf('sei').style.getPropertyValue('--p')).toBe('0.5');
      expect(fillOf('que').style.getPropertyValue('--p')).toBe('0');
    });

    it('keeps the words in order with spaces between them', () => {
      show(WITH_WORDS);
      advanceTo(10.5);
      expect(document.querySelector('p')?.textContent).toBe('Eu sei que ');
    });
  });

  describe('lyrics without timing', () => {
    it('shows all the lines with a notice and scrolls with the song', () => {
      show(PLAIN, 0, 100);

      expect(screen.getByText('Letra sem sincronia')).toBeInTheDocument();
      expect(screen.getByText('Linha um')).toBeInTheDocument();
      expect(screen.getByText('Linha dois')).toBeInTheDocument();
    });

    it('scrolls in proportion to how far the song has played', () => {
      show(PLAIN, 0, 100);
      const region = screen.getByRole('region', { name: 'Letra' });
      Object.defineProperty(region, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(region, 'clientHeight', { value: 200, configurable: true });

      advanceTo(50);

      expect(region.scrollTop).toBe(400);
    });
  });

  describe('no lyrics', () => {
    it('says the lyrics were not found', () => {
      show(null);
      expect(screen.getByText('Letra não encontrada')).toBeInTheDocument();
    });

    it('also treats an empty document as not found', () => {
      show({ ...SYNCED, lines: [] });
      expect(screen.getByText('Letra não encontrada')).toBeInTheDocument();
    });
  });

  it('stops animating when removed from the screen', () => {
    const { unmount } = show(SYNCED);
    advanceTo(21);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
