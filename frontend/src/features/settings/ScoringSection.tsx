import type { AppSettings } from '@caraoke/shared';
import { Mic, MicOff, Timer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { calibrateLatency } from '../../lib/pitch/calibration';
import { listMicrophones, MicrophonePitch, type MicrophoneDevice } from '../../lib/pitch/microphone';
import { toast } from '../../stores/useToastStore';
import { SelectField, SettingsSection } from './fields';

type ScoringMode = AppSettings['scoring.mode'];

const MODE_OPTIONS: Array<{ value: ScoringMode; label: string }> = [
  { value: 'pitch+audience', label: 'Afinação + plateia' },
  { value: 'pitch', label: 'Só afinação (microfone)' },
  { value: 'audience', label: 'Só plateia (votos pelo celular)' },
  { value: 'off', label: 'Desligada' },
];

const DEFAULT_MICROPHONE = '';
const METER_INTERVAL_MS = 50;
const METER_FULL_LEVEL = 0.3;
const MAX_LATENCY_MS = 400;
const NOTE_NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];

export function noteName(midi: number): string {
  return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12] ?? '';
}

export const usesPitch = (mode: ScoringMode) => mode === 'pitch' || mode === 'pitch+audience';
export const usesAudience = (mode: ScoringMode) => mode === 'audience' || mode === 'pitch+audience';

interface RangeFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function RangeField({ id, label, value, min, max, step, display, onChange }: RangeFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-base font-medium">
          {label}
        </label>
        <span className="text-base tabular-nums text-muted">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full accent-primary"
      />
    </div>
  );
}

function MicrophoneMeter({ deviceId }: { deviceId: string | null }) {
  const [isOn, setIsOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<number | null>(null);
  const microphone = useRef<MicrophonePitch | null>(null);

  const stop = useCallback(() => {
    microphone.current?.close();
    microphone.current = null;
    setIsOn(false);
    setLevel(0);
    setNote(null);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!isOn) return;
    const timer = setInterval(() => {
      const current = microphone.current;
      if (!current) return;
      setLevel(current.level());
      setNote(current.sample());
    }, METER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOn]);

  async function start() {
    try {
      microphone.current = await MicrophonePitch.open({ deviceId });
      setIsOn(true);
    } catch {
      toast.error('Não foi possível abrir o microfone. Confira a permissão do navegador.');
    }
  }

  const percent = Math.round(Math.min(1, level / METER_FULL_LEVEL) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => (isOn ? stop() : void start())}>
          {isOn ? (
            <MicOff aria-hidden="true" className="size-5" />
          ) : (
            <Mic aria-hidden="true" className="size-5" />
          )}
          {isOn ? 'Parar o teste' : 'Testar o microfone'}
        </Button>
        {isOn && (
          <span className="text-base text-muted" aria-live="polite">
            {note == null ? 'Cante ou fale perto do microfone…' : `Nota: ${noteName(note)}`}
          </span>
        )}
      </div>
      {isOn && (
        <div
          role="meter"
          aria-label="Nível do microfone"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full bg-primary transition-[width] duration-75"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface ScoringSectionProps {
  settings: AppSettings;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ScoringSection({ settings, onChange }: ScoringSectionProps) {
  const mode = settings['scoring.mode'];
  const deviceId = settings['scoring.micDeviceId'];
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const refreshMicrophones = useCallback(() => {
    listMicrophones()
      .then(setMicrophones)
      .catch(() => setMicrophones([]));
  }, []);

  useEffect(() => {
    if (usesPitch(mode)) refreshMicrophones();
  }, [mode, refreshMicrophones]);

  async function calibrate() {
    setIsCalibrating(true);
    try {
      const latency = await calibrateLatency(deviceId);
      if (latency == null) {
        toast.error('Não deu para ouvir os bipes. Aumente o volume, aproxime o microfone e tente de novo.');
      } else {
        onChange('scoring.micLatencyMs', Math.min(latency, MAX_LATENCY_MS));
        toast.success(`Atraso medido: ${latency} ms`);
      }
    } catch {
      toast.error('Não foi possível abrir o microfone. Confira a permissão do navegador.');
    } finally {
      setIsCalibrating(false);
      refreshMicrophones();
    }
  }

  const microphoneOptions = [
    { value: DEFAULT_MICROPHONE, label: 'Padrão do sistema' },
    ...microphones.map((microphone) => ({ value: microphone.deviceId, label: microphone.label })),
  ];

  return (
    <SettingsSection title="Pontuação">
      <SelectField
        id="scoring-mode"
        label="Como dar a nota"
        value={mode}
        options={MODE_OPTIONS}
        onChange={(value) => onChange('scoring.mode', value)}
        hint={
          usesPitch(mode) ? 'Sem microfone ligado no PC, a nota fica só com os votos da plateia.' : undefined
        }
      />

      {mode === 'pitch+audience' && (
        <RangeField
          id="scoring-weight"
          label="Peso da plateia na nota"
          value={Math.round(settings['scoring.audienceWeight'] * 100)}
          min={0}
          max={100}
          step={5}
          display={`${Math.round(settings['scoring.audienceWeight'] * 100)}%`}
          onChange={(value) => onChange('scoring.audienceWeight', value / 100)}
        />
      )}

      {usesAudience(mode) && (
        <RangeField
          id="scoring-vote-seconds"
          label="Tempo para votar"
          value={settings['scoring.voteSeconds']}
          min={5}
          max={60}
          step={5}
          display={`${settings['scoring.voteSeconds']} s`}
          onChange={(value) => onChange('scoring.voteSeconds', value)}
        />
      )}

      {usesPitch(mode) && (
        <>
          <SelectField
            id="scoring-microphone"
            label="Microfone"
            value={deviceId ?? DEFAULT_MICROPHONE}
            options={microphoneOptions}
            onChange={(value) => onChange('scoring.micDeviceId', value === DEFAULT_MICROPHONE ? null : value)}
          />
          <MicrophoneMeter deviceId={deviceId} />
          <RangeField
            id="scoring-latency"
            label="Atraso do microfone"
            value={settings['scoring.micLatencyMs']}
            min={0}
            max={MAX_LATENCY_MS}
            step={10}
            display={`${settings['scoring.micLatencyMs']} ms`}
            onChange={(value) => onChange('scoring.micLatencyMs', value)}
          />
          <div className="flex flex-col items-start gap-2">
            <Button variant="secondary" onClick={() => void calibrate()} isLoading={isCalibrating}>
              <Timer aria-hidden="true" className="size-5" />
              Calibrar
            </Button>
            <p className="text-sm text-muted">
              Toca 4 bipes pelas caixas e mede quanto tempo o microfone demora para ouvi-los.
            </p>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
