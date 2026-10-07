import type { LyricLine } from '@caraoke/shared';
import clsx from 'clsx';
import { ListPlus, Magnet, Minus, Play, Plus, Target, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { formatPreciseTime } from '../../lib/format';

const NUDGE_SECONDS = 0.1;

interface LineListProps {
  lines: readonly LyricLine[];
  selectedIndex: number;
  currentIndex: number;
  onSelect: (index: number) => void;
  onPlay: (index: number) => void;
  onMark: (index: number) => void;
  onNudge: (index: number, deltaSeconds: number) => void;
  onSnap: (index: number) => void;
  onEditText: (index: number, text: string) => void;
  onInsertAfter: (index: number) => void;
  onRemove: (index: number) => void;
}

function TextCell({
  index,
  text,
  onCommit,
  onFocus,
}: {
  index: number;
  text: string;
  onCommit: (text: string) => void;
  onFocus: () => void;
}) {
  const [draft, setDraft] = useState(text);

  useEffect(() => setDraft(text), [text]);

  function commit() {
    if (draft !== text) onCommit(draft);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={onFocus}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(text);
      }}
      aria-label={`Texto da linha ${index + 1}`}
      aria-invalid={draft.trim().length === 0}
      className={clsx(
        'min-h-11 min-w-0 flex-1 basis-48 rounded-lg bg-surface-2 px-3 text-base',
        draft.trim().length === 0 && 'ring-2 ring-danger',
      )}
    />
  );
}

export function keepRowVisible(list: HTMLElement, row: HTMLElement): void {
  const listBox = list.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top;
  else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom;
}

export function LineList(props: LineListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const selectedRow = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (listRef.current && selectedRow.current) keepRowVisible(listRef.current, selectedRow.current);
  }, [props.selectedIndex]);

  return (
    <ol
      ref={listRef}
      aria-label="Linhas da letra"
      className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1"
    >
      {props.lines.map((line, index) => {
        const isSelected = index === props.selectedIndex;
        const isCurrent = index === props.currentIndex;
        const number = index + 1;
        return (
          <li
            key={index}
            ref={isSelected ? selectedRow : undefined}
            aria-current={isSelected ? 'true' : undefined}
            className={clsx(
              'flex flex-wrap items-center gap-2 rounded-xl p-2',
              isSelected ? 'bg-surface-2 ring-2 ring-primary' : 'bg-surface',
              isCurrent && !isSelected && 'ring-1 ring-lyric-sung',
            )}
          >
            <button
              type="button"
              onClick={() => props.onSelect(index)}
              aria-label={`Escolher a linha ${number}`}
              className="flex min-h-11 w-24 shrink-0 flex-col items-start justify-center rounded-lg px-2 text-left tabular-nums hover:bg-surface-2"
            >
              <span className="text-xs text-muted">Linha {number}</span>
              <span className="text-sm font-semibold">{formatPreciseTime(line.start)}</span>
            </button>
            <TextCell
              index={index}
              text={line.text}
              onFocus={() => props.onSelect(index)}
              onCommit={(text) => props.onEditText(index, text)}
            />
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Tocar a linha ${number}`}
                onClick={() => props.onPlay(index)}
              >
                <Play aria-hidden="true" className="size-5 fill-current" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Marcar o começo da linha ${number} agora`}
                onClick={() => props.onMark(index)}
              >
                <Target aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Adiantar a linha ${number} em 0,1 s`}
                onClick={() => props.onNudge(index, -NUDGE_SECONDS)}
              >
                <Minus aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Atrasar a linha ${number} em 0,1 s`}
                onClick={() => props.onNudge(index, NUDGE_SECONDS)}
              >
                <Plus aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Imantar a linha ${number} ao começo da voz`}
                onClick={() => props.onSnap(index)}
              >
                <Magnet aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Inserir uma linha depois da ${number}`}
                onClick={() => props.onInsertAfter(index)}
              >
                <ListPlus aria-hidden="true" className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Apagar a linha ${number}`}
                onClick={() => props.onRemove(index)}
              >
                <Trash2 aria-hidden="true" className="size-5" />
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
