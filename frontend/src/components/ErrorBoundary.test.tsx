import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('Cannot read properties of undefined');
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the page normally when nothing breaks', () => {
    render(
      <ErrorBoundary>
        <p>Tudo certo</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Tudo certo')).toBeInTheDocument();
  });

  it('shows a message with the reason and a reload button instead of a blank screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado');
    expect(screen.getByText('Cannot read properties of undefined')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
