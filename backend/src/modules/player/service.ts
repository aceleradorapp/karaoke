import type { PlayerStateDTO, PlayerStateInput } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { notFound } from '../../utils/errors.js';
import { toSongDTO } from '../songs/mapper.js';

let currentState: PlayerStateDTO | null = null;

export function getPlayerState(): PlayerStateDTO | null {
  return currentState;
}

export async function updatePlayerState(
  input: PlayerStateInput,
  now: number = Date.now(),
): Promise<PlayerStateDTO | null> {
  if ('stopped' in input) {
    currentState = null;
  } else {
    const song = await prisma.song.findUnique({ where: { id: input.songId } });
    if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
    const dto = toSongDTO(song);
    currentState = {
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        lyricsUrl: dto.lyricsUrl,
        durationSec: song.durationSec,
      },
      singer: input.singer,
      position: input.position,
      playing: input.playing,
      offsetMs: input.offsetMs,
      effect: input.effect,
      at: now,
    };
  }
  emitToAll('player:state', currentState);
  return currentState;
}

export function resetPlayerState(): void {
  currentState = null;
}
