import { useLyricsQuery } from '../../api/lyrics';
import { Spinner } from '../../components/Spinner';

interface LyricsPreviewProps {
  url: string | null;
}

export function LyricsPreview({ url }: LyricsPreviewProps) {
  const lyrics = useLyricsQuery(url);

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
