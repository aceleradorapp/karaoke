export const VOTER_TOKEN_STORAGE_KEY = 'caraoke.voterToken';

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function voterToken(storage: Storage = localStorage): string {
  const saved = storage.getItem(VOTER_TOKEN_STORAGE_KEY);
  if (saved) return saved;
  const created = randomToken();
  storage.setItem(VOTER_TOKEN_STORAGE_KEY, created);
  return created;
}
