import type { PitchDetector } from 'pitchy';
import { createPitchDetector, detectMidi, rootMeanSquare } from './detectPitch';

const FFT_SIZE = 2048;

export interface MicrophoneDevice {
  deviceId: string;
  label: string;
}

export interface MicrophoneOptions {
  deviceId?: string | null;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
  createContext?: () => AudioContext;
}

export class MicrophonePitch {
  private readonly buffer = new Float32Array(FFT_SIZE);
  private readonly detector: PitchDetector<Float32Array> = createPitchDetector(FFT_SIZE);

  private constructor(
    private readonly context: AudioContext,
    private readonly stream: MediaStream,
    private readonly analyser: AnalyserNode,
  ) {}

  static async open(options: MicrophoneOptions = {}): Promise<MicrophonePitch> {
    const mediaDevices = options.mediaDevices ?? navigator.mediaDevices;
    const stream = await mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const context = (options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' })))();
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    context.createMediaStreamSource(stream).connect(analyser);
    return new MicrophonePitch(context, stream, analyser);
  }

  sample(): number | null {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return detectMidi(this.buffer, this.context.sampleRate, this.detector);
  }

  level(): number {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return rootMeanSquare(this.buffer);
  }

  close(): void {
    for (const track of this.stream.getTracks()) track.stop();
    void this.context.close();
  }
}

export async function listMicrophones(
  mediaDevices: Pick<MediaDevices, 'enumerateDevices'> | undefined = navigator.mediaDevices,
): Promise<MicrophoneDevice[]> {
  if (!mediaDevices) return [];
  const devices = await mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microfone ${index + 1}` }));
}
