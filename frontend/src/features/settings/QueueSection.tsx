import { MAX_REQUESTS_PER_PERSON_LIMIT, type AppSettings } from '@caraoke/shared';
import { SelectField, SettingsSection, ToggleField } from './fields';

const NO_LIMIT = '0';
const AUTO_ADVANCE_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60];

const LIMIT_OPTIONS = [
  { value: NO_LIMIT, label: 'Sem limite' },
  ...Array.from({ length: MAX_REQUESTS_PER_PERSON_LIMIT }, (_, index) => {
    const count = index + 1;
    return { value: String(count), label: `${count} ${count === 1 ? 'música' : 'músicas'} por pessoa` };
  }),
];

const AUTO_ADVANCE_OPTIONS = AUTO_ADVANCE_CHOICES.map((seconds) => ({
  value: String(seconds),
  label: seconds === 0 ? 'Desligado (chamar na mão)' : `Depois de ${seconds} s`,
}));

interface QueueSectionProps {
  settings: AppSettings;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function QueueSection({ settings, onChange }: QueueSectionProps) {
  return (
    <SettingsSection title="Fila de cantores">
      <SelectField
        id="queue-limit"
        label="Músicas esperando por pessoa"
        value={String(settings['queue.maxRequestsPerPerson'])}
        options={LIMIT_OPTIONS}
        onChange={(value) => onChange('queue.maxRequestsPerPerson', Number(value))}
        hint="Quantos pedidos cada pessoa pode ter na fila ao mesmo tempo."
      />
      <ToggleField
        label="A TV pode passar do limite"
        checked={settings['queue.stageBypassesLimit']}
        onChange={(checked) => onChange('queue.stageBypassesLimit', checked)}
      />
      <SelectField
        id="queue-auto-advance"
        label="Chamar o próximo cantor"
        value={String(settings['queue.autoAdvanceSeconds'])}
        options={AUTO_ADVANCE_OPTIONS}
        onChange={(value) => onChange('queue.autoAdvanceSeconds', Number(value))}
        hint="Depois da nota, abre a tela do próximo cantor com o botão Começar (a música só toca quando a pessoa aperta)."
      />
      <ToggleField
        label="Aleatório (sortear o próximo cantor)"
        checked={settings['queue.shuffle']}
        onChange={(checked) => onChange('queue.shuffle', checked)}
      />
    </SettingsSection>
  );
}
