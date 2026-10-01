const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((safeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = safeSeconds % SECONDS_PER_MINUTE;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

const SECONDS_PER_DAY = 86_400;
const JUST_NOW_SECONDS = 45;

export function formatTimeAgo(isoDate: string, now: number = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 1000));
  if (elapsedSeconds < JUST_NOW_SECONDS) return 'agora';
  if (elapsedSeconds < SECONDS_PER_HOUR) return `há ${Math.round(elapsedSeconds / SECONDS_PER_MINUTE)} min`;
  if (elapsedSeconds < SECONDS_PER_DAY) return `há ${Math.floor(elapsedSeconds / SECONDS_PER_HOUR)} h`;
  const days = Math.floor(elapsedSeconds / SECONDS_PER_DAY);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}
