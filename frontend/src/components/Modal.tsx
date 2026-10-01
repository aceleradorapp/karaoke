import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ isOpen, title, onClose, children, footer }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/70 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-surface text-text outline-none sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-surface-2 px-5 py-4">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-2"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-3 border-t border-surface-2 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
