import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsDoc, SongDTO } from '@caraoke/shared';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSong } from '../../test/songBuilder';
import { LyricsSyncPage } from './LyricsSyncPage';

const audioMock = vi.hoisted(() => {
  const state = {
    instances: [] as unknown[],
    failLoad: false,
    onset: 34.65 as number | null,
    analysisFails: false,
  };

  class FakeEngine {
    onEnded: (() => void) | null = null;
    duration = 258;
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
      return { envelope: new Float32Array(100).fill(0.5), onset: audioMock.state.onset, duration: 258 };
    }),
  };
});

vi.mock('./SyncTimeline', () => ({
  SyncTimeline: (props: {
    offsetMs: number;
    zoomSeconds: number;
    onOffsetChange: (value: number) => void;
    onSeek: (seconds: number) => void;
  }) => (
    <div data-testid="timeline" data-offset={props.offsetMs} data-zoom={props.zoomSeconds}>
      <button type="button" onClick={() => props.onOffsetChange(2340)}>
        arrastar letra
      </button>
      <button type="button" onClick={() => props.onSeek(77)}>
        tocar na onda
      </button>
    </div>
  ),
}));

type FakeEngineInstance = InstanceType<typeof audioMock.FakeEngine>;
const latestEngine = () => audioMock.state.instances.at(-1) as FakeEngineInstance;

const LYRICS_URL = '/media/s1/letra.json?v=1';
const LYRICS: LyricsDoc = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 19.24, end: 27.45, text: 'Ela dormiu no calor dos meus braços' },
    { start: 27.45, end: 35.74, text: 'E eu acordei sem saber se era um sonho' },
  ],
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

function baseRoutes(song: SongDTO = readySong(), lyrics: LyricsDoc = LYRICS, extra: MockRoutes = {}) {
  return {
    'GET /api/songs/s1': { body: song },
    [`GET ${LYRICS_URL}`]: { body: lyrics },
    'PATCH /api/songs/s1': { body: song },
    ...extra,
  } satisfies MockRoutes;
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
  return { fetchMock };
}

const patchBodies = (fetchMock: ReturnType<typeof mockApi>) =>
  requestsTo(fetchMock, 'PATCH', '/api/songs/s1').map(([, init]) => JSON.parse(String(init?.body)));

const currentOffset = () => screen.getByLabelText('Ajuste atual da letra').textContent;

async function renderReady(routes?: MockRoutes) {
  const rendered = renderPage(routes);
  await screen.findByRole('button', { name: 'Alinhar com a voz' }).catch(() => undefined);
  await screen.findByTestId('timeline');
  return rendered;
}

describe('LyricsSyncPage', () => {
  beforeEach(() => {
    audioMock.state.instances = [];
    audioMock.state.failLoad = false;
    audioMock.state.onset = 34.65;
    audioMock.state.analysisFails = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

    it('explains when the lyrics have no timestamps', async () => {
      renderPage(baseRoutes(readySong(), { ...LYRICS, synced: false }));
      expect(await screen.findByText('A letra não tem tempos')).toBeInTheDocument();
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

  describe('automatic alignment', () => {
    it('tells where the voice starts and what the alignment would be', async () => {
      await renderReady();
      const panel = screen.getByRole('region', { name: 'Alinhar automaticamente' });
      expect(panel).toHaveTextContent('0:34,7');
      expect(panel).toHaveTextContent('0:19,2');
      expect(panel).toHaveTextContent('15,41 s de atraso');
    });

    it('applies the suggestion and saves it by itself', async () => {
      const { fetchMock } = await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Alinhar com a voz' }));

      expect(currentOffset()).toBe('+15,41 s');
      await waitFor(() => expect(patchBodies(fetchMock)).toEqual([{ lyricsOffsetMs: 15410 }]));
      expect(screen.getByRole('button', { name: 'Alinhar com a voz' })).toBeDisabled();
      expect(screen.getByText('Já está alinhada ✓')).toBeInTheDocument();
    });

    it('says so when the voice start cannot be detected', async () => {
      audioMock.state.onset = null;
      await renderReady();
      expect(screen.getByText(/Não consegui achar sozinho onde a voz começa/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alinhar com a voz' })).not.toBeInTheDocument();
    });

    it('starts from the offset the song already has', async () => {
      await renderReady(baseRoutes(readySong({ lyricsOffsetMs: 15410 })));
      expect(currentOffset()).toBe('+15,41 s');
      expect(screen.getByText('Já está alinhada ✓')).toBeInTheDocument();
    });
  });

  describe('manual adjustment', () => {
    it('moves the lyrics with the step buttons, in both directions', async () => {
      await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 5 s' }));
      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 0,1 s' }));
      expect(currentOffset()).toBe('+5,10 s');

      fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra 1 s' }));
      fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra 0,01 s' }));
      expect(currentOffset()).toBe('+4,09 s');
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-offset', '4090');
    });

    it('never goes beyond one minute', async () => {
      await renderReady(baseRoutes(readySong({ lyricsOffsetMs: 58000 })));
      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 5 s' }));
      expect(currentOffset()).toBe('+60,00 s');
    });

    it('follows the lyrics being dragged on the timeline and saves the result', async () => {
      const { fetchMock } = await renderReady();

      fireEvent.click(screen.getByRole('button', { name: 'arrastar letra' }));

      expect(currentOffset()).toBe('+2,34 s');
      await waitFor(() => expect(patchBodies(fetchMock)).toEqual([{ lyricsOffsetMs: 2340 }]));
    });

    it('keeps the screen and the audio in place when saving changes the lyrics address', async () => {
      const newUrl = '/media/s1/letra.json?v=2';
      const { fetchMock } = await renderReady(
        baseRoutes(readySong(), LYRICS, {
          'PATCH /api/songs/s1': { body: readySong({ lyricsUrl: newUrl, lyricsOffsetMs: 1000 }) },
          [`GET ${newUrl}`]: { body: LYRICS },
        }),
      );
      const engine = latestEngine();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 1 s' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'GET', newUrl)).toHaveLength(1));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByTestId('timeline')).toBeInTheDocument();
      expect(audioMock.state.instances).toEqual([engine]);
      expect(engine.destroyed).toBe(false);
      expect(screen.getByRole('button', { name: /Voltar ao de quando abri/ })).toBeEnabled();
    });

    it('saves only the last value after several quick changes', async () => {
      const { fetchMock } = await renderReady();

      for (let click = 0; click < 5; click++) {
        fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 1 s' }));
      }

      await waitFor(() => expect(patchBodies(fetchMock)).toEqual([{ lyricsOffsetMs: 5000 }]));
    });

    it('clears the adjustment and goes back to what it was when the page opened', async () => {
      await renderReady(baseRoutes(readySong({ lyricsOffsetMs: 700 })));
      expect(screen.getByRole('button', { name: /Voltar ao de quando abri/ })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 1 s' }));
      expect(currentOffset()).toBe('+1,70 s');

      fireEvent.click(screen.getByRole('button', { name: /Voltar ao de quando abri/ }));
      expect(currentOffset()).toBe('+0,70 s');

      fireEvent.click(screen.getByRole('button', { name: /Tirar o ajuste/ }));
      expect(currentOffset()).toBe('0,00 s');
      expect(screen.getByRole('button', { name: /Tirar o ajuste/ })).toBeDisabled();
    });

    it('shows the failure to save and lets the user retry', async () => {
      const { fetchMock } = await renderReady(
        baseRoutes(readySong(), LYRICS, { 'PATCH /api/songs/s1': { status: 500 } }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 1 s' }));

      expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument();
      expect(patchBodies(fetchMock)).toEqual([{ lyricsOffsetMs: 1000 }]);
    });
  });

  describe('listening and marking', () => {
    it('plays from a little before the first line, already counting the offset', async () => {
      await renderReady(baseRoutes(readySong({ lyricsOffsetMs: 15410 })));

      fireEvent.click(screen.getByRole('button', { name: 'Da primeira linha' }));

      expect(latestEngine().playCalls.at(-1)).toBeCloseTo(19.24 + 15.41 - 3, 5);
      expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    });

    it('plays and pauses, and the voice starts on', async () => {
      await renderReady();
      expect(latestEngine().voiceGuide).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
      expect(latestEngine().isPlaying).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
      expect(latestEngine().isPlaying).toBe(false);
    });

    it('turns the voice off and on', async () => {
      await renderReady();
      const button = screen.getByRole('button', { name: /Voz:/ });
      expect(button).toHaveTextContent('ligada');

      fireEvent.click(button);
      expect(latestEngine().voiceGuide).toBe(false);
      expect(button).toHaveTextContent('desligada');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks the chosen line at the paused position, without reaction compensation', async () => {
      await renderReady();
      latestEngine().time = 34.7;

      fireEvent.click(screen.getByRole('button', { name: 'Esta linha começa agora' }));

      expect(currentOffset()).toBe('+15,46 s');
    });

    it('marks while playing and discounts the reaction time', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
      latestEngine().time = 34.9;

      fireEvent.click(screen.getByRole('button', { name: 'Esta linha começa agora' }));

      expect(currentOffset()).toBe('+15,51 s');
    });

    it('marks another line when it is chosen in the list', async () => {
      await renderReady();
      fireEvent.change(screen.getByLabelText('Linha para marcar'), { target: { value: '1' } });
      latestEngine().time = 40;

      fireEvent.click(screen.getByRole('button', { name: 'Esta linha começa agora' }));

      expect(currentOffset()).toBe('+12,55 s');
    });

    it('seeks when the user touches the waveform', async () => {
      await renderReady();
      fireEvent.click(screen.getByRole('button', { name: 'tocar na onda' }));
      expect(latestEngine().seeks).toEqual([19.24 - 3, 77]);
    });

    it('changes the zoom of the timeline', async () => {
      await renderReady();
      expect(screen.getByTestId('timeline')).toHaveAttribute('data-zoom', '20');

      fireEvent.click(screen.getByRole('button', { name: '40 s' }));

      expect(screen.getByTestId('timeline')).toHaveAttribute('data-zoom', '40');
      expect(screen.getByRole('button', { name: '40 s' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('keyboard', () => {
    it('marks with M, nudges with the brackets and plays with the space bar', async () => {
      await renderReady();
      latestEngine().time = 20.24;

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      });
      expect(currentOffset()).toBe('+1,00 s');

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
      });
      expect(currentOffset()).toBe('+1,10 s');

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(latestEngine().isPlaying).toBe(true);
    });
  });

  it('releases the audio when leaving the page', async () => {
    const { fetchMock } = await renderReady();
    const engine = latestEngine();
    expect(requestsTo(fetchMock, 'GET', '/api/songs/s1')).toHaveLength(1);

    fireEvent.click(screen.getByRole('link', { name: /Voltar para a música/ }));

    expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
    expect(engine.destroyed).toBe(true);
  });
});
