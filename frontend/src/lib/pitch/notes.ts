const NOTE_NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];

export function noteName(midi: number): string {
  return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12] ?? '';
}
