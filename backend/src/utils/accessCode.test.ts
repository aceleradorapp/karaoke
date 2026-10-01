import { describe, expect, it } from 'vitest';
import { generateAccessCode } from './accessCode.js';

describe('generateAccessCode', () => {
  it('generates 6 characters without ambiguous ones', () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      expect(generateAccessCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 50 }, generateAccessCode));
    expect(codes.size).toBeGreaterThan(40);
  });
});
