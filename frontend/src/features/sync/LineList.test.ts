import { describe, expect, it } from 'vitest';
import { keepRowVisible } from './LineList';

function box(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

function elementAt(top: number, bottom: number, scrollTop = 0): HTMLElement {
  const element = document.createElement('div');
  element.scrollTop = scrollTop;
  element.getBoundingClientRect = () => box(top, bottom);
  return element;
}

describe('keepRowVisible', () => {
  it('scrolls only the list down when the row is below it', () => {
    const list = elementAt(100, 400, 50);
    keepRowVisible(list, elementAt(420, 470));
    expect(list.scrollTop).toBe(120);
  });

  it('scrolls only the list up when the row is above it', () => {
    const list = elementAt(100, 400, 200);
    keepRowVisible(list, elementAt(60, 110));
    expect(list.scrollTop).toBe(160);
  });

  it('leaves everything alone when the row is already visible', () => {
    const list = elementAt(100, 400, 80);
    keepRowVisible(list, elementAt(150, 200));
    expect(list.scrollTop).toBe(80);
  });
});
