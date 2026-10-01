import { updateSettingsSchema, type AppSettings } from '@caraoke/shared';
import { useState } from 'react';
import { useSettingsQuery, useUpdateSettingsMutation } from '../../api/settings';
import { useSystemInfoQuery } from '../../api/system';
import { SaveIndicator } from '../../components/SaveIndicator';
import { Spinner } from '../../components/Spinner';
import { useAutoSave } from '../../lib/useAutoSave';
import { ThemePicker } from '../profiles/ThemePicker';
import { deviceHint } from './deviceHint';
import { SelectField, SettingsSection, ToggleField } from './fields';

const DEVICE_OPTIONS = [
  { value: 'auto', label: 'Automático' },
  { value: 'gpu', label: 'GPU' },
  { value: 'cpu', label: 'CPU' },
] as const;

const DEMUCS_OPTIONS = [
  { value: 'htdemucs', label: 'Padrão (mais rápido)' },
  { value: 'htdemucs_ft', label: 'Alta qualidade (cerca de 4× mais lento)' },
] as const;

const WHISPER_OPTIONS = [
  { value: 'base', label: 'Rápido' },
  { value: 'small', label: 'Equilibrado' },
  { value: 'medium', label: 'Preciso (mais lento)' },
] as const;

const isSameSettings = (a: AppSettings, b: AppSettings) => JSON.stringify(a) === JSON.stringify(b);

interface SettingsFormProps {
  initialSettings: AppSettings;
}

function SettingsForm({ initialSettings }: SettingsFormProps) {
  const updateSettings = useUpdateSettingsMutation();
  const systemInfo = useSystemInfoQuery();
  const [draft, setDraft] = useState(initialSettings);

  const autoSave = useAutoSave(
    draft,
    (value) => updateSettings.mutateAsync(updateSettingsSchema.parse(value)),
    { delayMs: 0, isEqual: isSameSettings },
  );

  function change<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-h-6 justify-end">
        <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
      </div>

      <SettingsSection title="Aparência">
        <div className="flex flex-col gap-2">
          <span className="text-base font-medium">Tema da tela de perfis</span>
          <ThemePicker
            value={draft['ui.defaultTheme']}
            onChange={(theme) => change('ui.defaultTheme', theme)}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Processamento">
        <SelectField
          id="processing-device"
          label="Dispositivo"
          value={draft['processing.device']}
          options={[...DEVICE_OPTIONS]}
          onChange={(value) => change('processing.device', value)}
          hint={deviceHint(systemInfo.data?.worker)}
        />
        <SelectField
          id="processing-demucs"
          label="Qualidade da separação de voz"
          value={draft['processing.demucsModel']}
          options={[...DEMUCS_OPTIONS]}
          onChange={(value) => change('processing.demucsModel', value)}
        />
        <SelectField
          id="processing-whisper"
          label="Precisão da sincronização da letra"
          value={draft['processing.whisperModel']}
          options={[...WHISPER_OPTIONS]}
          onChange={(value) => change('processing.whisperModel', value)}
        />
        <ToggleField
          label="Sincronizar a letra automaticamente com IA"
          checked={draft['processing.autoAlign']}
          onChange={(checked) => change('processing.autoAlign', checked)}
        />
      </SettingsSection>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettingsQuery();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-4xl text-text sm:text-5xl">Configurações</h1>

      {settings.isLoading && <Spinner className="size-10 self-center" />}

      {settings.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as configurações.
        </p>
      )}

      {settings.isSuccess && <SettingsForm initialSettings={settings.data} />}
    </div>
  );
}
