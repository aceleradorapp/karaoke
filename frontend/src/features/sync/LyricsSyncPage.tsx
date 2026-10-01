import { LYRICS_OFFSET_LIMIT_MS, type LyricsDoc, type SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { ArrowLeft, Mic, MicOff, Pause, Play, SkipBack, Target, Wand2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLyricsQuery } from '../../api/lyrics';
import { useSongQuery, useUpdateSongMutation } from '../../api/songs';
import { SaveIndicator } from '../../components/SaveIndicator';
import { Spinner } from '../../components/Spinner';
import { formatDuration, formatPreciseTime } from '../../lib/format';
import { offsetToAlignFirstLine } from '../../lib/lyrics/vocalAnalysis';
import { useAutoSave } from '../../lib/useAutoSave';
import { LyricsView } from '../player/LyricsView';
import { OffsetControls } from './OffsetControls';
import { SyncTimeline } from './SyncTimeline';
import { DEFAULT_ZOOM_SECONDS, ZOOM_LEVELS, clampOffset, offsetToMarkLine, snapOffset } from './timelineMath';
import { useSyncPreview } from './useSyncPreview';
import { useSyncShortcuts } from './useSyncShortcuts';

const REACTION_COMPENSATION_SECONDS = 0.15;
const LEAD_IN_SECONDS = 3;
const SEEK_STEP_SECONDS = 5;
const ALREADY_ALIGNED_TOLERANCE_MS = 100;
const MILLISECONDS_PER_SECOND = 1000;
const TOOLBAR_BUTTON =
  'inline-flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-4 text-base font-semibold hover:bg-surface-2/70 disabled:opacity-40';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BackToSong({ songId }: { songId: string }) {
  return (
    <Link
      to={`/musica/${songId}`}
      className="inline-flex min-h-11 items-center gap-2 text-base text-muted hover:text-text"
    >
      <ArrowLeft aria-hidden="true" className="size-5" />
      Voltar para a música
    </Link>
  );
}

function Message({ songId, title, text }: { songId: string; title: string; text: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 py-8">
      <BackToSong songId={songId} />
      <h1 className="font-display text-4xl">{title}</h1>
      <p className="text-lg text-muted">{text}</p>
    </div>
  );
}

interface SyncWorkbenchProps {
  song: SongDTO;
  doc: LyricsDoc;
}

function SyncWorkbench({ song, doc }: SyncWorkbenchProps) {
  const preview = useSyncPreview(song);
  const updateSong = useUpdateSongMutation(song.id);
  const [initialOffsetMs] = useState(song.lyricsOffsetMs);
  const [offsetMs, setOffsetMs] = useState(song.lyricsOffsetMs);
  const [zoomSeconds, setZoomSeconds] = useState<number>(DEFAULT_ZOOM_SECONDS);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);

  const autoSave = useAutoSave(offsetMs, (value) => updateSong.mutateAsync({ lyricsOffsetMs: value }), {
    isValid: (value) => Math.abs(value) <= LYRICS_OFFSET_LIMIT_MS,
  });

  const firstLine = doc.lines[0];
  const onset = preview.profile?.onset ?? null;
  const suggestedOffsetMs =
    firstLine && onset !== null ? snapOffset(offsetToAlignFirstLine(firstLine.start, onset)) : null;
  const isAligned =
    suggestedOffsetMs !== null && Math.abs(suggestedOffsetMs - offsetMs) <= ALREADY_ALIGNED_TOLERANCE_MS;
  const isReady = preview.status === 'ready';

  const recenter = useCallback(() => setRecenterSignal((value) => value + 1), []);
  const nudge = useCallback((deltaMs: number) => setOffsetMs((value) => clampOffset(value + deltaMs)), []);
  const setOffset = useCallback((value: number) => setOffsetMs(clampOffset(value)), []);

  const playFromFirstLine = useCallback(() => {
    if (!firstLine) return;
    preview.playFrom(firstLine.start + offsetMs / MILLISECONDS_PER_SECOND - LEAD_IN_SECONDS);
    recenter();
  }, [firstLine, offsetMs, preview, recenter]);

  const markTargetLine = useCallback(() => {
    const line = doc.lines[targetIndex];
    if (!line || !isReady) return;
    const reaction = preview.isPlaying ? REACTION_COMPENSATION_SECONDS : 0;
    setOffset(offsetToMarkLine(line, preview.getTime() - reaction));
    recenter();
  }, [doc.lines, targetIndex, isReady, preview, setOffset, recenter]);

  useSyncShortcuts(
    {
      togglePlay: preview.togglePlay,
      seekBy: preview.seekBy,
      nudgeOffset: nudge,
      markLine: markTargetLine,
    },
    isReady,
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackToSong songId={song.id} />
        <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
      </div>

      <div>
        <p className="text-lg text-muted">{song.artist}</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Sincronizar a letra</h1>
        <p className="text-base text-muted">{song.title}</p>
      </div>

      {preview.status === 'loading' && (
        <div role="status" className="flex items-center gap-3 rounded-2xl bg-surface p-6">
          <Spinner className="size-6" />
          <span>Carregando a voz da música…</span>
        </div>
      )}

      {preview.status === 'error' && (
        <p role="alert" className="rounded-2xl bg-surface p-6 text-danger">
          {preview.error}
        </p>
      )}

      {isReady && preview.profile && (
        <>
          <Panel title="Alinhar automaticamente">
            {onset !== null && firstLine && suggestedOffsetMs !== null ? (
              <div className="flex flex-col gap-3">
                <p className="text-base">
                  A voz começa em <strong>{formatPreciseTime(onset)}</strong>, e a primeira linha da letra
                  original está em <strong>{formatPreciseTime(firstLine.start)}</strong>. Alinhando as duas, a
                  letra fica com <strong>{formatOffsetLabel(suggestedOffsetMs)}</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOffset(suggestedOffsetMs)}
                    disabled={isAligned}
                    className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 text-base font-semibold text-primary-contrast disabled:opacity-50"
                  >
                    <Wand2 aria-hidden="true" className="size-5" />
                    Alinhar com a voz
                  </button>
                  {isAligned && <span className="text-base text-muted">Já está alinhada ✓</span>}
                </div>
                <p className="text-sm text-muted">
                  Vale conferir ouvindo: quando há solos, vozes de apoio ou uma introdução falada, a primeira
                  linha pode não ser a primeira voz.
                </p>
              </div>
            ) : (
              <p className="text-base text-muted">
                Não consegui achar sozinho onde a voz começa nesta música. Use as opções abaixo para alinhar
                ouvindo.
              </p>
            )}
          </Panel>

          <Panel title="Linha do tempo">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={preview.togglePlay}
                aria-label={preview.isPlaying ? 'Pausar' : 'Tocar'}
                className={clsx(TOOLBAR_BUTTON, 'bg-primary text-primary-contrast hover:bg-primary/90')}
              >
                {preview.isPlaying ? (
                  <Pause aria-hidden="true" className="size-5 fill-current" />
                ) : (
                  <Play aria-hidden="true" className="size-5 fill-current" />
                )}
                {preview.isPlaying ? 'Pausar' : 'Tocar'}
              </button>
              <button type="button" onClick={playFromFirstLine} className={TOOLBAR_BUTTON}>
                <SkipBack aria-hidden="true" className="size-5" />
                Da primeira linha
              </button>
              <button
                type="button"
                onClick={preview.toggleVoice}
                aria-pressed={preview.voiceOn}
                className={clsx(TOOLBAR_BUTTON, preview.voiceOn && 'ring-2 ring-primary')}
              >
                {preview.voiceOn ? (
                  <Mic aria-hidden="true" className="size-5" />
                ) : (
                  <MicOff aria-hidden="true" className="size-5" />
                )}
                Voz: {preview.voiceOn ? 'ligada' : 'desligada'}
              </button>

              <div role="group" aria-label="Zoom da linha do tempo" className="ml-auto flex gap-1">
                {ZOOM_LEVELS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setZoomSeconds(seconds)}
                    aria-pressed={zoomSeconds === seconds}
                    className={clsx(
                      'min-h-11 min-w-12 rounded-lg px-3 text-base',
                      zoomSeconds === seconds ? 'bg-primary text-primary-contrast' : 'bg-surface-2',
                    )}
                  >
                    {seconds} s
                  </button>
                ))}
              </div>
            </div>

            <SyncTimeline
              envelope={preview.profile.envelope}
              duration={preview.duration || preview.profile.duration}
              lines={doc.lines}
              offsetMs={offsetMs}
              zoomSeconds={zoomSeconds}
              isPlaying={preview.isPlaying}
              recenterSignal={recenterSignal}
              getTime={preview.getTime}
              onOffsetChange={setOffset}
              onSeek={preview.seek}
            />
            <p className="text-sm text-muted">
              A onda amarela é a voz. <strong>Arraste as faixas da letra</strong> (parte de baixo) até onde a
              voz realmente começa a cantar, ou toque na onda (parte de cima) para escolher o ponto da música.
              Duração: {formatDuration(preview.duration)}.
            </p>
          </Panel>

          <Panel title="Ouvir e marcar">
            <p className="text-base text-muted">
              Escolha uma linha, toque a música e aperte o botão no instante em que ela começar a ser cantada.
              O botão já desconta o tempo de reação. Também funciona pausado, no ponto exato em que você
              parou.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-muted sm:max-w-md">
                Linha para marcar
                <select
                  value={targetIndex}
                  onChange={(event) => setTargetIndex(Number(event.target.value))}
                  className="min-h-11 w-full min-w-0 rounded-lg bg-surface-2 px-3 text-base text-text"
                >
                  {doc.lines.map((line, index) => (
                    <option key={`${index}-${line.start}`} value={index}>
                      {formatDuration(line.start)} · {line.text}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={markTargetLine}
                className="inline-flex min-h-12 items-center gap-2 self-end rounded-lg bg-primary px-5 text-base font-semibold text-primary-contrast"
              >
                <Target aria-hidden="true" className="size-5" />
                Esta linha começa agora
              </button>
            </div>
          </Panel>

          <Panel title="Ajuste fino">
            <OffsetControls
              offsetMs={offsetMs}
              initialOffsetMs={initialOffsetMs}
              onNudge={nudge}
              onReset={setOffset}
            />
            <p className="text-sm text-muted">
              Atalhos: espaço toca/pausa · ← → voltam e avançam {SEEK_STEP_SECONDS} s · [ ] mudam 0,1 s ·
              Shift + [ ] ou {'{ }'} mudam 1 s · M marca a linha escolhida.
            </p>
          </Panel>

          <Panel title="Como vai aparecer no karaokê">
            <div className="flex min-h-48 items-center justify-center rounded-xl bg-black px-4 py-8 text-white">
              <div className="w-full">
                <LyricsView
                  doc={doc}
                  getTime={preview.getTime}
                  offsetMs={offsetMs}
                  durationSec={preview.duration}
                />
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function formatOffsetLabel(offsetMs: number): string {
  const seconds = (Math.abs(offsetMs) / MILLISECONDS_PER_SECOND).toFixed(2).replace('.', ',');
  if (offsetMs === 0) return 'nenhum ajuste';
  return offsetMs > 0 ? `${seconds} s de atraso` : `${seconds} s de adiantamento`;
}

export function LyricsSyncPage() {
  const { id } = useParams();
  const songQuery = useSongQuery(id);
  const song = songQuery.data;
  const lyrics = useLyricsQuery(song?.lyricsUrl ?? null);

  if (songQuery.isLoading) return <Spinner className="mx-auto mt-10 size-10" />;
  if (songQuery.isError || !song) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 py-8">
        <h1 className="font-display text-4xl">Música não encontrada</h1>
        <Link to="/biblioteca" className="min-h-11 text-primary underline">
          Voltar para a biblioteca
        </Link>
      </div>
    );
  }
  if (song.status !== 'READY') {
    return (
      <Message
        songId={song.id}
        title="Esta música ainda não está pronta"
        text="Espere o processamento terminar para sincronizar a letra."
      />
    );
  }
  if (!song.lyricsUrl || lyrics.isError) {
    return (
      <Message
        songId={song.id}
        title="Sem letra para sincronizar"
        text="Esta música não tem letra. Quando houver uma letra com tempos, dá para ajustá-la aqui."
      />
    );
  }
  if (lyrics.isLoading || !lyrics.data) return <Spinner className="mx-auto mt-10 size-10" />;
  if (!lyrics.data.synced || lyrics.data.lines.length === 0) {
    return (
      <Message
        songId={song.id}
        title="A letra não tem tempos"
        text="Esta letra é só texto, sem marcação de tempo, então não há o que alinhar com a voz."
      />
    );
  }

  return <SyncWorkbench key={song.id} song={song} doc={lyrics.data} />;
}
