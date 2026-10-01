import type { LyricLine, LyricsDoc } from '@caraoke/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { countdownDots, findLineIndex, lineProgress, wordProgress } from '../../lib/lyrics/timing';

const COUNTDOWN_TOTAL_DOTS = 3;
const MILLISECONDS_PER_SECOND = 1000;

interface LyricsViewProps {
  doc: LyricsDoc | null;
  getTime: () => number;
  offsetMs: number;
  durationSec: number;
}

function CountdownDots({ lit }: { lit: number }) {
  return (
    <div role="img" aria-label={`Começa em ${lit}`} className="flex justify-center gap-4 py-4">
      {Array.from({ length: COUNTDOWN_TOTAL_DOTS }, (_, index) => (
        <span
          key={index}
          className={clsx(
            'size-5 rounded-full transition-opacity duration-300 sm:size-7',
            index < lit ? 'bg-lyric-sung' : 'bg-lyric-sung opacity-20',
          )}
        />
      ))}
    </div>
  );
}

interface CurrentLineProps {
  line: LyricLine;
  fillRefs: React.MutableRefObject<Array<HTMLSpanElement | null>>;
}

function CurrentLine({ line, fillRefs }: CurrentLineProps) {
  fillRefs.current = [];
  const words = line.words?.length ? line.words : null;

  return (
    <p className="lyric-enter text-center font-display text-[clamp(2rem,4.5vw,4rem)] leading-tight">
      {words ? (
        words.map((word, index) => (
          <span key={`${index}-${word.start}`}>
            <span
              ref={(element) => {
                fillRefs.current[index] = element;
              }}
              className="lyric-fill"
            >
              {word.text}
            </span>{' '}
          </span>
        ))
      ) : (
        <span
          ref={(element) => {
            fillRefs.current[0] = element;
          }}
          className="lyric-fill"
        >
          {line.text}
        </span>
      )}
    </p>
  );
}

function NoLyrics() {
  return <p className="text-center text-xl text-muted">Letra não encontrada</p>;
}

function UnsyncedLyrics({ doc, getTime, offsetMs, durationSec }: LyricsViewProps & { doc: LyricsDoc }) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const element = scroller.current;
      if (element && durationSec > 0) {
        const seconds = getTime() - offsetMs / MILLISECONDS_PER_SECOND;
        const ratio = Math.min(1, Math.max(0, seconds / durationSec));
        element.scrollTop = ratio * (element.scrollHeight - element.clientHeight);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getTime, offsetMs, durationSec]);

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-center text-sm text-muted">Letra sem sincronia</p>
      <div
        ref={scroller}
        aria-label="Letra"
        role="region"
        className="flex-1 space-y-3 overflow-hidden text-center"
      >
        {doc.lines.map((line, index) => (
          <p key={index} className="text-[clamp(1.25rem,2.6vw,2.25rem)] leading-snug">
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function SyncedLyrics({ doc, getTime, offsetMs }: LyricsViewProps & { doc: LyricsDoc }) {
  const [lineIndex, setLineIndex] = useState(-1);
  const [litDots, setLitDots] = useState<number | null>(null);
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const lastIndex = useRef(-1);
  const lastDots = useRef<number | null>(null);

  const paint = useCallback(
    (seconds: number) => {
      const line = doc.lines[findLineIndex(doc.lines, seconds)];
      if (!line) return;

      const words = line.words?.length ? line.words : null;
      if (words) {
        words.forEach((word, wordIndex) =>
          fillRefs.current[wordIndex]?.style.setProperty('--p', String(wordProgress(word, seconds))),
        );
      } else {
        fillRefs.current[0]?.style.setProperty('--p', String(lineProgress(line, seconds)));
      }
    },
    [doc],
  );

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const seconds = getTime() - offsetMs / MILLISECONDS_PER_SECOND;
      const index = findLineIndex(doc.lines, seconds);
      const dots = countdownDots(doc.lines, seconds);

      if (index !== lastIndex.current) {
        lastIndex.current = index;
        setLineIndex(index);
      }
      if (dots !== lastDots.current) {
        lastDots.current = dots;
        setLitDots(dots);
      }

      paint(seconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [doc, getTime, offsetMs, paint]);

  useLayoutEffect(() => {
    paint(getTime() - offsetMs / MILLISECONDS_PER_SECOND);
  }, [lineIndex, litDots, paint, getTime, offsetMs]);

  const current = doc.lines[lineIndex];
  const upcoming = doc.lines[lineIndex + 1];

  return (
    <div className="flex flex-col items-center gap-6">
      {litDots !== null ? (
        <CountdownDots lit={litDots} />
      ) : (
        current && <CurrentLine key={lineIndex} line={current} fillRefs={fillRefs} />
      )}
      {upcoming && (
        <p className="text-center text-[clamp(1.1rem,2.2vw,2rem)] leading-snug opacity-60">{upcoming.text}</p>
      )}
    </div>
  );
}

export function LyricsView(props: LyricsViewProps) {
  const { doc } = props;
  if (!doc || doc.lines.length === 0) return <NoLyrics />;
  if (!doc.synced) return <UnsyncedLyrics {...props} doc={doc} />;
  return <SyncedLyrics {...props} doc={doc} />;
}
