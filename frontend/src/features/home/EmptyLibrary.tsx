import { Link } from 'react-router';

export function EmptyLibrary() {
  return (
    <section
      aria-label="Biblioteca vazia"
      className="mx-auto flex max-w-2xl flex-col items-start gap-4 rounded-2xl bg-surface p-6 sm:p-8"
    >
      <h1 className="font-display text-4xl sm:text-5xl">Sua biblioteca está vazia</h1>
      <p className="text-lg text-muted">
        Busque músicas no YouTube ou envie arquivos de áudio. Elas são preparadas em segundo plano (a voz é
        removida e a letra é buscada) e aparecem aqui prontas para cantar.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/youtube"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
        >
          Buscar no YouTube
        </Link>
        <Link
          to="/enviar"
          className="inline-flex min-h-11 items-center rounded-lg bg-surface-2 px-5 font-semibold"
        >
          Enviar arquivos
        </Link>
      </div>
    </section>
  );
}
