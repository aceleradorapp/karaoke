import { THEMES } from '@caraoke/shared';
import clsx from 'clsx';

interface ThemePickerProps {
  value: string;
  onChange: (themeId: string) => void;
  label?: string;
}

export function ThemePicker({ value, onChange, label = 'Tema' }: ThemePickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {THEMES.map((theme) => {
        const isSelected = theme.id === value;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(theme.id)}
            className={clsx(
              'flex min-h-11 flex-col items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm transition',
              isSelected ? 'ring-4 ring-primary' : 'hover:bg-surface-2/70',
            )}
          >
            <span data-theme={theme.id} className="flex h-8 w-full overflow-hidden rounded-lg">
              <span className="flex-1 bg-bg" />
              <span className="flex-1 bg-primary" />
              <span className="flex-1 bg-accent" />
            </span>
            {theme.name}
          </button>
        );
      })}
    </div>
  );
}
