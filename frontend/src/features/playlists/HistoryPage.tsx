import type { HistoryItemDTO } from '@caraoke/shared';
import { Play } from 'lucide-react';
import { Link } from 'react-router';
import { useHistoryInfiniteQuery } from '../../api/history';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { formatTimeAgo } from '../../lib/format';
import { coverGradient } from '../../lib/gradient';
import { useProfileStore } from '../../stores/useProfileStore';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

function Thumb({ item }: { item: HistoryItemDTO }) {
  return item.song.coverUrl ? (
    <img src={item.song.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
  ) : (
    <div style={{ background: coverGradient(item.song.id) }} className="size-full" />
  );
}

function HistoryRow({ item }: { item: HistoryItemDTO }) {
  const { song } = item;
  const when = new Date(item.startedAt);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3">
      <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-32">
        <Thumb item={item} />
      </div>
      <div className="min-w-0 flex-1 basis-44">
        <Link to={`/musica/${song.id}`} className="block truncate text-base font-semibold hover:underline">
          {song.title}
        </Link>
        <p className="truncate text-sm text-muted">{song.artist}</p>
        <p className="text-sm text-muted">
          <time dateTime={item.startedAt} title={DATE_FORMAT.format(when)}>
            {formatTimeAgo(item.startedAt)}
          </time>
          {' · '}
          {item.completed ? 'Cantou até o fim' : 'Parou no meio'}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {item.finalScore !== null && (
          <span aria-label={`Nota ${item.finalScore}`} className="font-display text-3xl tabular-nums">
            {item.finalScore}
          </span>
        )}
        {song.status === 'READY' && (
          <Link
            to={`/player/${song.id}`}
            aria-label={`Cantar ${song.title} de novo`}
            className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-contrast"
          >
            <Play aria-hidden="true" className="size-5 fill-current" />
          </Link>
        )}
      </div>
    </li>
  );
}

export function HistoryPage() {
  const profile = useProfileStore((state) => state.currentProfile);
  const history = useHistoryInfiniteQuery(profile?.id);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl">Histórico</h1>
        {profile && <p className="text-base text-muted">O que {profile.name} já cantou</p>}
      </div>

      {history.isLoading && <Spinner className="mx-auto mt-10 size-10" />}
      {history.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar o histórico.
        </p>
      )}

      {history.isSuccess && items.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <h2 className="text-xl font-semibold">Ainda não cantou nenhuma música</h2>
          <p className="text-base text-muted">
            Escolha uma música na{' '}
            <Link to="/biblioteca" className="underline">
              biblioteca
            </Link>{' '}
            e solte a voz!
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul aria-label="Músicas cantadas" className="flex flex-col gap-2">
          {items.map((item) => (
            <HistoryRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {history.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => void history.fetchNextPage()}
            isLoading={history.isFetchingNextPage}
          >
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
