import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMobileAccessStore } from '../stores/useMobileAccessStore';
import { coverUrlForDevice } from './deviceMedia';

describe('coverUrlForDevice', () => {
  beforeEach(() => useMobileAccessStore.setState({ code: 'K7P2QX' }));
  afterEach(() => window.history.pushState({}, '', '/'));

  it('adds the access code to covers shown on the phone', () => {
    window.history.pushState({}, '', '/m/fila');
    expect(coverUrlForDevice('/media/a/capa.jpg?v=1')).toBe('/media/a/capa.jpg?v=1&c=K7P2QX');
    expect(coverUrlForDevice('/media/a/capa.jpg')).toBe('/media/a/capa.jpg?c=K7P2QX');
  });

  it('leaves the address alone on the stage, without a code or without a cover', () => {
    expect(coverUrlForDevice('/media/a/capa.jpg?v=1')).toBe('/media/a/capa.jpg?v=1');
    window.history.pushState({}, '', '/m/fila');
    expect(coverUrlForDevice(null)).toBeNull();
    useMobileAccessStore.setState({ code: null });
    expect(coverUrlForDevice('/media/a/capa.jpg')).toBe('/media/a/capa.jpg');
  });
});
