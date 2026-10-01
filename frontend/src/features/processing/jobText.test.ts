import { describe, expect, it } from 'vitest';
import { friendlyJobError } from './jobText';

describe('friendlyJobError', () => {
  it.each([
    ['DownloadError: ERROR: [youtube] abc: This video is not available', 'Vídeo indisponível no YouTube'],
    ['DownloadError: ERROR: [youtube] abc: Private video. Sign in', 'O vídeo é privado'],
    ["ERROR: Sign in to confirm you're not a bot", 'O YouTube pediu confirmação de login'],
    ['ERROR: Sign in to confirm your age', 'Vídeo com restrição de idade'],
    ['StepError: O vídeo tem mais de 12 minutos', 'O vídeo tem mais de 12 minutos'],
    [
      'StepError: FFmpeg não encontrado. Instale com: winget install --id Gyan.FFmpeg',
      'FFmpeg não está instalado no PC',
    ],
    ['StepError: O arquivo de origem não foi encontrado', 'O arquivo original não foi encontrado'],
    ['Interrompida várias vezes; tente de novo', 'Interrompida várias vezes'],
  ])('translates "%s"', (raw, expected) => {
    expect(friendlyJobError(raw)).toBe(expected);
  });

  it('falls back to the first line of an unknown error', () => {
    expect(friendlyJobError('RuntimeError: boom\n  at somewhere\n  at elsewhere')).toBe('RuntimeError: boom');
  });

  it('shortens very long unknown errors', () => {
    const message = friendlyJobError('x'.repeat(500));
    expect(message).toHaveLength(141);
    expect(message.endsWith('…')).toBe(true);
  });

  it('handles a missing error', () => {
    expect(friendlyJobError(null)).toBe('Falha desconhecida');
  });
});
