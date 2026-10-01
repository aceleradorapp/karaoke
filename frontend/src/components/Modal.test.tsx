import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function renderModal(isOpen: boolean, onClose = vi.fn()) {
  render(
    <Modal
      isOpen={isOpen}
      title="Novo perfil"
      onClose={onClose}
      footer={<button type="button">Criar</button>}
    >
      <p>Conteúdo</p>
    </Modal>,
  );
  return onClose;
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    renderModal(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an accessible dialog with title, content and footer', () => {
    renderModal(true);
    expect(screen.getByRole('dialog', { name: 'Novo perfil' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });

  it('closes with the close button, the Escape key and a backdrop click', () => {
    const onClose = renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close when clicking inside the dialog', () => {
    const onClose = renderModal(true);
    fireEvent.mouseDown(screen.getByText('Conteúdo'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks the page scroll while open and restores it afterwards', () => {
    const { unmount } = render(
      <Modal isOpen title="T" onClose={vi.fn()}>
        x
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
