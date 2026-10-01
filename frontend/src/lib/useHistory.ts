import { useCallback, useReducer } from 'react';

const MAX_HISTORY = 100;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

type HistoryAction<T> =
  | { type: 'commit'; value: T }
  | { type: 'begin' }
  | { type: 'preview'; value: T }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' };

function isSame<T>(a: T, b: T): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

function remember<T>(past: T[], value: T): T[] {
  return [...past, value].slice(-MAX_HISTORY);
}

function reduce<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
  switch (action.type) {
    case 'commit':
      if (isSame(state.present, action.value)) return state;
      return { past: remember(state.past, state.present), present: action.value, future: [] };
    case 'begin':
      return { past: remember(state.past, state.present), present: state.present, future: [] };
    case 'preview':
      return { ...state, present: action.value };
    case 'end': {
      const last = state.past[state.past.length - 1];
      const hasNoChange = last !== undefined && isSame(last, state.present);
      return hasNoChange ? { ...state, past: state.past.slice(0, -1) } : state;
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: remember(state.past, state.present), present: next, future: rest };
    }
  }
}

export interface History<T> {
  value: T;
  canUndo: boolean;
  canRedo: boolean;
  commit: (value: T) => void;
  beginGesture: () => void;
  previewGesture: (value: T) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
}

export function useHistory<T>(initial: T): History<T> {
  const [state, dispatch] = useReducer(reduce<T>, { past: [], present: initial, future: [] });

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit: useCallback((value: T) => dispatch({ type: 'commit', value }), []),
    beginGesture: useCallback(() => dispatch({ type: 'begin' }), []),
    previewGesture: useCallback((value: T) => dispatch({ type: 'preview', value }), []),
    endGesture: useCallback(() => dispatch({ type: 'end' }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  };
}
