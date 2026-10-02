import type { LyricsDoc, SongDTO } from '@caraoke/shared';
import clsx from 'clsx';
import {
  ArrowLeft,
  AudioLines,
  History,
  Magnet,
  Mic,
  MicOff,
  Pause,
  Play,
  Redo2,
  SkipBack,
  Target,
  Undo2,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLyricsQuery, useOriginalLyricsQuery } from '../../api/lyrics';
import { useSongQuery } from '../../api/songs';
import { Button } from '../../components/Button';
import { SaveIndicator } from '../../components/SaveIndicator';
import { Spinner } from '../../components/Spinner';
import { formatOffsetSeconds } from '../../lib/format';
import type { LyricsEffectSettings } from '../../lib/lyrics/effects';
import { toast } from '../../stores/useToastStore';
import { LyricsEffectControls } from '../player/LyricsEffectControls';
import { LyricsView } from '../player/LyricsView';
import { useLyricsEffectChoice, useSongFillPercent } from '../player/useLyricsEffect';
import { LineList } from './LineList';
import { SyncTimeline } from './SyncTimeline';
import { TapSyncPanel } from './TapSyncPanel';
import { lineIndexAt } from './lineEditing';
import { DEFAULT_ZOOM_SECONDS, ZOOM_LEVELS } from './timelineMath';
import { useLyricsEditor } from './useLyricsEditor';
import { useSyncPreview } from './useSyncPreview';
import { useSyncShortcuts } from './useSyncShortcuts';

const REACTION_COMPENSATION_SECONDS = 0.15;
const LEAD_IN_SECONDS = 2;
const CURRENT_LINE_REFRESH_MS = 250;
const MILLISECONDS_PER_SECOND = 1000;
const SHIFT_ALL_STEPS = [5, 1, 0.1] as const;
const NO_ONSET_MESSAGE = 'Não há começo de voz perto o bastante dessa linha.';
const TOOLBAR_BUTTON =
  'inline-flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-4 text-base font-semibold hover:bg-surface-2/70 disabled:opacity-40';

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
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

function useCurrentLineIndex(getTime: () => number, lines: LyricsDoc['lines']): number {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const timer = setInterval(() => setIndex(lineIndexAt(lines, getTime())), CURRENT_LINE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [getTime, lines]);
  return index;
}

function describeAlignment(shiftSeconds: number, snapped: number, total: number): string {
  const shift = formatOffsetSeconds(Math.round(shiftSeconds * MILLISECONDS_PER_SECOND));
  return `Alinhada com a voz: deslocamento de ${shift} e ${snapped} de ${total} linhas ajustadas ao começo da voz. Dá para desfazer.`;
}

function SyncWorkbench({ song, doc }: { song: SongDTO; doc: LyricsDoc }) {
  const preview = useSyncPreview(song);
  const editor = useLyricsEditor(song, doc);
  const original = useOriginalLyricsQuery(song.id);
  const effectChoice = useLyricsEffectChoice();
  const fill = useSongFillPercent(song);
  const effect: LyricsEffectSettings = {
    enabled: effectChoice.enabled,
    id: effectChoice.id,
    fillPercent: fill.value,
  };

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomSeconds, setZoomSeconds] = useState<number>(DEFAULT_ZOOM_SECONDS);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [ripple, setRipple] = useState(false);
  const [isTapping, setIsTapping] = useState(false);
  const [tapIndex, setTapIndex] = useState(0);

  const { lines } = editor;
  const isReady = preview.status === 'ready';
  const profile = preview.profile;
  const currentIndex = useCurrentLineIndex(preview.getTime, lines);
  const lastIndex = lines.length - 1;
  const originalDoc = original.data && original.data.synced ? original.data : null;

  const lyricsForPreview = useMemo<LyricsDoc>(
    () => ({ version: 1, source: 'MANUAL', synced: true, lines }),
    [lines],
  );

  const recenter = useCallback(() => setRecenterSignal((value) => value + 1), []);
  const select = useCallback(
    (index: number) => setSelectedIndex(Math.min(Math.max(index, 0), Math.max(lines.length - 1, 0))),
    [lines.length],
  );

  const hasFocusedOnOpening = useRef(false);
  useEffect(() => {
    if (!isReady || hasFocusedOnOpening.current) return;
    hasFocusedOnOpening.current = true;
    const first = lines[0];
    if (first && editor.hasTimes) preview.seek(Math.max(0, first.start - LEAD_IN_SECONDS));
    recenter();
  }, [isReady, lines, editor.hasTimes, preview, recenter]);

  const playLine = useCallback(
    (index: number) => {
      const line = lines[index];
      if (!line) return;
      select(index);
      preview.playFrom(Math.max(0, line.start - LEAD_IN_SECONDS));
      recenter();
    },
    [lines, preview, recenter, select],
  );

  const markedTime = useCallback(
    () => Math.max(0, preview.getTime() - (preview.isPlaying ? REACTION_COMPENSATION_SECONDS : 0)),
    [preview],
  );

  const markLine = useCallback(
    (index: number) => {
      if (!isReady || !lines[index]) return;
      select(index);
      editor.markStart(index, markedTime());
    },
    [isReady, lines, select, editor, markedTime],
  );

  const tapMark = useCallback(() => {
    if (!isReady || !lines[tapIndex]) return;
    editor.markStart(tapIndex, markedTime());
    select(tapIndex);
    setTapIndex(Math.min(tapIndex + 1, lastIndex + 1));
  }, [isReady, lines, tapIndex, editor, markedTime, select, lastIndex]);

  const markFromShortcut = useCallback(
    () => (isTapping ? tapMark() : markLine(selectedIndex)),
    [isTapping, tapMark, markLine, selectedIndex],
  );

  const tapBack = useCallback(() => {
    if (isTapping) setTapIndex((value) => Math.max(0, value - 1));
  }, [isTapping]);

  const alignWithVoice = useCallback(() => {
    if (!profile) return;
    const result = editor.alignWithVoice(profile.envelope);
    if (!result) {
      toast.error('Não consegui alinhar sozinho. Use as ferramentas abaixo para ajustar ouvindo.');
      return;
    }
    toast.success(describeAlignment(result.shiftSeconds, result.snappedCount, lines.length));
    const first = result.lines[0];
    if (first) preview.seek(Math.max(0, first.start - LEAD_IN_SECONDS));
    setSelectedIndex(0);
    recenter();
  }, [profile, editor, lines.length, preview, recenter]);

  const snapLine = useCallback(
    (index: number) => {
      if (!profile) return;
      select(index);
      if (!editor.snapLine(index, profile.onsets)) toast.info(NO_ONSET_MESSAGE);
    },
    [profile, editor, select],
  );

  const distribute = useCallback(
    (thenTap: boolean) => {
      if (!profile) return;
      const from = profile.onset ?? 0;
      const to = profile.voiceEnd ?? preview.duration;
      editor.distribute(from, Math.max(to, from + 1));
      setSelectedIndex(0);
      setTapIndex(0);
      setIsTapping(thenTap);
      preview.seek(Math.max(0, from - LEAD_IN_SECONDS));
      recenter();
    },
    [profile, preview, editor, recenter],
  );

  const restoreOriginal = useCallback(() => {
    if (!originalDoc) return;
    editor.replaceAll(originalDoc.lines);
    setSelectedIndex(0);
    recenter();
    toast.success('Letra original de volta. Dá para desfazer.');
  }, [originalDoc, editor, recenter]);

  const startTapping = useCallback(() => {
    setIsTapping(true);
    setTapIndex(Math.min(selectedIndex, lastIndex));
  }, [selectedIndex, lastIndex]);

  useSyncShortcuts(
    {
      togglePlay: preview.togglePlay,
      seekBy: preview.seekBy,
      nudgeSelected: (delta) => editor.nudgeLine(selectedIndex, delta, ripple),
      selectRelative: (delta) => select(selectedIndex + delta),
      markLine: markFromShortcut,
      tapBack,
      undo: editor.undo,
      redo: editor.redo,
    },
    isReady,
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackToSong songId={song.id} />
        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator status={editor.autoSave.status} onRetry={editor.autoSave.retry} />
          <Button
            variant="secondary"
            size="icon"
            aria-label="Desfazer"
            onClick={editor.undo}
            disabled={!editor.canUndo}
          >
            <Undo2 aria-hidden="true" className="size-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Refazer"
            onClick={editor.redo}
            disabled={!editor.canRedo}
          >
            <Redo2 aria-hidden="true" className="size-5" />
          </Button>
        </div>
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

      {isReady && profile && !editor.hasTimes && (
        <Panel title="Esta letra ainda não tem tempos">
          <p className="text-base text-muted">
            Escolha como começar. Dá para ajustar tudo depois, linha por linha.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => distribute(true)}>
              <Target aria-hidden="true" className="size-5" />
              Marcar tocando a música
            </Button>
            <Button size="lg" variant="secondary" onClick={() => distribute(false)}>
              <AudioLines aria-hidden="true" className="size-5" />
              Distribuir pela música e ajustar
            </Button>
          </div>
        </Panel>
      )}

      {isReady && profile && editor.hasTimes && (
        <>
          <Panel title="Ferramentas">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={alignWithVoice}>
                <Wand2 aria-hidden="true" className="size-5" />
                Alinhar tudo com a voz
              </Button>
              <Button variant="secondary" onClick={() => snapLine(selectedIndex)}>
                <Magnet aria-hidden="true" className="size-5" />
                Imantar a linha escolhida
              </Button>
              <Button variant="secondary" onClick={restoreOriginal} disabled={!originalDoc}>
                <History aria-hidden="true" className="size-5" />
                Voltar ao original
              </Button>
              <label className="inline-flex min-h-11 items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={ripple}
                  onChange={(event) => setRipple(event.target.checked)}
                  className="size-5 accent-[var(--primary)]"
                />
                Mover leva as linhas seguintes
              </label>
            </div>
            <p className="text-sm text-muted">
              “Alinhar tudo com a voz” usa todas as linhas para achar o melhor deslocamento e puxa cada linha
              para o começo da frase cantada. Se uma linha ainda ficar torta, arraste-a ou use o ímã nela.
            </p>
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
              <button type="button" onClick={() => playLine(selectedIndex)} className={TOOLBAR_BUTTON}>
                <SkipBack aria-hidden="true" className="size-5" />
                Da linha escolhida
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
              envelope={profile.drawing}
              duration={preview.duration || profile.duration}
              lines={lines}
              onsets={profile.onsets}
              selectedIndex={selectedIndex}
              zoomSeconds={zoomSeconds}
              isPlaying={preview.isPlaying}
              recenterSignal={recenterSignal}
              getTime={preview.getTime}
              onSelect={select}
              onSeek={preview.seek}
              onDragStart={editor.beginDrag}
              onDrag={(index, mode, delta) => editor.drag(index, mode, delta, ripple)}
              onDragEnd={editor.endDrag}
            />
            <p className="text-sm text-muted">
              A onda amarela é a voz e os triângulos brancos são os começos de frase.{' '}
              <strong>Arraste uma faixa</strong> para mover a linha, ou as <strong>bordas</strong> para mudar
              o começo e o fim. Toque na parte de cima para escolher o ponto da música.
            </p>
          </Panel>

          <Panel
            title="Como vai aparecer no karaokê"
            action={<SaveIndicator status={fill.autoSave.status} onRetry={fill.autoSave.retry} />}
          >
            <div className="flex min-h-48 items-center justify-center rounded-xl bg-black px-4 py-8 text-white">
              <div className="w-full">
                <LyricsView
                  doc={lyricsForPreview}
                  getTime={preview.getTime}
                  offsetMs={0}
                  durationSec={preview.duration}
                  effect={effect}
                />
              </div>
            </div>
            <LyricsEffectControls
              enabled={effectChoice.enabled}
              effectId={effectChoice.id}
              fillPercent={fill.value}
              onEnabledChange={effectChoice.setEnabled}
              onEffectChange={effectChoice.setId}
              onFillPercentChange={fill.set}
            />
            <p className="text-sm text-muted">
              O começo de cada linha é o da linha do tempo. O <strong>Tempo</strong> muda só quando termina de
              pintar (100% = até o fim da linha; menos termina antes, mais termina depois) e vale para esta
              música. O modelo vale para todas.
            </p>
          </Panel>

          <Panel
            title="Marcar tocando"
            action={
              !isTapping && (
                <Button variant="secondary" onClick={startTapping}>
                  <Target aria-hidden="true" className="size-5" />
                  Começar a marcar
                </Button>
              )
            }
          >
            {isTapping ? (
              <TapSyncPanel
                lines={lines}
                targetIndex={tapIndex}
                onMark={tapMark}
                onBack={tapBack}
                onStop={() => setIsTapping(false)}
              />
            ) : (
              <p className="text-base text-muted">
                Para letras muito fora do lugar: toque a música e marque o começo de cada linha no instante em
                que ela é cantada.
              </p>
            )}
          </Panel>

          <Panel title="Linhas">
            <LineList
              lines={lines}
              selectedIndex={selectedIndex}
              currentIndex={currentIndex}
              onSelect={select}
              onPlay={playLine}
              onMark={markLine}
              onNudge={(index, delta) => editor.nudgeLine(index, delta, ripple)}
              onSnap={snapLine}
              onEditText={editor.editText}
              onInsertAfter={editor.insertAfter}
              onRemove={editor.remove}
            />
            <div className="flex flex-col gap-2 border-t border-surface-2 pt-3">
              <p className="text-sm text-muted">Mover a letra inteira</p>
              <div className="flex flex-wrap gap-2">
                {SHIFT_ALL_STEPS.flatMap((seconds) => [-seconds, seconds]).map((delta) => {
                  const amount = Math.abs(delta).toString().replace('.', ',');
                  return (
                    <Button
                      key={delta}
                      variant="secondary"
                      onClick={() => editor.nudgeAll(delta)}
                      aria-label={`${delta > 0 ? 'Atrasar' : 'Adiantar'} a letra inteira ${amount} s`}
                    >
                      {delta > 0 ? '+' : '−'} {amount} s
                    </Button>
                  );
                })}
              </div>
              <p className="text-sm text-muted">
                Atalhos: espaço toca/pausa · ← → andam 5 s · ↑ ↓ trocam de linha · [ ] mexem 0,1 s na linha
                (Shift: 1 s) · Enter marca · Ctrl+Z desfaz.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
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
        text="Esta música não tem letra. Quando houver uma letra, dá para ajustá-la aqui."
      />
    );
  }
  if (lyrics.isLoading || !lyrics.data) return <Spinner className="mx-auto mt-10 size-10" />;
  if (lyrics.data.lines.length === 0) {
    return <Message songId={song.id} title="A letra está vazia" text="Não há linhas para sincronizar." />;
  }

  return <SyncWorkbench key={song.id} song={song} doc={lyrics.data} />;
}
