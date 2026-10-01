import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHistory } from './useHistory';

function setup(initial = 'a') {
  return renderHook(() => useHistory(initial));
}

describe('useHistory', () => {
  it('starts with the initial value and nothing to undo or redo', () => {
    const { result } = setup();
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('undoes and redoes committed changes in order', () => {
    const { result } = setup();
    act(() => result.current.commit('b'));
    act(() => result.current.commit('c'));

    act(() => result.current.undo());
    expect(result.current.value).toBe('b');
    act(() => result.current.undo());
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.value).toBe('c');
    expect(result.current.canRedo).toBe(false);
  });

  it('forgets the redo list after a new change', () => {
    const { result } = setup();
    act(() => result.current.commit('b'));
    act(() => result.current.undo());

    act(() => result.current.commit('c'));

    expect(result.current.canRedo).toBe(false);
    expect(result.current.value).toBe('c');
  });

  it('does not record a change that keeps the same value', () => {
    const { result } = setup();
    act(() => result.current.commit('a'));
    expect(result.current.canUndo).toBe(false);
  });

  it('treats values that look the same as unchanged', () => {
    const { result } = renderHook(() => useHistory([{ id: 1 }]));
    act(() => result.current.commit([{ id: 1 }]));
    expect(result.current.canUndo).toBe(false);
  });

  it('records a whole drag as one step', () => {
    const { result } = setup();

    act(() => result.current.beginGesture());
    act(() => result.current.previewGesture('b'));
    act(() => result.current.previewGesture('c'));
    act(() => result.current.previewGesture('d'));
    act(() => result.current.endGesture());

    expect(result.current.value).toBe('d');
    act(() => result.current.undo());
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);
  });

  it('records nothing when the drag ends where it started', () => {
    const { result } = setup();

    act(() => result.current.beginGesture());
    act(() => result.current.previewGesture('b'));
    act(() => result.current.previewGesture('a'));
    act(() => result.current.endGesture());

    expect(result.current.canUndo).toBe(false);
  });

  it('ignores undo and redo when there is nothing to do', () => {
    const { result } = setup();
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.value).toBe('a');
  });

  it('keeps only the last hundred steps', () => {
    const { result } = setup('0');
    for (let step = 1; step <= 130; step++) act(() => result.current.commit(String(step)));

    for (let step = 0; step < 100; step++) act(() => result.current.undo());

    expect(result.current.value).toBe('30');
    expect(result.current.canUndo).toBe(false);
  });
});
