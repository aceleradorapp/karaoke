import { randomInt } from 'node:crypto';

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACCESS_CODE_LENGTH = 6;

export function generateAccessCode(): string {
  return Array.from({ length: ACCESS_CODE_LENGTH }, () =>
    ACCESS_CODE_ALPHABET.charAt(randomInt(ACCESS_CODE_ALPHABET.length)),
  ).join('');
}
