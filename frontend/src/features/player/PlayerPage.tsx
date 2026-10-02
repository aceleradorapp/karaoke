import { LYRICS_OFFSET_LIMIT_MS, type SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLyricsQuery } from '../../api/lyrics';
import { useCloseVotingMutation } from '../../api/performances';
import { usePlaylistQuery } from '../../api/playlists';
import { useProfilesQuery } from '../../api/profiles';
import { firstReadyRequest, singRequestRoute, useSingQueueQuery } from '../../api/singQueue';
import { useSongQuery, useUpdateSongMutation } from '../../api/songs';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import type { LyricsEffectSettings } from '../../lib/lyrics/effects';
import { coverGradient } from '../../lib/gradient';
import { buildPlayQueue, locateInQueue, parseShuffleSeed, playerRoute } from '../../lib/playQueue';
import { useAutoSave } from '../../lib/useAutoSave';
import { useProfileStore } from '../../stores/useProfileStore';
import { getSocket } from '../../realtime/socket';
import { toast } from '../../stores/useToastStore';
import { FinishedScreen } from './FinishedScreen';
import { PitchMeter } from './PitchMeter';
import { LyricsEffectControls } from './LyricsEffectControls';
import { LyricsView } from './LyricsView';
import { PlayerControls } from './PlayerControls';
import { SingerPicker } from './SingerPicker';
import { useIdle } from './useIdle';
import { useLyricsEffectChoice, useSongFillPercent } from './useLyricsEffect';
import { usePitchScoring } from './usePitchScoring';
import { usePlayerSession, type PlayerSession } from './usePlayerSession';
import { VotingScreen } from './VotingScreen';
import { usePlayerShortcuts } from './usePlayerShortcuts';

const CONTROLS_IDLE_MS = 3000;
const LYRICS_SAVE_DELAY_MS = 1000;

function Backdrop({ song }: { song: SongDTO }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {song.coverUrl ? (
        <img src={song.coverUrl} alt="" className="size-full scale-110 object-cover opacity-40 blur-2xl" />
      ) : (
        <div style={{ background: coverGradient(song.id) }} className="size-full opacity-60" />
      )}
      <div className="absolute inset-0 bg-black/55" />
    </div>
  );
}

function FullScreenMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-4 text-center text-text">
      <h1 className="font-display text-4xl">{title}</h1>
      {children}
    </div>
  );
}

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  return { isFullscreen, toggle };
}

function useVotingEvents(session: PlayerSession) {
  const { voting, updateVotes, showResult } = session;
  const performanceId = voting?.performanceId;

  useEffect(() => {
    if (!performanceId) return;
    const socket = getSocket();
    const onProgress = ({ performanceId: id, count }: { performanceId: string; count: number }) =>
      updateVotes(id, count);
    socket.on('vote:progress', onProgress);
    socket.on('score:final', showResult);
    return () => {
      socket.off('vote:progress', onProgress);
      socket.off('score:final', showResult);
    };
  }, [performanceId, updateVotes, showResult]);
}

function PlayerSession({ song }: { song: SongDTO }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentProfile = useProfileStore((state) => state.currentProfile);
  const profiles = useProfilesQuery();
  const lyrics = useLyricsQuery(song.lyricsUrl);
  const updateSong = useUpdateSongMutation(song.id);
  const pitch = usePitchScoring(song);
  const session = usePlayerSession(song, pitch);
  const closeVoting = useCloseVotingMutation();
  useVotingEvents(session);
  const effectChoice = useLyricsEffectChoice();
  const fill = useSongFillPercent(song);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const [searchParams] = useSearchParams();
  const playlistId = searchParams.get('playlist');
  const shuffleSeed = parseShuffleSeed(searchParams.get('shuffle'));
  const playlist = usePlaylistQuery(playlistId ?? undefined);
  const carriedSingerId = (location.state as { singerId?: string } | null)?.singerId;
  const requestId = searchParams.get('pedido');
  const singQueue = useSingQueueQuery();
  const request = singQueue.data?.find((item) => item.id === requestId) ?? null;
  const nextRequest = firstReadyRequest(singQueue.data?.filter((item) => item.id !== requestId));
  const hasChosenSinger = useRef(false);

  const [singerId, setSingerId] = useState<string | null>(carriedSingerId ?? currentProfile?.id ?? null);
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);
  const baseOffsetMs = useRef(song.lyricsOffsetMs);

  const isPerforming = session.phase === 'playing';
  const isIdle = useIdle(CONTROLS_IDLE_MS, isPerforming && session.isPlaying);
  const singer = profiles.data?.find((profile) => profile.id === singerId) ?? currentProfile;

  useEffect(() => {
    if (request && !hasChosenSinger.current) setSingerId(request.profile.id);
  }, [request]);

  useAutoSave(
    session.liveOffsetMs,
    (value) => updateSong.mutateAsync({ lyricsOffsetMs: baseOffsetMs.current + value }),
    {
      delayMs: LYRICS_SAVE_DELAY_MS,
      isValid: (value) => Math.abs(baseOffsetMs.current + value) <= LYRICS_OFFSET_LIMIT_MS,
    },
  );

  const leave = useCallback(() => {
    session.stop();
    const cameFromInsideTheApp = location.key !== 'default';
    if (cameFromInsideTheApp) navigate(-1);
    else navigate(`/musica/${song.id}`);
  }, [session, location.key, navigate, song.id]);

  const requestExit = useCallback(() => {
    if (session.phase === 'playing' && session.hasSungForAWhile()) setIsConfirmingExit(true);
    else leave();
  }, [session, leave]);

  usePlayerShortcuts(
    {
      togglePlay: session.togglePlay,
      toggleVoiceGuide: session.toggleVoiceGuide,
      toggleLyricsEffect: () => effectChoice.setEnabled(!effectChoice.enabled),
      seekBy: session.seekBy,
      changeVolumeBy: session.changeVolumeBy,
      adjustLyricsOffset: session.adjustLyricsOffset,
      toggleFullscreen,
      requestExit,
    },
    isPerforming || session.phase === 'choosing',
  );

  const queueStep = useMemo(
    () => (playlist.data ? locateInQueue(buildPlayQueue(playlist.data.items, shuffleSeed), song.id) : null),
    [playlist.data, shuffleSeed, song.id],
  );

  const goToNextSong = useCallback(() => {
    const next = queueStep?.next;
    if (!next || !playlistId) return;
    session.stop();
    navigate(playerRoute(next.id, playlistId, shuffleSeed), { replace: true, state: { singerId } });
  }, [queueStep, playlistId, shuffleSeed, session, navigate, singerId]);

  const callNextSinger = useCallback(() => {
    if (!nextRequest) return;
    session.stop();
    navigate(singRequestRoute(nextRequest), { replace: true });
  }, [nextRequest, session, navigate]);

  const isLyricsLoading = song.lyricsUrl !== null && lyrics.isLoading;
  const effectiveOffsetMs = baseOffsetMs.current + session.liveOffsetMs;
  const effect: LyricsEffectSettings = {
    enabled: effectChoice.enabled,
    id: effectChoice.id,
    fillPercent: fill.value,
  };

  return (
    <div className={clsx('relative min-h-dvh overflow-hidden bg-black text-white', isIdle && 'cursor-none')}>
      <Backdrop song={song} />

      <div className="relative z-10 flex min-h-dvh flex-col">
        {session.phase === 'choosing' && (
          <div className="flex flex-1 items-center justify-center py-10">
            <SingerPicker
              profiles={profiles.data ?? []}
              isLoading={profiles.isLoading}
              selectedId={singerId}
              songTitle={song.title}
              songArtist={song.artist}
              title={request ? `Vez de ${request.profile.name}! 🎤` : undefined}
              onSelect={(profileId) => {
                hasChosenSinger.current = true;
                setSingerId(profileId);
              }}
              onStart={() => singerId && void session.start(singerId, requestId)}
              onBack={leave}
            />
          </div>
        )}

        {session.phase === 'loading' && (
          <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4">
            <Spinner className="size-12" />
            <p className="text-xl">Carregando a música…</p>
          </div>
        )}

        {session.phase === 'finishing' && (
          <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4">
            <Spinner className="size-12" />
            <p className="text-xl">Calculando a nota…</p>
          </div>
        )}

        {session.phase === 'voting' && session.voting && (
          <div className="flex flex-1 items-center justify-center py-10">
            <VotingScreen
              singerName={singer?.name ?? ''}
              songTitle={song.title}
              endsAt={session.voting.endsAt}
              votes={session.voting.votes}
              isClosing={closeVoting.isPending}
              onCloseNow={() => {
                const id = session.voting?.performanceId;
                if (!id) return;
                closeVoting.mutate(id, {
                  onSuccess: session.showResult,
                  onError: () => {
                    toast.error('Não foi possível encerrar a votação');
                    session.giveUpWaitingForResult();
                  },
                });
              }}
              onTimeUp={session.giveUpWaitingForResult}
            />
          </div>
        )}

        {session.phase === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <h1 className="font-display text-4xl">Não foi possível cantar</h1>
            <p role="alert" className="text-danger">
              {session.error}
            </p>
            <button
              type="button"
              onClick={leave}
              className="min-h-11 rounded-lg bg-white/15 px-6 text-lg font-semibold"
            >
              Voltar
            </button>
          </div>
        )}

        {session.phase === 'finished' && (
          <div className="flex flex-1 items-center justify-center">
            <FinishedScreen
              songTitle={song.title}
              score={session.result}
              onSingAgain={() => void session.restart()}
              onBack={leave}
              sequence={
                queueStep
                  ? {
                      position: queueStep.index + 1,
                      total: queueStep.total,
                      nextTitle: queueStep.next?.title ?? null,
                      onNext: goToNextSong,
                    }
                  : null
              }
              nextSinger={
                !queueStep && nextRequest
                  ? {
                      singerName: nextRequest.profile.name,
                      songTitle: nextRequest.song.title,
                      onCall: callNextSinger,
                    }
                  : null
              }
            />
          </div>
        )}

        {isPerforming && (
          <>
            <header
              className={clsx(
                'flex items-start justify-between gap-4 p-4 transition-opacity duration-300 sm:p-8',
                isIdle && 'opacity-0',
              )}
            >
              {singer && (
                <div className="flex items-center gap-3">
                  <Avatar avatarId={singer.avatar} size="md" />
                  <span className="text-xl">{singer.name}</span>
                </div>
              )}
              <div className="text-right">
                <p className="font-display text-2xl sm:text-3xl">{song.title}</p>
                <p className="text-base text-white/70">{song.artist}</p>
              </div>
            </header>

            <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 sm:px-10">
              {pitch.isActive && <PitchMeter reading={pitch.reading} />}
              <div className="w-full max-w-5xl">
                {!isLyricsLoading && (
                  <LyricsView
                    doc={lyrics.data ?? null}
                    getTime={session.getTime}
                    offsetMs={effectiveOffsetMs}
                    durationSec={session.duration}
                    effect={effect}
                  />
                )}
              </div>
            </main>

            <div
              className={clsx('transition-opacity duration-300', isIdle && 'pointer-events-none opacity-0')}
            >
              <PlayerControls
                isPlaying={session.isPlaying}
                voiceGuide={session.voiceGuide}
                hasVocals={session.hasVocals}
                volume={session.volume}
                duration={session.duration}
                lyricsOffsetMs={effectiveOffsetMs}
                isFullscreen={isFullscreen}
                getTime={session.getTime}
                onTogglePlay={session.togglePlay}
                onSeekTo={session.seekTo}
                onToggleVoiceGuide={session.toggleVoiceGuide}
                onVolumeChange={session.setVolume}
                onAdjustLyricsOffset={session.adjustLyricsOffset}
                onToggleFullscreen={toggleFullscreen}
                onExit={requestExit}
                lyricsEffect={
                  <LyricsEffectControls
                    variant="player"
                    enabled={effectChoice.enabled}
                    effectId={effectChoice.id}
                    fillPercent={fill.value}
                    onEnabledChange={effectChoice.setEnabled}
                    onEffectChange={effectChoice.setId}
                    onFillPercentChange={fill.set}
                  />
                }
              />
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={isConfirmingExit}
        title="Sair da música"
        message="A música ainda está tocando. Quer mesmo sair?"
        confirmLabel="Sair"
        dismissLabel="Continuar cantando"
        onConfirm={() => {
          setIsConfirmingExit(false);
          leave();
        }}
        onCancel={() => setIsConfirmingExit(false)}
      />
    </div>
  );
}

export function PlayerPage() {
  const { songId } = useParams();
  const [searchParams] = useSearchParams();
  const song = useSongQuery(songId);

  if (song.isLoading) {
    return (
      <FullScreenMessage title="Carregando…">
        <Spinner className="size-10" />
      </FullScreenMessage>
    );
  }
  if (song.isError || !song.data) {
    return (
      <FullScreenMessage title="Música não encontrada">
        <Link
          to="/biblioteca"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
        >
          Voltar para a biblioteca
        </Link>
      </FullScreenMessage>
    );
  }
  if (song.data.status !== 'READY') {
    return (
      <FullScreenMessage title="Esta música ainda não está pronta">
        <Link
          to="/fila"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
        >
          Ver a fila de processamento
        </Link>
      </FullScreenMessage>
    );
  }

  return <PlayerSession key={`${song.data.id}:${searchParams.get('pedido') ?? ''}`} song={song.data} />;
}
