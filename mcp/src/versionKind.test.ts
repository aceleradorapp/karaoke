import { describe, expect, it } from 'vitest';
import { looksWithoutVoice } from './versionKind.js';

describe('looksWithoutVoice', () => {
  it('spots karaoke and instrumental versions, with or without accents', () => {
    expect(looksWithoutVoice('Evidências - Chitãozinho e Xororó (Karaokê Version)')).toBe(true);
    expect(looksWithoutVoice('Garçom - PLAYBACK com letra')).toBe(true);
    expect(looksWithoutVoice('Tempo Perdido (Instrumental)')).toBe(true);
    expect(looksWithoutVoice('Flores - versão sem voz')).toBe(true);
  });

  it('keeps the original versions', () => {
    expect(looksWithoutVoice('Chitãozinho & Xororó - Evidências (Clipe Oficial)')).toBe(false);
    expect(looksWithoutVoice('Legião Urbana - Tempo Perdido (Ao Vivo)')).toBe(false);
  });
});
