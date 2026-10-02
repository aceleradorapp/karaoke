import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LyricsEffectId } from '@caraoke/shared';
import { LyricsEffectControls } from './LyricsEffectControls';

function setup(overrides: Partial<{ enabled: boolean; effectId: LyricsEffectId; fillPercent: number }> = {}) {
  const handlers = {
    onEnabledChange: vi.fn(),
    onEffectChange: vi.fn(),
    onFillPercentChange: vi.fn(),
  };
  render(<LyricsEffectControls enabled effectId="smooth" fillPercent={100} {...handlers} {...overrides} />);
  return handlers;
}

describe('LyricsEffectControls', () => {
  it('shows the state of the effect, the model and the time', () => {
    setup({ fillPercent: 85 });

    expect(screen.getByRole('button', { name: /Efeito: ligado/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Modelo do efeito' })).toHaveValue('smooth');
    expect(screen.getByRole('slider', { name: 'Tempo de preenchimento' })).toHaveValue('85');
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('lists the available models with readable names', () => {
    setup();
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Preencher aos poucos', 'Palavra por palavra']);
  });

  it('asks to turn the effect off and on', () => {
    const on = setup();
    fireEvent.click(screen.getByRole('button', { name: /Efeito: ligado/ }));
    expect(on.onEnabledChange).toHaveBeenCalledWith(false);
  });

  it('asks to turn the effect on when it is off', () => {
    const off = setup({ enabled: false });
    fireEvent.click(screen.getByRole('button', { name: /Efeito: desligado/ }));
    expect(off.onEnabledChange).toHaveBeenCalledWith(true);
  });

  it('asks for another model', () => {
    const { onEffectChange } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: 'Modelo do efeito' }), {
      target: { value: 'words' },
    });
    expect(onEffectChange).toHaveBeenCalledWith('words');
  });

  it('moves the time five points with the buttons, in both directions', () => {
    const { onFillPercentChange } = setup({ fillPercent: 100 });

    fireEvent.click(screen.getByRole('button', { name: 'Terminar de pintar mais cedo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terminar de pintar mais tarde' }));

    expect(onFillPercentChange.mock.calls).toEqual([[95], [105]]);
  });

  it('moves the time with the slider', () => {
    const { onFillPercentChange } = setup();
    fireEvent.change(screen.getByRole('slider', { name: 'Tempo de preenchimento' }), {
      target: { value: '60' },
    });
    expect(onFillPercentChange).toHaveBeenCalledWith(60);
  });

  it('goes back to the normal time, only when it is different', () => {
    const changed = setup({ fillPercent: 70 });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar o tempo para 100%' }));
    expect(changed.onFillPercentChange).toHaveBeenCalledWith(100);
  });

  it('has nothing to reset at the normal time', () => {
    setup({ fillPercent: 100 });
    expect(screen.getByRole('button', { name: 'Voltar o tempo para 100%' })).toBeDisabled();
  });

  it('stops at the limits', () => {
    setup({ fillPercent: 20 });
    expect(screen.getByRole('button', { name: 'Terminar de pintar mais cedo' })).toBeDisabled();
  });

  it('stops at the upper limit too', () => {
    setup({ fillPercent: 150 });
    expect(screen.getByRole('button', { name: 'Terminar de pintar mais tarde' })).toBeDisabled();
  });

  it('locks the model and the time while the effect is off', () => {
    setup({ enabled: false });

    expect(screen.getByRole('combobox', { name: 'Modelo do efeito' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Tempo de preenchimento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Terminar de pintar mais cedo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Terminar de pintar mais tarde' })).toBeDisabled();
  });
});
