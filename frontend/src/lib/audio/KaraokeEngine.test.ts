import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KaraokeEngine,
  type AudioBufferLike,
  type AudioContextLike,
  type BufferSourceLike,
  type GainNodeLike,
} from './KaraokeEngine';

class FakeGain implements GainNodeLike {
  gain = { value: 1, setTargetAtTime: vi.fn() };
  destination: unknown = null;

  connect(destination: unknown): void {
    this.destination = destination;
  }
}

class FakeSource implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  onended: ((event: Event) => void) | null = null;
  destination: unknown = null;
  started: { when: number | undefined; offset: number | undefined } | null = null;
  stopped = false;
  disconnected = false;
  stopError = false;

  connect(destination: unknown): void {
    this.destination = destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  start(when?: number, offset?: number): void {
    this.started = { when, offset };
  }

  stop(): void {
    if (this.stopError) throw new Error('already stopped');
    this.stopped = true;
  }

  finishNaturally(): void {
    this.onended?.(new Event('ended'));
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 100;
  destination = { name: 'speakers' };
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  resumed = 0;
  closed = false;
  buffers = new Map<number, AudioBufferLike>();

  createGain(): GainNodeLike {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): BufferSourceLike {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  async decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike> {
    return { duration: data.byteLength };
  }

  async resume(): Promise<void> {
    this.resumed += 1;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

const SONG_SECONDS = 200;
const VOCALS_SECONDS = 199;
const START_DELAY = 0.05;

function setup(options: { failVocals?: boolean; failInstrumental?: boolean } = {}) {
  const context = new FakeContext();
  const fetchAudio = vi.fn(async (url: string) => {
    if (url.includes('instrumental') && options.failInstrumental) throw new Error('404');
    if (url.includes('voz') && options.failVocals) throw new Error('404');
    return new ArrayBuffer(url.includes('voz') ? VOCALS_SECONDS : SONG_SECONDS);
  });
  const engine = new KaraokeEngine({ createContext: () => context, fetchAudio });
  return { context, engine, fetchAudio };
}

async function loaded(options: Parameters<typeof setup>[0] = {}) {
  const parts = setup(options);
  await parts.engine.load('/media/s/instrumental.mp3', '/media/s/voz.mp3');
  return parts;
}

const [instrumentalSource, vocalSource] = [0, 1];

describe('KaraokeEngine', () => {
  describe('loading', () => {
    it('loads both tracks and reports the duration of the instrumental', async () => {
      const { engine, fetchAudio } = await loaded();

      expect(fetchAudio).toHaveBeenCalledTimes(2);
      expect(engine.duration).toBe(SONG_SECONDS);
      expect(engine.hasVocals).toBe(true);
      expect(engine.currentTime).toBe(0);
    });

    it('works without a vocals file', async () => {
      const { engine, fetchAudio } = setup();

      await engine.load('/media/s/instrumental.mp3', null);

      expect(fetchAudio).toHaveBeenCalledTimes(1);
      expect(engine.hasVocals).toBe(false);
    });

    it('keeps going without the guide voice when the vocals cannot be loaded', async () => {
      const { engine } = await loaded({ failVocals: true });

      expect(engine.hasVocals).toBe(false);
      expect(engine.duration).toBe(SONG_SECONDS);
    });

    it('fails when the instrumental cannot be loaded', async () => {
      const { engine } = setup({ failInstrumental: true });
      await expect(engine.load('/media/s/instrumental.mp3', '/media/s/voz.mp3')).rejects.toThrow('404');
    });

    it('starts silent, with the guide voice off', async () => {
      const { context } = await loaded();
      const vocalGain = context.gains[1];

      expect(vocalGain?.gain.value).toBe(0);
    });
  });

  describe('playing', () => {
    it('starts both tracks together, at the same moment and the same position', async () => {
      const { engine, context } = await loaded();

      engine.play();

      const instrumental = context.sources[instrumentalSource];
      const vocals = context.sources[vocalSource];
      expect(instrumental?.started).toEqual({ when: 100 + START_DELAY, offset: 0 });
      expect(vocals?.started).toEqual(instrumental?.started);
      expect(engine.isPlaying).toBe(true);
    });

    it('routes the instrumental to the speakers and the vocals through the guide gain', async () => {
      const { engine, context } = await loaded();
      const [master, vocalGain] = context.gains;

      engine.play();

      expect(master?.destination).toBe(context.destination);
      expect(vocalGain?.destination).toBe(master);
      expect(context.sources[instrumentalSource]?.destination).toBe(master);
      expect(context.sources[vocalSource]?.destination).toBe(vocalGain);
    });

    it('wakes up the audio context, which browsers keep suspended until a user gesture', async () => {
      const { engine, context } = await loaded();
      engine.play();
      expect(context.resumed).toBe(1);
    });

    it('follows the audio clock for the current time', async () => {
      const { engine, context } = await loaded();
      engine.play();

      context.currentTime = 100 + START_DELAY + 12.5;

      expect(engine.currentTime).toBeCloseTo(12.5, 5);
    });

    it('never reports a negative time during the short start delay', async () => {
      const { engine } = await loaded();
      engine.play();
      expect(engine.currentTime).toBe(0);
    });

    it('does not restart when asked to play while already playing', async () => {
      const { engine, context } = await loaded();
      engine.play();

      engine.play();

      expect(context.sources).toHaveLength(2);
    });

    it('does nothing before anything was loaded', () => {
      const { engine, context } = setup();
      engine.play();
      expect(engine.isPlaying).toBe(false);
      expect(context.sources).toHaveLength(0);
    });

    it('plays only the instrumental when there are no vocals', async () => {
      const { engine, context } = setup();
      await engine.load('/media/s/instrumental.mp3', null);

      engine.play();

      expect(context.sources).toHaveLength(1);
    });
  });

  describe('pausing', () => {
    it('stops the tracks and remembers where it was', async () => {
      const { engine, context } = await loaded();
      engine.play();
      context.currentTime = 100 + START_DELAY + 30;

      engine.pause();

      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBeCloseTo(30, 5);
      expect(context.sources.every((source) => source.stopped && source.disconnected)).toBe(true);
    });

    it('keeps the position while paused even as the audio clock moves on', async () => {
      const { engine, context } = await loaded();
      engine.play();
      context.currentTime = 100 + START_DELAY + 30;
      engine.pause();

      context.currentTime += 500;

      expect(engine.currentTime).toBeCloseTo(30, 5);
    });

    it('resumes from where it stopped, with both tracks at the same position', async () => {
      const { engine, context } = await loaded();
      engine.play();
      context.currentTime = 100 + START_DELAY + 30;
      engine.pause();

      context.currentTime += 10;
      engine.play();

      const [resumedInstrumental, resumedVocals] = context.sources.slice(-2);
      expect(resumedInstrumental?.started?.offset).toBeCloseTo(30, 5);
      expect(resumedVocals?.started).toEqual(resumedInstrumental?.started);
    });

    it('is harmless when nothing is playing', async () => {
      const { engine, context } = await loaded();
      engine.pause();
      expect(context.sources).toHaveLength(0);
    });
  });

  describe('seeking', () => {
    it('jumps while playing, restarting both tracks at the new position', async () => {
      const { engine, context } = await loaded();
      engine.play();

      engine.seek(90);

      const [first, second] = context.sources.slice(0, 2);
      const [restartedInstrumental, restartedVocals] = context.sources.slice(-2);
      expect(first?.stopped && second?.stopped).toBe(true);
      expect(restartedInstrumental?.started?.offset).toBe(90);
      expect(restartedVocals?.started?.offset).toBe(90);
      expect(engine.isPlaying).toBe(true);
    });

    it('moves the position without playing when paused', async () => {
      const { engine, context } = await loaded();

      engine.seek(45);

      expect(engine.currentTime).toBe(45);
      expect(engine.isPlaying).toBe(false);
      expect(context.sources).toHaveLength(0);
    });

    it('starts from the new position when played after seeking', async () => {
      const { engine, context } = await loaded();
      engine.seek(45);

      engine.play();

      expect(context.sources[instrumentalSource]?.started?.offset).toBe(45);
    });

    it('stays inside the song', async () => {
      const { engine } = await loaded();

      engine.seek(-20);
      expect(engine.currentTime).toBe(0);

      engine.seek(9999);
      expect(engine.currentTime).toBeCloseTo(SONG_SECONDS - 0.1, 5);
    });

    it('does not count the interruption as the end of the song', async () => {
      const { engine, context } = await loaded();
      const onEnded = vi.fn();
      engine.onEnded = onEnded;
      engine.play();
      const oldInstrumental = context.sources[instrumentalSource] as FakeSource;

      engine.seek(50);
      oldInstrumental.finishNaturally();

      expect(onEnded).not.toHaveBeenCalled();
      expect(engine.isPlaying).toBe(true);
    });
  });

  describe('the end of the song', () => {
    it('announces it once and stops at the end', async () => {
      const { engine, context } = await loaded();
      const onEnded = vi.fn();
      engine.onEnded = onEnded;
      engine.play();

      (context.sources[instrumentalSource] as FakeSource).finishNaturally();

      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBe(SONG_SECONDS);
    });

    it('plays again from the start after finishing', async () => {
      const { engine, context } = await loaded();
      engine.play();
      (context.sources[instrumentalSource] as FakeSource).finishNaturally();

      engine.play();

      const restarted = context.sources.at(-2);
      expect(restarted?.started?.offset).toBe(0);
    });

    it('is not triggered by the vocals track ending slightly earlier', async () => {
      const { engine, context } = await loaded();
      const onEnded = vi.fn();
      engine.onEnded = onEnded;
      engine.play();

      (context.sources[vocalSource] as FakeSource).finishNaturally();

      expect(onEnded).not.toHaveBeenCalled();
    });

    it('never reports a time beyond the duration', async () => {
      const { engine, context } = await loaded();
      engine.play();

      context.currentTime = 100 + SONG_SECONDS * 3;

      expect(engine.currentTime).toBe(SONG_SECONDS);
    });
  });

  describe('guide voice', () => {
    it('fades the vocals in and out with a short smoothing instead of cutting them', async () => {
      const { engine, context } = await loaded();
      const vocalGain = context.gains[1] as FakeGain;
      context.currentTime = 105;

      engine.setVoiceGuide(true);
      engine.setVoiceGuide(false);

      expect(vocalGain.gain.setTargetAtTime).toHaveBeenNthCalledWith(1, 1, 105, 0.05);
      expect(vocalGain.gain.setTargetAtTime).toHaveBeenNthCalledWith(2, 0, 105, 0.05);
    });

    it('remembers whether it is on', async () => {
      const { engine } = await loaded();
      expect(engine.voiceGuide).toBe(false);

      engine.setVoiceGuide(true);

      expect(engine.voiceGuide).toBe(true);
    });

    it('does not interrupt or restart the music when toggled', async () => {
      const { engine, context } = await loaded();
      engine.play();

      engine.setVoiceGuide(true);

      expect(context.sources).toHaveLength(2);
      expect(context.sources.every((source) => !source.stopped)).toBe(true);
    });
  });

  describe('volume', () => {
    it('sets the master volume and keeps it between 0 and 1', async () => {
      const { engine, context } = await loaded();
      const master = context.gains[0] as FakeGain;

      engine.setVolume(0.4);
      expect(master.gain.value).toBe(0.4);

      engine.setVolume(7);
      expect(master.gain.value).toBe(1);

      engine.setVolume(-1);
      expect(master.gain.value).toBe(0);
    });
  });

  describe('cleaning up', () => {
    it('stops everything and closes the audio context', async () => {
      const { engine, context } = await loaded();
      engine.play();

      engine.destroy();

      expect(context.sources.every((source) => source.stopped)).toBe(true);
      expect(context.closed).toBe(true);
      expect(engine.isPlaying).toBe(false);
    });

    it('does not call the end handler after being destroyed', async () => {
      const { engine, context } = await loaded();
      const onEnded = vi.fn();
      engine.onEnded = onEnded;
      engine.play();
      const instrumental = context.sources[instrumentalSource] as FakeSource;

      engine.destroy();
      instrumental.finishNaturally();

      expect(onEnded).not.toHaveBeenCalled();
    });

    it('survives sources that cannot be stopped because they already ended', async () => {
      const { engine, context } = await loaded();
      engine.play();
      for (const source of context.sources) (source as FakeSource).stopError = true;

      expect(() => engine.pause()).not.toThrow();
    });
  });

  describe('sync over time', () => {
    let engine: KaraokeEngine;
    let context: FakeContext;

    beforeEach(async () => {
      ({ engine, context } = await loaded());
    });

    it('keeps the time exact across pause, seek and resume cycles', () => {
      engine.play();
      context.currentTime += START_DELAY + 20;
      engine.pause();
      expect(engine.currentTime).toBeCloseTo(20, 5);

      engine.seek(100);
      context.currentTime += 3;
      engine.play();
      context.currentTime += START_DELAY + 7;
      expect(engine.currentTime).toBeCloseTo(107, 5);

      engine.pause();
      expect(engine.currentTime).toBeCloseTo(107, 5);
    });
  });
});
