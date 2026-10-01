import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaveIndicator } from './SaveIndicator';

describe('SaveIndicator', () => {
  it('shows nothing when idle', () => {
    render(<SaveIndicator status="idle" />);
    expect(screen.queryByText(/Salv/)).not.toBeInTheDocument();
  });

  it('shows the saving and saved states', () => {
    const { rerender } = render(<SaveIndicator status="saving" />);
    expect(screen.getByText('Salvando…')).toBeInTheDocument();

    rerender(<SaveIndicator status="saved" />);
    expect(screen.getByText('Salvo ✓')).toBeInTheDocument();
  });

  it('offers a retry on error', () => {
    const onRetry = vi.fn();
    render(<SaveIndicator status="error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(screen.getByText(/Não foi possível salvar/)).toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
