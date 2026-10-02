import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsDoc, ProfileDTO, SongDTO } from '@caraoke/shared';
import { buildPlayQueue } from '../../lib/playQueue';
import { useProfileStore } from '../../stores/useProfileStore';
import { useToastStore } from '../../stores/useToastStore';
import { mockApi, requestsTo, type MockRoutes } from '../../test/mockApi';
import { buildProcessingSong, buildSingRequest, buildSong } from '../../test/songBuilder';
import { PlayerPage } from './PlayerPage';

const engineMock = vi.hoisted(() => {
  const state = { instances: [] as unknown[], failLoad: false, hasVocals: true, deferLoad: false };
  let releaseLoad: () => void = () => undefined;

  class FakeEngine {
    onEnded: (() => void) | null = null;
    duration = 200;
    time = 0;
    isPlaying = false;
    voiceGuide = false;
    volume = 1;
    destroyed = false;
    loadedWith: [string, string | null] | null = null;
    seeks: number[] = [];
    playCalls: Array<number | undefined> = [];

    constructor() {
      state.instances.push(this);
    }

    get hasVocals() {
      return state.hasVocals;
    }

    get currentTime() {
      return this.time;
    }

    async load(instrumentalUrl: string, vocalsUrl: string | null) {
      this.loadedWith = [instrumentalUrl, vocalsUrl];
      if (state.deferLoad) await new Promise<void>((resolve) => (releaseLoad = resolve));
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

    setVolume(volume: number) {
      this.volume = volume;
    }

    destroy() {
      this.destroyed = true;
      this.onEnded = null;
    }

    finishSong() {
      this.isPlaying = false;
      this.time = this.duration;
      this.onEnded?.();
    }
  }

  return { FakeEngine, state, release: () => releaseLoad() };
});

vi.mock('../../lib/audio/KaraokeEngine', () => ({ KaraokeEngine: engineMock.FakeEngine }));

const socketMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    socket: {
      on(event: string, handler: Handler) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)?.add(handler);
      },
      off(event: string, handler: Handler) {
        handlers.get(event)?.delete(handler);
      },
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
});

vi.mock('../../realtime/socket', () => ({ getSocket: () => socketMock.socket }));

const microphoneMock = vi.hoisted(() => ({ note: 57 as number | null, fail: true, closed: 0 }));

vi.mock('../../lib/pitch/microphone', () => ({
  MicrophonePitch: {
    open: () =>
      microphoneMock.fail
        ? Promise.reject(new Error('sem microfone'))
        : Promise.resolve({
            sample: () => microphoneMock.note,
            level: () => 0.2,
            close: () => {
              microphoneMock.closed += 1;
            },
          }),
  },
}));

type FakeEngineInstance = InstanceType<typeof engineMock.FakeEngine>;
const engines = () => engineMock.state.instances as FakeEngineInstance[];
const latestEngine = () => engines().at(-1) as FakeEngineInstance;

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};
const BIA: ProfileDTO = { ...ANA, id: 'p2', name: 'Bia', avatar: 'cat' };

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
};

const LYRICS_URL = '/media/s1/letra.json?v=1';
const LYRICS: LyricsDoc = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 20, end: 24, text: 'Primeira linha' },
    { start: 24, end: 28, text: 'Segunda linha' },
  ],
};

function readySong(overrides: Partial<SongDTO> = {}): SongDTO {
  return buildSong({
    id: 's1',
    title: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    lyricsUrl: LYRICS_URL,
    lyricsSource: 'LRCLIB',
    instrumentalUrl: '/media/s1/instrumental.mp3',
    vocalsUrl: '/media/s1/voz.mp3',
    ...overrides,
  });
}

function baseRoutes(song: SongDTO = readySong(), extra: MockRoutes = {}): MockRoutes {
  return {
    'GET /api/songs/s1': { body: song },
    'GET /api/profiles': { body: { items: [ANA, BIA] } },
    'GET /api/settings': { body: APP_SETTINGS },
    'PATCH /api/settings': { body: APP_SETTINGS },
    [`GET ${LYRICS_URL}`]: { body: LYRICS },
    'POST /api/performances': { status: 201, body: { id: 'perf1' } },
    'POST /api/performances/perf1/finish': { body: { finalScore: null } },
    'PATCH /api/songs/s1': { body: song },
    ...extra,
  };
}

function renderPlayer(routes: MockRoutes = baseRoutes(), entries = ['/musica/s1', '/player/s1'], index = 1) {
  const fetchMock = mockApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route path="/player/:songId" element={<PlayerPage />} />
          <Route path="/musica/:id" element={<p>Detalhe da música</p>} />
          <Route path="/biblioteca" element={<p>Biblioteca</p>} />
          <Route path="/fila" element={<p>Fila</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, queryClient, unmount };
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, url: string, index = 0) =>
  JSON.parse(String(requestsTo(fetchMock, method, url)[index]?.[1]?.body));

async function startSinging(singerName?: string) {
  if (singerName) fireEvent.click(await screen.findByRole('radio', { name: singerName }));
  fireEvent.click(await screen.findByRole('button', { name: 'Começar' }));
  await screen.findByRole('button', { name: 'Pausar' });
}

describe('PlayerPage', () => {
  beforeEach(() => {
    engineMock.state.instances = [];
    engineMock.state.failLoad = false;
    engineMock.state.hasVocals = true;
    engineMock.state.deferLoad = false;
    socketMock.handlers.clear();
    microphoneMock.fail = true;
    microphoneMock.note = 57;
    microphoneMock.closed = 0;
    useProfileStore.setState({ currentProfile: ANA });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('choosing who sings', () => {
    it('shows the song and the profiles, with the current profile already selected', async () => {
      renderPlayer();

      expect(await screen.findByRole('heading', { name: 'Evidências' })).toBeInTheDocument();
      expect(screen.getByText('Quem vai cantar esta?')).toBeInTheDocument();
      expect(await screen.findByRole('radio', { name: 'Ana' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Bia' })).not.toBeChecked();
    });

    it('does not touch the audio until the user presses start (browsers need a gesture first)', async () => {
      renderPlayer();
      await screen.findByRole('button', { name: 'Começar' });
      expect(engines()).toHaveLength(0);
    });

    it('goes back without singing', async () => {
      const { fetchMock } = renderPlayer();

      fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

      expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
      expect(requestsTo(fetchMock, 'POST', '/api/performances')).toHaveLength(0);
    });

    it('goes to the song details when the player was opened directly', async () => {
      renderPlayer(baseRoutes(), ['/player/s1'], 0);

      fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

      expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
    });
  });

  describe('starting', () => {
    it('loads both tracks, records who is singing and plays from the start', async () => {
      const { fetchMock } = renderPlayer();

      await startSinging('Bia');

      expect(latestEngine().loadedWith).toEqual(['/media/s1/instrumental.mp3', '/media/s1/voz.mp3']);
      expect(bodyOf(fetchMock, 'POST', '/api/performances')).toEqual({ profileId: 'p2', songId: 's1' });
      expect(latestEngine().playCalls).toEqual([0]);
      expect(screen.getByText('Bia')).toBeInTheDocument();
    });

    it('starts with the guide voice off', async () => {
      renderPlayer();

      await startSinging();

      expect(screen.getByRole('button', { name: /Voz guia/ })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: /Voz guia/ })).toHaveTextContent('desligada');
      expect(latestEngine().voiceGuide).toBe(false);
    });

    it('shows a loading message while the audio loads', async () => {
      engineMock.state.deferLoad = true;
      renderPlayer();
      fireEvent.click(await screen.findByRole('button', { name: 'Começar' }));

      expect(await screen.findByText('Carregando a música…')).toBeInTheDocument();

      await act(async () => engineMock.release());
      await screen.findByRole('button', { name: 'Pausar' });
    });

    it('explains when the audio cannot be loaded, without recording a performance', async () => {
      engineMock.state.failLoad = true;
      const { fetchMock } = renderPlayer();

      fireEvent.click(await screen.findByRole('button', { name: 'Começar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o áudio (404)');
      expect(latestEngine().destroyed).toBe(true);
      expect(requestsTo(fetchMock, 'POST', '/api/performances')).toHaveLength(0);
    });

    it('explains when the performance cannot be recorded', async () => {
      renderPlayer(
        baseRoutes(readySong(), {
          'POST /api/performances': {
            status: 409,
            body: {
              error: { code: 'SONG_NOT_READY', message: 'Esta música ainda não está pronta para cantar' },
            },
          },
        }),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Começar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Esta música ainda não está pronta para cantar',
      );
      expect(latestEngine().isPlaying).toBe(false);
    });

    it('refuses a song that has no instrumental', async () => {
      renderPlayer(baseRoutes(readySong({ instrumentalUrl: null })));

      fireEvent.click(await screen.findByRole('button', { name: 'Começar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Esta música não tem o áudio instrumental');
    });
  });

  describe('controls', () => {
    it('pauses and continues', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
      expect(latestEngine().isPlaying).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      expect(latestEngine().isPlaying).toBe(true);
    });

    it('turns the guide voice on and off, and tells the engine', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.click(screen.getByRole('button', { name: /Voz guia/ }));
      expect(latestEngine().voiceGuide).toBe(true);
      expect(screen.getByRole('button', { name: /Voz guia/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /Voz guia/ })).toHaveTextContent('ligada');

      fireEvent.click(screen.getByRole('button', { name: /Voz guia/ }));
      expect(latestEngine().voiceGuide).toBe(false);
    });

    it('disables the guide voice when the song has no vocals track', async () => {
      engineMock.state.hasVocals = false;
      renderPlayer();
      await startSinging();

      const button = screen.getByRole('button', { name: /Voz guia/ });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Esta música não tem a faixa de voz');
    });

    it('seeks with the position slider', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.change(screen.getByRole('slider', { name: 'Posição da música' }), {
        target: { value: '250' },
      });

      expect(latestEngine().seeks).toEqual([50]);
    });

    it('changes the volume', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '40' } });

      expect(latestEngine().volume).toBe(0.4);
    });

    it('shows the total duration', async () => {
      renderPlayer();
      await startSinging();
      expect(screen.getByText('3:20')).toBeInTheDocument();
    });
  });

  describe('lyrics', () => {
    it('shows the line being sung', async () => {
      renderPlayer();
      await startSinging();

      latestEngine().time = 21;

      await waitFor(() =>
        expect(document.querySelector('p.lyric-enter')?.textContent?.trim()).toBe('Primeira linha'),
      );
      expect(screen.getByText('Segunda linha')).toBeInTheDocument();
    });

    it('says when the song has no lyrics', async () => {
      renderPlayer(baseRoutes(readySong({ lyricsUrl: null, lyricsSource: 'NONE' })));
      await startSinging();
      expect(await screen.findByText('Letra não encontrada')).toBeInTheDocument();
    });

    it('moves the lyrics with the delay buttons and saves the adjustment on its own', async () => {
      const { fetchMock } = renderPlayer();
      await startSinging();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 100 ms' }));
      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 100 ms' }));
      expect(screen.getByLabelText('Atraso da letra')).toHaveTextContent('+200 ms');
      fireEvent.click(screen.getByRole('button', { name: 'Adiantar a letra 100 ms' }));
      expect(screen.getByLabelText('Atraso da letra')).toHaveTextContent('+100 ms');

      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/songs/s1')).toHaveLength(1), {
        timeout: 4000,
      });
      expect(bodyOf(fetchMock, 'PATCH', '/api/songs/s1')).toEqual({ lyricsOffsetMs: 100 });
    });

    it('adds the adjustment to the one already saved for the song', async () => {
      const { fetchMock } = renderPlayer(baseRoutes(readySong({ lyricsOffsetMs: 300 })));
      await startSinging();

      fireEvent.click(screen.getByRole('button', { name: 'Atrasar a letra 100 ms' }));

      expect(screen.getByLabelText('Atraso da letra')).toHaveTextContent('+400 ms');
      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/songs/s1')).toHaveLength(1), {
        timeout: 4000,
      });
      expect(bodyOf(fetchMock, 'PATCH', '/api/songs/s1')).toEqual({ lyricsOffsetMs: 400 });
    });
  });

  describe('keyboard', () => {
    it('plays and pauses with the space bar', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.keyDown(document, { key: ' ' });
      expect(latestEngine().isPlaying).toBe(false);

      fireEvent.keyDown(document, { key: ' ' });
      expect(latestEngine().isPlaying).toBe(true);
    });

    it('toggles the guide voice with V', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.keyDown(document, { key: 'v' });

      expect(latestEngine().voiceGuide).toBe(true);
    });

    it('jumps five seconds with the arrows', async () => {
      renderPlayer();
      await startSinging();
      latestEngine().time = 60;

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      fireEvent.keyDown(document, { key: 'ArrowLeft' });

      expect(latestEngine().seeks).toEqual([65, 60]);
    });

    it('changes the volume with the up and down arrows', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.keyDown(document, { key: 'ArrowDown' });
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      expect(latestEngine().volume).toBe(0.8);

      fireEvent.keyDown(document, { key: 'ArrowUp' });
      expect(latestEngine().volume).toBe(0.9);
    });

    it('adjusts the lyrics delay with the square brackets', async () => {
      renderPlayer();
      await startSinging();

      fireEvent.keyDown(document, { key: ']' });

      expect(screen.getByLabelText('Atraso da letra')).toHaveTextContent('+100 ms');
    });

    it('asks the browser for full screen with F', async () => {
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      document.documentElement.requestFullscreen = requestFullscreen;
      renderPlayer();
      await startSinging();

      fireEvent.keyDown(document, { key: 'f' });

      expect(requestFullscreen).toHaveBeenCalledTimes(1);
    });
  });

  describe('the end of the song', () => {
    it('shows the finish screen and records how it went', async () => {
      const { fetchMock } = renderPlayer();
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('Fim da música')).toBeInTheDocument();
      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'POST', '/api/performances/perf1/finish')).toEqual({
        completed: true,
        voiceGuideUsed: false,
        pitchScore: null,
      });
    });

    it('records that the guide voice was used, even if it was turned off again', async () => {
      const { fetchMock } = renderPlayer();
      await startSinging();
      fireEvent.click(screen.getByRole('button', { name: /Voz guia/ }));
      fireEvent.click(screen.getByRole('button', { name: /Voz guia/ }));

      act(() => latestEngine().finishSong());

      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'POST', '/api/performances/perf1/finish').voiceGuideUsed).toBe(true);
    });

    it('sings again as a new performance of the same singer, with the guide voice off', async () => {
      const { fetchMock } = renderPlayer(
        baseRoutes(readySong(), { 'POST /api/performances': { status: 201, body: { id: 'perf1' } } }),
      );
      await startSinging('Bia');
      fireEvent.click(screen.getByRole('button', { name: /Voz guia/ }));
      act(() => latestEngine().finishSong());

      fireEvent.click(await screen.findByRole('button', { name: 'Cantar de novo' }));
      await screen.findByRole('button', { name: 'Pausar' });

      expect(requestsTo(fetchMock, 'POST', '/api/performances')).toHaveLength(2);
      expect(bodyOf(fetchMock, 'POST', '/api/performances', 1)).toEqual({ profileId: 'p2', songId: 's1' });
      expect(latestEngine().playCalls).toEqual([0, 0]);
      expect(latestEngine().voiceGuide).toBe(false);
      expect(engines()).toHaveLength(1);
    });

    it('goes back from the finish screen', async () => {
      renderPlayer();
      await startSinging();
      act(() => latestEngine().finishSong());

      fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

      expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
    });
  });

  describe('leaving', () => {
    it('leaves right away when it just started, recording that it was not completed', async () => {
      const { fetchMock } = renderPlayer();
      await startSinging();
      latestEngine().time = 2;

      fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

      expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
      expect(latestEngine().destroyed).toBe(true);
      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'POST', '/api/performances/perf1/finish').completed).toBe(false);
    });

    it('asks first when the song is already underway, and lets the user keep singing', async () => {
      renderPlayer();
      await startSinging();
      latestEngine().time = 60;

      fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

      const dialog = await screen.findByRole('dialog', { name: 'Sair da música' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar cantando' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(latestEngine().destroyed).toBe(false);
      expect(screen.queryByText('Detalhe da música')).not.toBeInTheDocument();
    });

    it('leaves after the user confirms', async () => {
      renderPlayer();
      await startSinging();
      latestEngine().time = 60;
      fireEvent.keyDown(document, { key: 'Escape' });

      const dialog = await screen.findByRole('dialog', { name: 'Sair da música' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Sair' }));

      expect(await screen.findByText('Detalhe da música')).toBeInTheDocument();
    });

    it('counts a song left near the end as completed', async () => {
      const { fetchMock } = renderPlayer();
      await startSinging();
      latestEngine().time = 185;
      fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sair' }));

      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
      );
      expect(bodyOf(fetchMock, 'POST', '/api/performances/perf1/finish').completed).toBe(true);
    });

    it('closes the performance and stops the audio when the page is closed', async () => {
      const { fetchMock, unmount } = renderPlayer();
      await startSinging();
      const engine = latestEngine();

      unmount();

      expect(engine.destroyed).toBe(true);
      await waitFor(() =>
        expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
      );
    });
  });

  describe('the lyrics effect', () => {
    const settingsBody = (changes: Record<string, unknown>) => ({ ...APP_SETTINGS, ...changes });
    const patchedSettings = (fetchMock: ReturnType<typeof mockApi>) =>
      requestsTo(fetchMock, 'PATCH', '/api/settings').map(([, init]) => JSON.parse(String(init?.body)));
    const patchedSong = (fetchMock: ReturnType<typeof mockApi>) =>
      requestsTo(fetchMock, 'PATCH', '/api/songs/s1').map(([, init]) => JSON.parse(String(init?.body)));
    const wordProgress = (word: string) =>
      Number((screen.getByText(word).closest('.lyric-fill') as HTMLElement).style.getPropertyValue('--p'));

    it('shows only the button that turns the effect on and off', async () => {
      renderPlayer();
      await startSinging();

      expect(await screen.findByRole('button', { name: /Efeito: ligado/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByRole('combobox', { name: 'Modelo do efeito' })).not.toBeInTheDocument();
      expect(screen.queryByRole('slider', { name: 'Tempo de preenchimento' })).not.toBeInTheDocument();
    });

    it('turns the effect off, paints the whole line at once and remembers the choice', async () => {
      const { fetchMock } = renderPlayer(
        baseRoutes(readySong(), {
          'PATCH /api/settings': { body: settingsBody({ 'player.lyricsEffectEnabled': false }) },
        }),
      );
      await startSinging();
      latestEngine().time = 20.1;
      await waitFor(() => expect(wordProgress('Primeira')).toBeLessThan(1));

      fireEvent.click(await screen.findByRole('button', { name: /Efeito: ligado/ }));

      expect(await screen.findByRole('button', { name: /Efeito: desligado/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await waitFor(() => expect(wordProgress('Primeira')).toBe(1));
      expect(wordProgress('linha')).toBe(1);
      await waitFor(() =>
        expect(patchedSettings(fetchMock)).toEqual([{ 'player.lyricsEffectEnabled': false }]),
      );
    });

    it('turns the effect back on', async () => {
      renderPlayer(
        baseRoutes(readySong(), {
          'GET /api/settings': { body: settingsBody({ 'player.lyricsEffectEnabled': false }) },
          'PATCH /api/settings': { body: APP_SETTINGS },
        }),
      );
      await startSinging();

      fireEvent.click(await screen.findByRole('button', { name: /Efeito: desligado/ }));

      expect(await screen.findByRole('button', { name: /Efeito: ligado/ })).toBeInTheDocument();
    });

    it('turns it on and off with the E key', async () => {
      const { fetchMock } = renderPlayer(
        baseRoutes(readySong(), {
          'PATCH /api/settings': { body: settingsBody({ 'player.lyricsEffectEnabled': false }) },
        }),
      );
      await startSinging();
      await screen.findByRole('button', { name: /Efeito: ligado/ });

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
      });

      expect(await screen.findByRole('button', { name: /Efeito: desligado/ })).toBeInTheDocument();
      await waitFor(() => expect(patchedSettings(fetchMock)).toHaveLength(1));
    });

    it('paints with the model chosen in the settings', async () => {
      renderPlayer(
        baseRoutes(readySong(), {
          'GET /api/settings': { body: settingsBody({ 'player.lyricsEffect': 'words' }) },
        }),
      );
      await startSinging();
      latestEngine().time = 20.1;

      await waitFor(() => expect([wordProgress('Primeira'), wordProgress('linha')]).toEqual([1, 0]));
    });

    it('goes back to the previous choice and warns when the choice cannot be saved', async () => {
      renderPlayer(baseRoutes(readySong(), { 'PATCH /api/settings': { status: 500 } }));
      await startSinging();

      fireEvent.click(await screen.findByRole('button', { name: /Efeito: ligado/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Efeito: ligado/ })).toBeInTheDocument());
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        'Não foi possível guardar a escolha do efeito da letra',
      );
    });

    it('paints the line sooner with a smaller time', async () => {
      renderPlayer(baseRoutes(readySong({ fillPercent: 50 })));
      await startSinging();

      latestEngine().time = 22;

      await waitFor(() => expect(wordProgress('linha')).toBe(1));
    });

    it('does not change the time saved for the song', async () => {
      const { fetchMock } = renderPlayer(baseRoutes(readySong({ fillPercent: 70 })));
      await startSinging();
      await screen.findByRole('button', { name: /Efeito: ligado/ });

      expect(patchedSong(fetchMock)).toEqual([]);
    });
  });

  describe('songs that cannot be sung', () => {
    it('says the song was not found', async () => {
      renderPlayer({
        'GET /api/songs/s1': { status: 404, body: { error: { code: 'SONG_NOT_FOUND', message: 'x' } } },
      });

      expect(await screen.findByRole('heading', { name: 'Música não encontrada' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar para a biblioteca' })).toHaveAttribute(
        'href',
        '/biblioteca',
      );
    });

    it('sends the user to the queue when the song is not ready', async () => {
      renderPlayer({ 'GET /api/songs/s1': { body: buildProcessingSong({ id: 's1' }) } });

      expect(
        await screen.findByRole('heading', { name: 'Esta música ainda não está pronta' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ver a fila de processamento' })).toHaveAttribute(
        'href',
        '/fila',
      );
      expect(engines()).toHaveLength(0);
    });
  });

  describe('playing a playlist', () => {
    const first = () => readySong({ id: 's1', title: 'Primeira' });
    const second = () =>
      buildSong({
        id: 's2',
        title: 'Segunda',
        instrumentalUrl: '/media/s2/instrumental.mp3',
        vocalsUrl: '/media/s2/voz.mp3',
      });
    const broken = () => buildSong({ id: 's3', title: 'Quebrada', status: 'ERROR' });

    function playlistRoutes(items: SongDTO[]): MockRoutes {
      return {
        ...baseRoutes(first(), { 'GET /api/songs/s2': { body: second() } }),
        'GET /api/playlists/pl1': { body: { id: 'pl1', name: 'Festa', profileId: 'p1', items } },
      };
    }

    it('offers the next song when a song ends, telling the position in the playlist', async () => {
      renderPlayer(playlistRoutes([first(), second()]), ['/player/s1?playlist=pl1'], 0);
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('Música 1 de 2 da playlist')).toBeInTheDocument();
      expect(screen.getByText('A seguir: Segunda')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Próxima música' })).toBeInTheDocument();
    });

    it('goes to the next song, asking again to start, with the same singer already chosen', async () => {
      renderPlayer(playlistRoutes([first(), second()]), ['/musica/s1', '/player/s1?playlist=pl1']);
      await startSinging('Bia');
      act(() => latestEngine().finishSong());

      fireEvent.click(await screen.findByRole('button', { name: 'Próxima música' }));

      expect(await screen.findByRole('heading', { name: 'Segunda' })).toBeInTheDocument();
      expect(screen.getByText('Quem vai cantar esta?')).toBeInTheDocument();
      expect(await screen.findByRole('radio', { name: 'Bia' })).toBeChecked();
    });

    it('releases the audio of the song that ended before the next one', async () => {
      renderPlayer(playlistRoutes([first(), second()]), ['/player/s1?playlist=pl1'], 0);
      await startSinging();
      const ended = latestEngine();
      act(() => ended.finishSong());

      fireEvent.click(await screen.findByRole('button', { name: 'Próxima música' }));

      await screen.findByRole('heading', { name: 'Segunda' });
      expect(ended.destroyed).toBe(true);
    });

    it('skips songs that are not ready', async () => {
      renderPlayer(playlistRoutes([first(), broken(), second()]), ['/player/s1?playlist=pl1'], 0);
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('Música 1 de 2 da playlist')).toBeInTheDocument();
      expect(screen.getByText('A seguir: Segunda')).toBeInTheDocument();
    });

    it('says the playlist is over after the last song', async () => {
      renderPlayer(playlistRoutes([second(), first()]), ['/player/s1?playlist=pl1'], 0);
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('Fim da playlist! 🎉')).toBeInTheDocument();
      expect(screen.getByText('Música 2 de 2 da playlist')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Próxima música' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cantar de novo' })).toBeInTheDocument();
    });

    it('follows the same shuffled order for the same seed', async () => {
      const songs = [
        first(),
        second(),
        buildSong({ id: 's4', title: 'Quarta' }),
        buildSong({ id: 's5', title: 'Quinta' }),
      ];
      const expectedOrder = buildPlayQueue(songs, 5).map((song) => song.id);
      const startId = expectedOrder[0] as string;
      const nextId = expectedOrder[1] as string;
      renderPlayer(
        {
          ...playlistRoutes(songs),
          [`GET /api/songs/${startId}`]: { body: songs.find((song) => song.id === startId) },
          [`GET /api/songs/${nextId}`]: { body: songs.find((song) => song.id === nextId) },
        },
        [`/player/${startId}?playlist=pl1&shuffle=5`],
        0,
      );
      await startSinging();

      act(() => latestEngine().finishSong());

      const nextTitle = songs.find((song) => song.id === nextId)?.title;
      expect(await screen.findByText(`A seguir: ${nextTitle}`)).toBeInTheDocument();
    });

    it('works like a single song when the playlist does not have it', async () => {
      renderPlayer(playlistRoutes([second()]), ['/player/s1?playlist=pl1'], 0);
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('Fim da música')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Próxima música' })).not.toBeInTheDocument();
    });

    it('has no next song when the player was not opened from a playlist', async () => {
      renderPlayer();
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('Fim da música')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Próxima música' })).not.toBeInTheDocument();
    });
  });

  describe('the singers queue', () => {
    const CARLA: ProfileDTO = { ...ANA, id: 'g1', name: 'Carla', avatar: 'frog', isGuest: true };
    const asRequester = (profile: ProfileDTO) => ({
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      isGuest: profile.isGuest,
    });
    const second = () =>
      buildSong({
        id: 's2',
        title: 'Segunda',
        instrumentalUrl: '/media/s2/instrumental.mp3',
        vocalsUrl: '/media/s2/voz.mp3',
      });

    function queueRoutes(
      requests: ReturnType<typeof buildSingRequest>[],
      extra: MockRoutes = {},
    ): MockRoutes {
      return {
        ...baseRoutes(readySong(), {
          'GET /api/profiles': { body: { items: [ANA, BIA, CARLA] } },
          'GET /api/songs/s2': { body: second() },
          ...extra,
        }),
        'GET /api/sing-queue': { body: { items: requests } },
      };
    }

    const carlaRequest = () => buildSingRequest({ id: 'r1', profile: asRequester(CARLA), song: readySong() });

    it('calls the person who asked for the song, already selected', async () => {
      renderPlayer(queueRoutes([carlaRequest()]), ['/player/s1?pedido=r1'], 0);

      expect(await screen.findByText('Vez de Carla! 🎤')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Carla' })).toBeChecked());
    });

    it('takes the request out of the queue when the performance starts', async () => {
      const { fetchMock } = renderPlayer(queueRoutes([carlaRequest()]), ['/player/s1?pedido=r1'], 0);
      await screen.findByText('Vez de Carla! 🎤');
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Carla' })).toBeChecked());

      await startSinging();

      expect(bodyOf(fetchMock, 'POST', '/api/performances')).toEqual({
        profileId: 'g1',
        songId: 's1',
        requestId: 'r1',
      });
    });

    it('lets someone else sing the request', async () => {
      const { fetchMock } = renderPlayer(queueRoutes([carlaRequest()]), ['/player/s1?pedido=r1'], 0);
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Carla' })).toBeChecked());

      await startSinging('Bia');

      expect(bodyOf(fetchMock, 'POST', '/api/performances')).toMatchObject({
        profileId: 'p2',
        requestId: 'r1',
      });
    });

    it('works like a single song when the request is gone', async () => {
      renderPlayer(queueRoutes([]), ['/player/s1?pedido=r1'], 0);

      expect(await screen.findByText('Quem vai cantar esta?')).toBeInTheDocument();
      expect(await screen.findByRole('radio', { name: 'Ana' })).toBeChecked();
    });

    it('does not send the request again when singing the same song again', async () => {
      const { fetchMock } = renderPlayer(queueRoutes([carlaRequest()]), ['/player/s1?pedido=r1'], 0);
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Carla' })).toBeChecked());
      await startSinging();
      act(() => latestEngine().finishSong());

      fireEvent.click(await screen.findByRole('button', { name: 'Cantar de novo' }));

      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/performances')).toHaveLength(2));
      expect(bodyOf(fetchMock, 'POST', '/api/performances', 1)).toEqual({ profileId: 'g1', songId: 's1' });
    });

    it('offers to call the next singer with a ready song when the song ends', async () => {
      const preparing = buildSingRequest({
        id: 'r2',
        profile: asRequester(ANA),
        song: buildProcessingSong({ title: 'Ainda não' }),
      });
      const bia = buildSingRequest({ id: 'r3', profile: asRequester(BIA), song: second() });
      renderPlayer(queueRoutes([carlaRequest(), preparing, bia]), ['/player/s1?pedido=r1'], 0);
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Carla' })).toBeChecked());
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByText('A seguir: Bia — Segunda')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Chamar o próximo' }));

      expect(await screen.findByRole('heading', { name: 'Segunda' })).toBeInTheDocument();
      expect(await screen.findByText('Vez de Bia! 🎤')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Bia' })).toBeChecked());
    });

    it('calls the next singer even when they asked for the same song', async () => {
      const biaSameSong = buildSingRequest({ id: 'r3', profile: asRequester(BIA), song: readySong() });
      renderPlayer(queueRoutes([carlaRequest(), biaSameSong]), ['/player/s1?pedido=r1'], 0);
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Carla' })).toBeChecked());
      await startSinging();
      act(() => latestEngine().finishSong());

      fireEvent.click(await screen.findByRole('button', { name: 'Chamar o próximo' }));

      expect(await screen.findByText('Vez de Bia! 🎤')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Começar' })).toBeInTheDocument();
    });

    it('also offers the next singer after a song played on its own', async () => {
      const bia = buildSingRequest({ id: 'r3', profile: asRequester(BIA), song: second() });
      renderPlayer(queueRoutes([bia]), ['/player/s1'], 0);
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByRole('button', { name: 'Chamar o próximo' })).toBeInTheDocument();
    });

    it('keeps following the playlist when the player was opened by one', async () => {
      const bia = buildSingRequest({ id: 'r3', profile: asRequester(BIA), song: second() });
      renderPlayer(
        {
          ...queueRoutes([bia]),
          'GET /api/playlists/pl1': {
            body: { id: 'pl1', name: 'Festa', profileId: 'p1', items: [readySong(), second()] },
          },
        },
        ['/player/s1?playlist=pl1'],
        0,
      );
      await startSinging();

      act(() => latestEngine().finishSong());

      expect(await screen.findByRole('button', { name: 'Próxima música' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Chamar o próximo' })).not.toBeInTheDocument();
    });
  });

  describe('the score', () => {
    const PERFORMANCE = 'perf1';
    const finishWith = (body: unknown, extra: MockRoutes = {}) =>
      baseRoutes(readySong(), { 'POST /api/performances/perf1/finish': { body }, ...extra });
    const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
    const FINAL = {
      performanceId: PERFORMANCE,
      pitchScore: null,
      audienceScore: 82,
      finalScore: 82,
      votes: 3,
    };

    async function singToTheEnd(routes: MockRoutes) {
      const rendered = renderPlayer(routes);
      await startSinging();
      act(() => latestEngine().finishSong());
      return rendered;
    }

    it('asks the audience to vote, counting down and counting the votes as they arrive', async () => {
      await singToTheEnd(finishWith({ voting: { endsAt: inSeconds(20) } }));

      expect(await screen.findByText('Plateia, deem sua nota pelo celular!')).toBeInTheDocument();
      expect(screen.getByRole('timer', { name: 'Tempo para votar' })).toHaveTextContent(/^(19|20)segundos$/);
      expect(screen.getByText('votos')).toBeInTheDocument();

      act(() => socketMock.emit('vote:progress', { performanceId: PERFORMANCE, count: 2 }));
      expect(screen.getByText('2')).toBeInTheDocument();
      act(() => socketMock.emit('vote:progress', { performanceId: 'other', count: 9 }));
      expect(screen.queryByText('9')).not.toBeInTheDocument();
    });

    it('shows the final score with its phrase and parts when the voting ends', async () => {
      await singToTheEnd(finishWith({ voting: { endsAt: inSeconds(20) } }));
      await screen.findByText('Plateia, deem sua nota pelo celular!');

      act(() => socketMock.emit('score:final', FINAL));

      expect(await screen.findByRole('status', { name: 'Nota 82' })).toBeInTheDocument();
      expect(screen.getByText('Mandou bem!')).toBeInTheDocument();
      expect(screen.getByText('👏 Plateia 82 (3 votos)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cantar de novo' })).toBeInTheDocument();
    });

    it('ignores the score of another performance', async () => {
      await singToTheEnd(finishWith({ voting: { endsAt: inSeconds(20) } }));
      await screen.findByText('Plateia, deem sua nota pelo celular!');

      act(() => socketMock.emit('score:final', { ...FINAL, performanceId: 'other' }));

      expect(screen.getByText('Plateia, deem sua nota pelo celular!')).toBeInTheDocument();
    });

    it('closes the voting earlier from the TV', async () => {
      const { fetchMock } = await singToTheEnd(
        finishWith(
          { voting: { endsAt: inSeconds(20) } },
          {
            'POST /api/performances/perf1/voting/close': {
              body: { ...FINAL, finalScore: 96, audienceScore: 96 },
            },
          },
        ),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Encerrar votação' }));

      expect(await screen.findByRole('status', { name: 'Nota 96' })).toBeInTheDocument();
      expect(screen.getByText('Lenda do karaokê!')).toBeInTheDocument();
      expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/voting/close')).toHaveLength(1);
    });

    it('stops waiting a few seconds after the time is up', async () => {
      await singToTheEnd(finishWith({ voting: { endsAt: inSeconds(-6) } }));

      expect(await screen.findByText('Fim da música')).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: /^Nota/ })).not.toBeInTheDocument();
    });

    it('shows the score right away when the audience does not vote', async () => {
      await singToTheEnd(finishWith({ finalScore: 64 }));

      expect(await screen.findByRole('status', { name: 'Nota 64' })).toBeInTheDocument();
      expect(screen.getByText('Tá no caminho!')).toBeInTheDocument();
      expect(screen.queryByText('Plateia, deem sua nota pelo celular!')).not.toBeInTheDocument();
    });

    it('keeps the plain finish screen when there is no score', async () => {
      await singToTheEnd(finishWith({ finalScore: null }));

      expect(await screen.findByText('Mandou bem! 🎤')).toBeInTheDocument();
    });

    describe('with a microphone', () => {
      const MELODY_URL = '/media/s1/melodia.json';
      const melodySong = () => readySong({ melodyUrl: MELODY_URL });
      const melodyRoutes = (extra: MockRoutes = {}) =>
        baseRoutes(melodySong(), {
          [`GET ${MELODY_URL}`]: { body: { version: 1, step: 0.02, start: 0, midi: Array(500).fill(57) } },
          'POST /api/performances/perf1/finish': { body: { finalScore: 100 } },
          ...extra,
        });

      it('shows the live pitch and sends the pitch score at the end', async () => {
        microphoneMock.fail = false;
        const { fetchMock } = renderPlayer(melodyRoutes());
        await startSinging();

        const meter = await screen.findByRole('group', { name: 'Afinação ao vivo' });
        latestEngine().time = 5;
        await waitFor(() => expect(meter).toHaveTextContent('Nota alvoLáLáNota: 100'), { timeout: 3000 });
        act(() => latestEngine().finishSong());

        await waitFor(() =>
          expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
        );
        expect(bodyOf(fetchMock, 'POST', '/api/performances/perf1/finish')).toMatchObject({
          pitchScore: 100,
        });
      });

      it('sings without the pitch when there is no microphone', async () => {
        const { fetchMock } = renderPlayer(melodyRoutes());
        await startSinging();

        expect(screen.queryByRole('group', { name: 'Afinação ao vivo' })).not.toBeInTheDocument();
        act(() => latestEngine().finishSong());
        await waitFor(() =>
          expect(requestsTo(fetchMock, 'POST', '/api/performances/perf1/finish')).toHaveLength(1),
        );
        expect(bodyOf(fetchMock, 'POST', '/api/performances/perf1/finish')).toMatchObject({
          pitchScore: null,
        });
      });

      it('does not use the microphone when the score is only from the audience', async () => {
        microphoneMock.fail = false;
        renderPlayer(
          melodyRoutes({ 'GET /api/settings': { body: { ...APP_SETTINGS, 'scoring.mode': 'audience' } } }),
        );
        await startSinging();

        expect(screen.queryByRole('group', { name: 'Afinação ao vivo' })).not.toBeInTheDocument();
      });

      it('releases the microphone when leaving', async () => {
        microphoneMock.fail = false;
        const { unmount } = renderPlayer(melodyRoutes());
        await startSinging();
        await screen.findByRole('group', { name: 'Afinação ao vivo' });

        unmount();

        expect(microphoneMock.closed).toBe(1);
      });
    });
  });
});
