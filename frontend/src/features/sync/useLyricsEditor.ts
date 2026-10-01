import type { LyricLine, LyricsDoc, SongDTO } from '@caraoke/shared';
import { useCallback, useRef, useState } from 'react';
import { useSaveLyricsMutation } from '../../api/lyrics';
import {
  alignLinesWithVoice,
  snapLineToNearestOnset,
  type AlignmentResult,
} from '../../lib/lyrics/alignment';
import { useAutoSave, type AutoSave } from '../../lib/useAutoSave';
import { useHistory } from '../../lib/useHistory';
import {
  deleteLine,
  distributeEvenly,
  insertLineAfter,
  isReadyToSave,
  markLineStart,
  moveLine,
  setLineEnd,
  setLineStart,
  shiftAll,
  tidy,
  updateLineText,
} from './lineEditing';

const MILLISECONDS_PER_SECOND = 1000;
const SAVE_DELAY_MS = 800;

export type DragMode = 'move' | 'start' | 'end';

export interface LyricsEditor {
  lines: LyricLine[];
  hasTimes: boolean;
  canUndo: boolean;
  canRedo: boolean;
  autoSave: AutoSave;
  undo: () => void;
  redo: () => void;
  beginDrag: () => void;
  drag: (index: number, mode: DragMode, deltaSeconds: number, ripple: boolean) => void;
  endDrag: () => void;
  nudgeLine: (index: number, deltaSeconds: number, ripple: boolean) => void;
  nudgeAll: (deltaSeconds: number) => void;
  markStart: (index: number, time: number) => void;
  editText: (index: number, text: string) => void;
  remove: (index: number) => void;
  insertAfter: (index: number) => void;
  distribute: (from: number, to: number) => void;
  alignWithVoice: (envelope: Float32Array) => AlignmentResult | null;
  snapLine: (index: number, onsets: readonly number[]) => boolean;
  replaceAll: (lines: LyricLine[]) => void;
}

function bakeOffset(doc: LyricsDoc, offsetMs: number): LyricLine[] {
  if (!doc.synced || offsetMs === 0) return doc.lines;
  return doc.lines.map((line) => ({
    ...line,
    start: line.start + offsetMs / MILLISECONDS_PER_SECOND,
    end: line.end + offsetMs / MILLISECONDS_PER_SECOND,
    words: line.words?.map((word) => ({
      ...word,
      start: word.start + offsetMs / MILLISECONDS_PER_SECOND,
      end: word.end + offsetMs / MILLISECONDS_PER_SECOND,
    })),
  }));
}

export function useLyricsEditor(song: SongDTO, doc: LyricsDoc): LyricsEditor {
  const save = useSaveLyricsMutation(song.id);
  const [initialLines] = useState(() => bakeOffset(doc, song.lyricsOffsetMs));
  const history = useHistory<LyricLine[]>(initialLines);
  const [hasTimes, setHasTimes] = useState(doc.synced);
  const dragBase = useRef<LyricLine[] | null>(null);

  const { value: lines, commit, beginGesture, previewGesture, endGesture } = history;

  const autoSave = useAutoSave(
    lines,
    (value) => save.mutateAsync({ synced: true, language: doc.language, lines: value }),
    { delayMs: SAVE_DELAY_MS, isValid: (value) => hasTimes && isReadyToSave(value) },
  );

  const apply = useCallback(
    (next: LyricLine[]) => {
      setHasTimes(true);
      commit(next);
    },
    [commit],
  );

  const beginDrag = useCallback(() => {
    dragBase.current = lines;
    beginGesture();
  }, [lines, beginGesture]);

  const drag = useCallback(
    (index: number, mode: DragMode, deltaSeconds: number, ripple: boolean) => {
      const base = dragBase.current;
      const line = base?.[index];
      if (!base || !line) return;
      setHasTimes(true);
      if (mode === 'move') previewGesture(moveLine(base, index, deltaSeconds, ripple));
      else if (mode === 'start') previewGesture(setLineStart(base, index, line.start + deltaSeconds));
      else previewGesture(setLineEnd(base, index, line.end + deltaSeconds));
    },
    [previewGesture],
  );

  const endDrag = useCallback(() => {
    dragBase.current = null;
    endGesture();
  }, [endGesture]);

  return {
    lines,
    hasTimes,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    autoSave,
    undo: history.undo,
    redo: history.redo,
    beginDrag,
    drag,
    endDrag,
    nudgeLine: (index, deltaSeconds, ripple) => apply(moveLine(lines, index, deltaSeconds, ripple)),
    nudgeAll: (deltaSeconds) => apply(shiftAll(lines, deltaSeconds)),
    markStart: (index, time) => apply(markLineStart(lines, index, time)),
    editText: (index, text) => apply(updateLineText(lines, index, text)),
    remove: (index) => apply(deleteLine(lines, index)),
    insertAfter: (index) => apply(insertLineAfter(lines, index)),
    distribute: (from, to) => apply(distributeEvenly(lines, from, to)),
    alignWithVoice: (envelope) => {
      const result = alignLinesWithVoice(lines, envelope);
      if (result) apply(result.lines);
      return result;
    },
    snapLine: (index, onsets) => {
      const snapped = snapLineToNearestOnset(lines, index, onsets);
      if (snapped) apply(tidy(snapped));
      return snapped !== null;
    },
    replaceAll: (next) => apply(tidy(next)),
  };
}
