import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsDoc, SongDTO } from '@caraoke/shared';
import { useToastStore } from '../../stores/useToastStore';
import { buildJob } from '../../test/builders';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSong } from '../../test/songBuilder';
import { LyricsSyncPage } from './LyricsSyncPage';

const audioMock = vi.hoisted(() => {
  const state = { instances: [] as unknown[], failLoad: false, analysisFails: false };

  class FakeEngine {
    onEnded: (() => void) | null = null;
    duration = 100;
    time = 0;
    isPlaying = false;
    voiceGuide = false;
    destroyed = false;
    playCalls: Array<number | undefined> = [];
    seeks: number[] = [];

    constructor() {
      state.instances.push(this);
    }

    get currentTime() {
      return this.time;
    }

    async load() {
      if (state.failLoad) throw new Error('Não foi possível carregar o áudio (404)');
    }

    play(from?: number) {
      this.playCalls.push(from);
      if (from !== undefined) this.time = from;
      this.isPlaying = true;
    }

    pause() {
      this.isPlaying = false;
    }

    seek(seconds: number) {
      this.seeks.push(seconds);
      this.time = seconds;
    }

    setVoiceGuide(isOn: boolean) {
      this.voiceGuide = isOn;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  return { FakeEngine, state };
});

vi.mock('../../lib/audio/KaraokeEngine', () => ({ KaraokeEngine: audioMock.FakeEngine }));

vi.mock('../../lib/lyrics/vocalAnalysis', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/lyrics/vocalAnalysis')>();
  return {
    ...original,
    analyzeVocals: vi.fn(async () => {
      if (audioMock.state.analysisFails) throw new Error('Não foi possível carregar a voz (404)');
      const envelope = new Float32Array(2000);
      for (const [start, end] of [
        [25, 31],
        [33, 39],
        [42, 48],
        [55, 61],
      ] as const) {
        envelope.fill(0.4, Math.round(start / 0.05), Math.round(end / 0.05));
      }
      return { envelope, onset: 25, duration: 100 };
    }),
  };
});

vi.mock('./SyncTimeline', () => ({
  SyncTimeline: (props: {
    lines: Array<{ start: number }>;
    selectedIndex: number;
    zoomSeconds: number;
    onsets: number[];
    onSelect: (index: number) => void;
    onSeek: (seconds: number) => void;
    onDragStart: () => void;
    onDrag: (index: number, mode: 'move' | 'start' | 'end', delta: number) => void;
    onDragEnd: () => void;
  }) => (
    <div
      data-testid="timeline"
      data-zoom={props.zoomSeconds}
      data-selected={props.selectedIndex}
      data-onsets={props.onsets.length}
      data-starts={props.lines.map((line) => line.start).join(',')}
    >
      <button
        type="button"
        onClick={() => {
          props.onSelect(1);
          props.onDragStart();
          props.onDrag(1, 'move', 0.5);
          props.onDrag(1, 'move', 1.5);
          props.onDragEnd();
        }}
      >
        arrastar linha 2
      </button>
      <button
        type="button"
        onClick={() => {
          props.onDragStart();
          props.onDrag(0, 'end', 0.7);
          props.onDragEnd();
        }}
      >
        esticar linha 1
      </button>
      <button
        type="button"
        onClick={() => {
          props.onDragStart();
          props.onDragEnd();
        }}
      >
        soltar sem mexer
      </button>
      <button type="button" onClick={() => props.onSeek(77)}>
        tocar na onda
      </button>
    </div>
  ),
}));

type FakeEngineInstance = InstanceType<typeof audioMock.FakeEngine>;
const latestEngine = () => audioMock.state.instances.at(-1) as FakeEngineInstance;

const APP_SETTINGS = {
  'processing.device': 'auto',
  'processing.demucsModel': 'htdemucs',
  'processing.whisperModel': 'small',
  'processing.autoAlign': true,
  'scoring.mode': 'pitch+audience',
  'scoring.audienceWeight': 0.2,
  'scoring.voteSeconds': 20,
  'scoring.micLatencyMs': 150,
  'scoring.micDeviceId': null,
  'ui.defaultTheme': 'cinema',
  'player.lyricsEffectEnabled': true,
  'player.lyricsEffect': 'smooth',
  'queue.maxRequestsPerPerson': 3,
  'queue.stageBypassesLimit': true,
  'queue.shuffle': false,
  'queue.autoAdvanceSeconds': 15,
};

const LYRICS_URL = '/media/s1/letra.json?v=1';
const LYRICS: LyricsDoc = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 10, end: 14, text: 'Primeira linha' },
    { start: 18, end: 24, text: 'Segunda linha' },
    { start: 27, end: 31, text: 'Terceira linha' },
    { start: 40, end: 44, text: 'Quarta linha' },
  ],
};
const UNTIMED: LyricsDoc = {
  version: 1,
  source: 'PLAIN',
  synced: false,
  lines: ['Primeira linha', 'Segunda linha', 'Terceira linha'].map((text) => ({ start: 0, end: 0, text })),
};

function readySong(overrides: Partial<SongDTO> = {}): SongDTO {
  return buildSong({
    id: 's1',
    title: 'À Sua Maneira',
    artist: 'Capital Inicial',
    lyricsUrl: LYRICS_URL,
    lyricsSource: 'LRCLIB',
    instrumentalUrl: '/media/s1/instrumental.mp3',
    vocalsUrl: '/media/s1/voz.mp3',
    ...overrides,
  });
}

function baseRoutes(
  song: SongDTO = readySong(),
  lyrics: LyricsDoc = LYRICS,
  extra: MockRoutes = {},
): MockRoutes {
  return {
    'GET /api/songs/s1': { body: song },
    [`GET ${LYRICS_URL}`]: { body: lyrics },
    'PUT /api/songs/s1/lyrics': { body: song },
    'PATCH /api/songs/s1': { body: song },
    'GET /api/settings': { body: APP_SETTINGS },
    'PATCH /api/settings': { body: APP_SETTINGS },
    'GET /api/songs/s1/lyrics/original': {
      status: 404,
      body: { error: { code: 'NO_ORIGINAL_LYRICS', message: 'Sem original' } },
    },
    ...extra,
  };
}

function renderPage(routes: MockRoutes = baseRoutes()) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/musica/s1/sincronizar']}>
        <Routes>
          <Route path="/musica/:id/sincronizar" element={<LyricsSyncPage />} />
          <Route path="/musica/:id" element={<p>Detalhe da música</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, queryClient };
}

type SavedLine = { start: number; end: number; text: string };

const savedBodies = (fetchMock: ReturnType<typeof mockApi>) =>
  requestsTo(fetchMock, 'PUT', '/api/songs/s1/lyrics').map(
    ([, init]) => JSON.parse(String(init?.body)) as { synced: boolean; lines: SavedLine[] },
  );

const startsOf = (body: { lines: SavedLine[] }) => body.lines.map((line) => line.start);
const toastMessages = () => useToastStore.getState().toasts.map((toast) => toast.message);
const timelineStarts = () => screen.getByTestId('timeline').getAttribute('data-starts');
const lineRow = (number: number) =>
  screen
    .getAllByRole('listitem')
    .find((row) => within(row).queryByLabelText(`Texto da linha ${number}`)) as HTMLElement;
const SAVE_TIMEOUT = { timeout: 3000 };

async function renderReady(routes?: MockRoutes) {
  const rendered = renderPage(routes);
  await screen.findByTestId('timeline').catch(() => undefined);
  await screen.findByRole('list', { name: 'Linhas da letra' }).catch(() => undefined);
  return rendered;
}

describe('LyricsSyncPage', () => {
  beforeEach(() => {
    audioMock.state.instances = [];
    audioMock.state.failLoad = false;
    audioMock.state.analysisFails = false;
    useToastStore.setState({ toasts: [] });
  });

  describe('redoing the automatic sync', () => {
    it('confirms, shows the progress and reopens the editor with the new lyrics', async () => {
      const newUrl = '/media/s1/letra.json?v=2';
      const resynced: LyricsDoc = {
        version: 1,
        source: 'ALIGNED',
        synced: true,
        lines: [
          { start: 12.25, end: 13, text: 'Vou deixar' },
          { start: 15.55, end: 22, text: 'A vida me levar' },
        ],
      };
      let phase: 'queued' | 'running' | 'done' = 'queued';
      const job = buildJob({ id: 'j9', songId: 's1', kind: 'RESYNC', status: 'PENDING' });
      const { fetchMock, queryClient } = await renderReady(
        baseRoutes(readySong(), LYRICS, {
          'GET /api/songs/s1': () => ({ body: phase === 'done' ? readySong({ lyricsUrl: newUrl, lyricsSource: 'ALIGNED' }) : readySong() }),
          [`GET ${newUrl}`]: { body: resynced },
          'POST /api/songs/s1/lyrics/resync': { status: 201, body: job },
          'GET /api/jobs?scope=active': () => ({
            body: {
              items:
                phase === 'running'
                  ? [{ ...job, status: 'RUNNING', progress: 40, message: 'Alinhando as palavras com a voz…' }]
                  : phase === 'queued'
                    ? [job]
                    : [],
            },
          }),
          'GET /api/jobs?scope=recent': () => ({ body: { items: phase === 'done' ? [{ ...job, status: 'DONE' }] : [] } }),
        }),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Refazer a sincronização automática' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('As mudanças feitas à mão nesta letra serão substituídas');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Refazer' }));

      expect(await screen.findByRole('heading', { name: 'Refazendo a sincronização' })).toBeInTheDocument();
      expect(requestsTo(fetchMock, 'POST', '/api/songs/s1/lyrics/resync')).toHaveLength(1);
      expect(screen.queryByRole('list', { name: 'Linhas da letra' })).not.toBeInTheDocument();

      phase = 'running';
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      expect(await screen.findByText('Alinhando as palavras com a voz…')).toBeInTheDocument();

      phase = 'done';
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });

      expect(await screen.findByDisplayValue('Vou deixar')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A vida me levar')).toBeInTheDocument();
      expect(toastMessages()).toContain('Sincronização refeita com a voz');
      expect(savedBodies(fetchMock)).toHaveLength(0);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('when it cannot work', () => {
    it('explains when the song is not ready yet', async () => {
      renderPage(baseRoutes(buildProcessingSong({ id: 's1' })));
      expect(await screen.findByText('Esta música ainda não está pronta')).toBeInTheDocument();
      expect(audioMock.state.instances).toHaveLength(0);
    });

    it('explains when the song has no lyrics', async () => {
      renderPage(baseRoutes(readySong({ lyricsUrl: null, lyricsSource: 'NONE' })));
      expect(await screen.findByText('Sem letra para sincronizar')).toBeInTheDocument();
    });

    it('explains when the lyrics are empty', async () => {
      renderPage(baseRoutes(readySong(), { ...LYRICS, lines: [] }));
      expect(await screen.findByText('A letra está vazia')).toBeInTheDocument();
    });

    it('shows a message when the song does not exist', async () => {
      renderPage({ 'GET /api/songs/s1': { status: 404, body: { error: { message: 'x' } } } });
      expect(await screen.findByText('Música não encontrada')).toBeInTheDocument();
    });

    it('shows the problem when the audio cannot be loaded', async () => {
      audioMock.state.failLoad = true;
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o áudio');
    });

    it('shows the problem when the vocals cannot be analyzed', async () => {
      audioMock.state.analysisFails = true;
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a voz');
    });

    it('lets the user go back to the song', async () => {
      renderPage(baseRoutes(readySong({ lyricsUrl: null })));
      fireEvent.click(await screen.findByRole('link', { name: /Voltar para a música/ }));
      expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
    });
  });

  describe('opening', () => {
    it('lists every line with its time and text, ready to be edited', async () => {
      await renderReady();

      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByLabelText('Texto da linha 1')).toHaveValue('Primeira linha');
      expect(within(lineRow(2)).getByText('0:18,0')).toBeInTheDocument();
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-onsets', '4');
    });

    it('starts a little before the first line and saves nothing by itself', async () => {
      const { fetchMock } = await renderReady();

      expect(latestEngine().seeks[0]).toBe(8);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(savedBodies(fetchMock)).toHaveLength(0);
    });

    it('shows the lines already moved by the offset the song had, and saves the baked times only after an edit', async () => {
      const { fetchMock } = await renderReady(baseRoutes(readySong({ lyricsOffsetMs: 15000 })));

      expect(timelineStarts()).toBe('25,33,42,55');
      expect(savedBodies(fetchMock)).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 1 em 0,1 s' }));

      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(startsOf(savedBodies(fetchMock)[0] as never)).toEqual([25.1, 33, 42, 55]);
    });
  });

  describe('aligning with the voice', () => {
    it('aligns every line with the voice, tells how, and saves by itself', async () => {
      const { fetchMock } = await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Alinhar tudo com a voz' }));

      expect(timelineStarts()).toBe('25,33,42,55');
      expect(toastMessages().join(' ')).toMatch(
        /Alinhada com a voz: deslocamento de \+15,00 s e \d de 4 linhas/,
      );
      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(savedBodies(fetchMock)[0]).toMatchObject({ synced: true });
      expect(startsOf(savedBodies(fetchMock)[0] as never)).toEqual([25, 33, 42, 55]);
      expect(latestEngine().seeks.at(-1)).toBe(23);
    });

    it('can be undone and redone', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'Alinhar tudo com a voz' }));

      fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
      expect(timelineStarts()).toBe('10,18,27,40');
      expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
      expect(timelineStarts()).toBe('25,33,42,55');
    });

    it('says so when it cannot align by itself', async () => {
      await renderReady(
        baseRoutes(readySong(), { ...LYRICS, lines: [{ start: 100, end: 104, text: 'Só uma' }] }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Alinhar tudo com a voz' }));

      expect(toastMessages()).toContain(
        'Não consegui alinhar sozinho. Use as ferramentas abaixo para ajustar ouvindo.',
      );
    });
  });

  describe('moving lines', () => {
    it('follows a drag on the timeline as one step and saves the final position', async () => {
      const { fetchMock } = await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'arrastar linha 2' }));

      expect(timelineStarts()).toBe('10,19.5,27,40');
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-selected', '1');
      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(startsOf(savedBodies(fetchMock)[0] as never)).toEqual([10, 19.5, 27, 40]);

      fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
      expect(timelineStarts()).toBe('10,18,27,40');
    });

    it('changes only the end of a line when its edge is dragged', async () => {
      const { fetchMock } = await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'esticar linha 1' }));

      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(savedBodies(fetchMock)[0]?.lines[0]).toEqual({ start: 10, end: 14.7, text: 'Primeira linha' });
    });

    it('records nothing when the drag does not move anything', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'soltar sem mexer' }));
      expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
    });

    it('nudges one line with the buttons of its row', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 2 em 0,1 s' }));
      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 2 em 0,1 s' }));
      fireEvent.click(screen.getByRole('button', { name: 'Adiantar a linha 3 em 0,1 s' }));

      expect(timelineStarts()).toBe('10,18.2,26.9,40');
    });

    it('takes the following lines along when asked', async () => {
      await renderReady();
      fireEvent.click(screen.getByLabelText('Mover leva as linhas seguintes'));

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 2 em 0,1 s' }));

      expect(timelineStarts()).toBe('10,18.1,27.1,40.1');
    });

    it('moves the whole lyrics', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra inteira 5 s' }));
      fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra inteira 0,1 s' }));

      expect(timelineStarts()).toBe('14.9,22.9,31.9,44.9');
    });

    it('snaps one line to the start of the voice that is close, or says there is none', async () => {
      await renderReady(
        baseRoutes(readySong(), {
          ...LYRICS,
          lines: [25.4, 33.4, 42.4, 75].map((start, index) => ({
            start,
            end: start + 4,
            text: `Linha ${index + 1}`,
          })),
        }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Imantar a linha 1 ao começo da voz' }));
      expect(timelineStarts()?.split(',')[0]).toBe('25');

      fireEvent.click(screen.getByRole('button', { name: 'Escolher a linha 4' }));
      fireEvent.click(screen.getByRole('button', { name: 'Imantar a linha escolhida' }));
      expect(timelineStarts()?.split(',')[3]).toBe('75');
      expect(toastMessages()).toContain('Não há começo de voz perto o bastante dessa linha.');
    });
  });

  describe('listening and marking', () => {
    it('plays a line from a little before it', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Tocar a linha 3' }));

      expect(latestEngine().playCalls.at(-1)).toBe(25);
      expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-selected', '2');
    });

    it('plays and pauses, turns the voice off and on, and changes the zoom', async () => {
      await renderReady();
      expect(latestEngine().voiceGuide).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
      expect(latestEngine().isPlaying).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
      expect(latestEngine().isPlaying).toBe(false);

      const voice = screen.getByRole('button', { name: /Voz:/ });
      fireEvent.click(voice);
      expect(latestEngine().voiceGuide).toBe(false);
      expect(voice).toHaveTextContent('desligada');

      fireEvent.click(screen.getByRole('button', { name: '40 s' }));
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-zoom', '40');
    });

    it('seeks when the user touches the waveform', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'tocar na onda' }));
      expect(latestEngine().seeks.at(-1)).toBe(77);
    });

    it('marks the start of a line at the paused position', async () => {
      const { fetchMock } = await renderReady();
      latestEngine().time = 30;

      fireEvent.click(screen.getByRole('button', { name: 'Marcar o começo da linha 2 agora' }));

      expect(timelineStarts()).toBe('10,30,30.3,43.3');
      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
    });

    it('discounts the reaction time when marking while the music plays', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
      latestEngine().time = 30;

      fireEvent.click(screen.getByRole('button', { name: 'Marcar o começo da linha 2 agora' }));

      expect(timelineStarts()?.split(',')[1]).toBe('29.85');
    });

    it('marks line after line in the tap mode, moving on to the next one', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Começar a marcar' }));
      expect(screen.getByText('Linha 1 de 4')).toBeInTheDocument();
      latestEngine().time = 26;
      fireEvent.click(screen.getByRole('button', { name: 'Marcar' }));

      expect(screen.getByText('Linha 2 de 4')).toBeInTheDocument();
      expect(timelineStarts()?.split(',')[0]).toBe('26');
      latestEngine().time = 34;
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      expect(screen.getByText('Linha 3 de 4')).toBeInTheDocument();
      expect(timelineStarts()?.split(',').slice(0, 2).join(',')).toBe('26,34');
    });

    it('goes back one line in the tap mode and stops marking', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'Começar a marcar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Marcar' }));
      expect(screen.getByText('Linha 2 de 4')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Voltar uma linha' }));
      expect(screen.getByText('Linha 1 de 4')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Voltar uma linha' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Parar de marcar' }));
      expect(screen.getByRole('button', { name: 'Começar a marcar' })).toBeInTheDocument();
    });
  });

  describe('lines and text', () => {
    it('saves a corrected text when the user leaves the field', async () => {
      const { fetchMock } = await renderReady();
      const input = screen.getByLabelText('Texto da linha 2');

      fireEvent.change(input, { target: { value: 'Segunda corrigida' } });
      expect(savedBodies(fetchMock)).toHaveLength(0);
      fireEvent.blur(input);

      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(savedBodies(fetchMock)[0]?.lines[1]?.text).toBe('Segunda corrigida');
    });

    it('does not save a line without text and marks the problem', async () => {
      const { fetchMock } = await renderReady();
      const input = screen.getByLabelText('Texto da linha 2');

      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.blur(input);

      expect(screen.getByLabelText('Texto da linha 2')).toHaveAttribute('aria-invalid', 'true');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(savedBodies(fetchMock)).toHaveLength(0);
    });

    it('goes back to the saved text with Escape', async () => {
      await renderReady();
      const input = screen.getByLabelText('Texto da linha 2');

      fireEvent.change(input, { target: { value: 'Mudei de ideia' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(input).toHaveValue('Segunda linha');
    });

    it('inserts an empty line after one, and removes a line', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Inserir uma linha depois da 2' }));
      expect(screen.getAllByRole('listitem')).toHaveLength(5);
      expect(screen.getByLabelText('Texto da linha 3')).toHaveValue('');

      fireEvent.click(screen.getByRole('button', { name: 'Apagar a linha 3' }));
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByLabelText('Texto da linha 3')).toHaveValue('Terceira linha');
    });

    it('can bring a deleted line back with undo', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Apagar a linha 1' }));
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByLabelText('Texto da linha 1')).toHaveValue('Primeira linha');
    });
  });

  describe('the original lyrics', () => {
    const originalDoc: LyricsDoc = {
      ...LYRICS,
      lines: LYRICS.lines.map((line) => ({ ...line, start: line.start - 5, end: line.end - 5 })),
    };

    it('cannot go back to the original when there is none', async () => {
      await renderReady();
      expect(screen.getByRole('button', { name: 'Voltar ao original' })).toBeDisabled();
    });

    it('goes back to the original lyrics, as a step that can be undone', async () => {
      const { fetchMock } = await renderReady(
        baseRoutes(readySong(), LYRICS, { 'GET /api/songs/s1/lyrics/original': { body: originalDoc } }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Alinhar tudo com a voz' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar ao original' })).toBeEnabled());

      fireEvent.click(screen.getByRole('button', { name: 'Voltar ao original' }));

      expect(timelineStarts()).toBe('5,13,22,35');
      expect(toastMessages()).toContain('Letra original de volta. Dá para desfazer.');
      fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
      expect(timelineStarts()).toBe('25,33,42,55');
      await waitFor(() => expect(savedBodies(fetchMock).length).toBeGreaterThan(0), SAVE_TIMEOUT);
    });

    it('does not offer an original that has no times', async () => {
      await renderReady(
        baseRoutes(readySong(), LYRICS, { 'GET /api/songs/s1/lyrics/original': { body: UNTIMED } }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByRole('button', { name: 'Voltar ao original' })).toBeDisabled();
    });
  });

  describe('lyrics without times', () => {
    const untimedRoutes = () => baseRoutes(readySong({ lyricsSource: 'PLAIN' }), UNTIMED);

    it('offers the two ways to start and hides the tools until then', async () => {
      await renderReady(untimedRoutes());

      expect(await screen.findByText('Esta letra ainda não tem tempos')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alinhar tudo com a voz' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Marcar tocando a música' })).toBeInTheDocument();
    });

    it('spreads the lines over the part of the song that has voice and saves them', async () => {
      const { fetchMock } = await renderReady(untimedRoutes());

      fireEvent.click(await screen.findByRole('button', { name: 'Distribuir pela música e ajustar' }));

      expect(await screen.findByRole('list', { name: 'Linhas da letra' })).toBeInTheDocument();
      expect(timelineStarts()).toBe('25,37,49');
      expect(screen.queryByText('Esta letra ainda não tem tempos')).not.toBeInTheDocument();
      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(savedBodies(fetchMock)[0]).toMatchObject({ synced: true });
    });

    it('spreads the lines and starts marking right away', async () => {
      await renderReady(untimedRoutes());

      fireEvent.click(await screen.findByRole('button', { name: 'Marcar tocando a música' }));

      expect(await screen.findByText('Linha 1 de 3')).toBeInTheDocument();
      expect(latestEngine().seeks.at(-1)).toBe(23);
    });
  });

  describe('the preview with the fill effect', () => {
    const patchedSong = (fetchMock: ReturnType<typeof mockApi>) =>
      requestsTo(fetchMock, 'PATCH', '/api/songs/s1').map(([, init]) => JSON.parse(String(init?.body)));

    it('sits right below the timeline, so the result can be seen while adjusting', async () => {
      await renderReady();

      const timeline = screen.getByRole('region', { name: 'Linha do tempo' });
      const preview = screen.getByRole('region', { name: 'Como vai aparecer no karaokê' });

      expect(timeline.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(preview.nextElementSibling).toBe(screen.getByRole('region', { name: 'Marcar tocando' }));
    });

    it('has the effect controls, starting from the time saved for the song', async () => {
      await renderReady(baseRoutes(readySong({ fillPercent: 80 })));

      const preview = screen.getByRole('region', { name: 'Como vai aparecer no karaokê' });
      expect(within(preview).getByRole('button', { name: /Efeito: ligado/ })).toBeInTheDocument();
      expect(within(preview).getByRole('combobox', { name: 'Modelo do efeito' })).toHaveValue('smooth');
      expect(within(preview).getByRole('slider', { name: 'Tempo de preenchimento' })).toHaveValue('80');
    });

    it('saves the fill time for this song by itself', async () => {
      const { fetchMock } = await renderReady();
      const preview = screen.getByRole('region', { name: 'Como vai aparecer no karaokê' });

      fireEvent.click(within(preview).getByRole('button', { name: 'Terminar de pintar mais cedo' }));
      fireEvent.click(within(preview).getByRole('button', { name: 'Terminar de pintar mais cedo' }));

      await waitFor(() => expect(patchedSong(fetchMock)).toEqual([{ fillPercent: 90 }]), SAVE_TIMEOUT);
    });

    it('saves the model choice in the settings of the app', async () => {
      const { fetchMock } = await renderReady();
      const preview = screen.getByRole('region', { name: 'Como vai aparecer no karaokê' });

      fireEvent.change(within(preview).getByRole('combobox', { name: 'Modelo do efeito' }), {
        target: { value: 'words' },
      });

      await waitFor(() =>
        expect(
          requestsTo(fetchMock, 'PATCH', '/api/settings').map(([, init]) => JSON.parse(String(init?.body))),
        ).toEqual([{ 'player.lyricsEffect': 'words' }]),
      );
    });

    it('does not touch the lyrics when only the effect changes', async () => {
      const { fetchMock } = await renderReady();
      const preview = screen.getByRole('region', { name: 'Como vai aparecer no karaokê' });

      fireEvent.click(within(preview).getByRole('button', { name: 'Terminar de pintar mais tarde' }));
      await waitFor(() => expect(patchedSong(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);

      expect(savedBodies(fetchMock)).toHaveLength(0);
      expect(timelineStarts()).toBe('10,18,27,40');
    });
  });

  describe('keyboard', () => {
    it('chooses lines with the arrows and nudges the chosen one with the brackets', async () => {
      await renderReady();

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-selected', '1');
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
      });

      expect(timelineStarts()).toBe('10,18.1,27,40');
    });

    it('never goes past the first or the last line with the arrows', async () => {
      await renderReady();

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-selected', '0');
      for (let press = 0; press < 9; press++) {
        act(() => {
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
      }
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-selected', '3');
    });

    it('undoes with Ctrl+Z, plays with the space bar and marks the chosen line with Enter', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 1 em 0,1 s' }));

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(timelineStarts()).toBe('10,18,27,40');

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(latestEngine().isPlaying).toBe(true);

      latestEngine().isPlaying = false;
      latestEngine().time = 12;
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(timelineStarts()?.split(',')[0]).toBe('11.85');
    });
  });

  describe('saving', () => {
    it('shows the failure to save and lets the user retry', async () => {
      const { fetchMock } = await renderReady(
        baseRoutes(readySong(), LYRICS, { 'PUT /api/songs/s1/lyrics': { status: 500 } }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 1 em 0,1 s' }));

      expect(await screen.findByText(/Não foi possível salvar/, undefined, SAVE_TIMEOUT)).toBeInTheDocument();
      expect(savedBodies(fetchMock)).toHaveLength(1);
    });

    it('keeps the screen and the audio in place when saving changes the lyrics address', async () => {
      const newUrl = '/media/s1/letra.json?v=2';
      const { fetchMock } = await renderReady(
        baseRoutes(readySong(), LYRICS, {
          'PUT /api/songs/s1/lyrics': { body: readySong({ lyricsUrl: newUrl, lyricsSource: 'MANUAL' }) },
          [`GET ${newUrl}`]: { body: LYRICS },
        }),
      );
      const engine = latestEngine();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a linha 1 em 0,1 s' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'GET', newUrl)).toHaveLength(1), SAVE_TIMEOUT);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByTestId('timeline')).toBeInTheDocument();
      expect(audioMock.state.instances).toEqual([engine]);
      expect(engine.destroyed).toBe(false);
      expect(timelineStarts()).toBe('10.1,18,27,40');
    });

    it('saves only the last state after several quick changes', async () => {
      const { fetchMock } = await renderReady();

      for (let click = 0; click < 5; click++) {
        fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra inteira 1 s' }));
      }

      await waitFor(() => expect(savedBodies(fetchMock)).toHaveLength(1), SAVE_TIMEOUT);
      expect(startsOf(savedBodies(fetchMock)[0] as never)).toEqual([15, 23, 32, 45]);
    });
  });

  it('releases the audio when leaving the page', async () => {
    await renderReady();
    const engine = latestEngine();

    fireEvent.click(screen.getByRole('link', { name: /Voltar para a música/ }));

    expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
    expect(engine.destroyed).toBe(true);
  });
});
