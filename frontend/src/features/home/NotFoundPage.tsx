import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-10">
      <h1 className="font-display text-4xl sm:text-5xl">Tela não encontrada</h1>
      <p className="text-muted">Essa tela não existe ou ainda não foi criada.</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
