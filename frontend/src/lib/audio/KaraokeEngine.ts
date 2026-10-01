export interface AudioParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}

export interface GainNodeLike {
  gain: AudioParamLike;
  connect(destination: unknown): unknown;
}

export interface AudioBufferLike {
  duration: number;
}

export interface BufferSourceLike {
  buffer: AudioBufferLike | null;
  onended: ((event: Event) => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface KaraokeEngineOptions {
  createContext?: () => AudioContextLike;
  fetchAudio?: (url: string) => Promise<ArrayBuffer>;
}

const START_DELAY_SECONDS = 0.05;
const VOICE_GUIDE_SMOOTHING_SECONDS = 0.05;
const END_GUARD_SECONDS = 0.1;

function createBrowserContext(): AudioContextLike {
  return new AudioContext({ latencyHint: 'interactive' }) as unknown as AudioContextLike;
}

async function fetchBrowserAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar o áudio (${response.status})`);
  return response.arrayBuffer();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class KaraokeEngine {
  onEnded: (() => void) | null = null;

  private readonly context: AudioContextLike;
  private readonly fetchAudio: (url: string) => Promise<ArrayBuffer>;
  private readonly master: GainNodeLike;
  private readonly vocalGain: GainNodeLike;
  private instrumental: AudioBufferLike | null = null;
  private vocals: AudioBufferLike | null = null;
  private sources: BufferSourceLike[] = [];
  private startedAt = 0;
  private pausedAt = 0;
  private playing = false;
  private voiceGuideOn = false;

  constructor(options: KaraokeEngineOptions = {}) {
    this.context = (options.createContext ?? createBrowserContext)();
    this.fetchAudio = options.fetchAudio ?? fetchBrowserAudio;

    this.master = this.context.createGain();
    this.master.connect(this.context.destination);

    this.vocalGain = this.context.createGain();
    this.vocalGain.gain.value = 0;
    this.vocalGain.connect(this.master);
  }

  async load(instrumentalUrl: string, vocalsUrl: string | null): Promise<void> {
    const [instrumental, vocals] = await Promise.all([
      this.decode(instrumentalUrl),
      vocalsUrl ? this.decode(vocalsUrl).catch(() => null) : Promise.resolve(null),
    ]);
    this.instrumental = instrumental;
    this.vocals = vocals;
    this.pausedAt = 0;
  }

  get duration(): number {
    return this.instrumental?.duration ?? 0;
  }

  get hasVocals(): boolean {
    return this.vocals !== null;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get voiceGuide(): boolean {
    return this.voiceGuideOn;
  }

  get currentTime(): number {
    if (!this.playing) return this.pausedAt;
    return clamp(this.context.currentTime - this.startedAt, 0, this.duration);
  }

  play(from?: number): void {
    if (!this.instrumental) return;
    if (this.playing && from === undefined) return;

    const isAtEnd = this.pausedAt >= this.duration;
    const position = clamp(from ?? (isAtEnd ? 0 : this.pausedAt), 0, this.duration);

    this.stopSources();
    const startTime = this.context.currentTime + START_DELAY_SECONDS;
    this.startSource(this.instrumental, this.master, startTime, position).onended = () =>
      this.handleNaturalEnd();
    if (this.vocals) this.startSource(this.vocals, this.vocalGain, startTime, position);

    this.startedAt = startTime - position;
    this.pausedAt = position;
    this.playing = true;
    void this.context.resume();
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.currentTime;
    this.playing = false;
    this.stopSources();
  }

  seek(seconds: number): void {
    const latestStart = Math.max(0, this.duration - END_GUARD_SECONDS);
    const position = clamp(seconds, 0, latestStart);
    if (this.playing) this.play(position);
    else this.pausedAt = position;
  }

  setVoiceGuide(isOn: boolean): void {
    this.voiceGuideOn = isOn;
    this.vocalGain.gain.setTargetAtTime(
      isOn ? 1 : 0,
      this.context.currentTime,
      VOICE_GUIDE_SMOOTHING_SECONDS,
    );
  }

  setVolume(volume: number): void {
    this.master.gain.value = clamp(volume, 0, 1);
  }

  destroy(): void {
    this.onEnded = null;
    this.playing = false;
    this.stopSources();
    void this.context.close();
  }

  private async decode(url: string): Promise<AudioBufferLike> {
    return this.context.decodeAudioData(await this.fetchAudio(url));
  }

  private startSource(
    buffer: AudioBufferLike,
    destination: GainNodeLike,
    startTime: number,
    offset: number,
  ): BufferSourceLike {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(startTime, offset);
    this.sources.push(source);
    return source;
  }

  private stopSources(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // a source that already ended cannot be stopped again
      }
      source.disconnect();
    }
    this.sources = [];
  }

  private handleNaturalEnd(): void {
    this.playing = false;
    this.pausedAt = this.duration;
    this.sources = [];
    this.onEnded?.();
  }
}
