import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('is a non-submitting button by default and calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);

    const button = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(button);

    expect(button).toHaveAttribute('type', 'button');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and shows a spinner while loading', () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Criar
      </Button>,
    );

    const button = screen.getByRole('button', { name: /Criar/ });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });
});
