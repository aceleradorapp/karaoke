import clsx from 'clsx';
import { useToastStore, type ToastKind } from '../stores/useToastStore';

const KIND_CLASSES: Record<ToastKind, string> = {
  info: 'border-surface-2',
  success: 'border-accent',
  error: 'border-danger',
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96"
    >
      {toasts.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          className={clsx(
            'pointer-events-auto min-h-11 rounded-xl border-l-4 bg-surface px-4 py-3 text-left text-base shadow-lg',
            KIND_CLASSES[item.kind],
          )}
        >
          {item.message}
        </button>
      ))}
    </div>
  );
}
