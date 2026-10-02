import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Tela quebrou:', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text"
      >
        <h1 className="font-display text-3xl">Algo deu errado</h1>
        <p className="max-w-md text-base text-muted">
          Recarregue a página. Se acontecer de novo, conte o que estava fazendo e a mensagem abaixo.
        </p>
        <code className="max-w-md break-words rounded-lg bg-surface px-3 py-2 text-sm">{error.message}</code>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-12 rounded-lg bg-primary px-6 text-lg font-semibold text-primary-contrast"
        >
          Recarregar
        </button>
      </div>
    );
  }
}
