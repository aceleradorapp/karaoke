import type { LyricsNotice } from '@caraoke/shared';
import { Link } from 'react-router';
import { useLyricsQuery } from '../../api/lyrics';
import { Spinner } from '../../components/Spinner';

interface LyricsPreviewProps {
  url: string | null;
  notice?: LyricsNotice | null;
}

export function LyricsPreview({ url, notice = null }: LyricsPreviewProps) {
  const lyrics = useLyricsQuery(url);

  if (url === null && notice === 'SITE_UNREACHABLE') {
    return (
      <div role="note" className="flex flex-col gap-1 rounded-xl bg-surface-2 p-4">
        <p className="text-base">
          Sem letra: o site das letras não respondeu quando esta música foi preparada.
        </p>
        <p className="text-sm text-muted">
          Costuma ser passageiro. Veja a{' '}
          <Link to="/saude" className="text-primary underline">
            Saúde do sistema
          </Link>
          ; quando o site voltar, processe a música de novo para buscar a letra.
        </p>
      </div>
    );
  }
  if (url === null && notice === 'NOT_FOUND') {
    return <p className="text-muted">O site das letras não tem a letra desta música.</p>;
  }
  if (url === null) return <p className="text-muted">Esta música ainda não tem letra.</p>;
  if (lyrics.isLoading) return <Spinner className="size-6" />;
  if (lyrics.isError) return <p className="text-danger">Não foi possível carregar a letra.</p>;

  return (
    <ol
      aria-label="Letra"
      className="max-h-80 space-y-1 overflow-y-auto rounded-xl bg-surface-2 p-4 text-base"
    >
      {lyrics.data?.lines.map((line, index) => (
        <li key={`${index}-${line.start}`}>{line.text}</li>
      ))}
    </ol>
  );
}
