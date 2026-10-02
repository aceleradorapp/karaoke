import { describe, expect, it } from 'vitest';
import { isMobilePath } from './mobileApp';

describe('isMobilePath', () => {
  it('recognizes the phone pages', () => {
    for (const path of ['/m', '/m/', '/m/buscar', '/m/fila']) expect(isMobilePath(path)).toBe(true);
  });

  it('does not mistake stage pages that start with m for phone pages', () => {
    for (const path of ['/', '/musica/abc', '/musica/abc/sincronizar', '/mobile'])
      expect(isMobilePath(path)).toBe(false);
  });
});
