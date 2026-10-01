export const MIN_VRAM_FOR_AUTO_GPU_MB = 3500;
export const MAX_VIDEO_DURATION_SECONDS = 12 * 60;
export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.flac',
  '.ogg',
  '.webm',
  '.opus',
  '.aac',
] as const;
export const MAX_UPLOAD_FILES = 10;
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export function isSupportedAudioFile(filename: string): boolean {
  const lowerCased = filename.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => lowerCased.endsWith(extension));
}
