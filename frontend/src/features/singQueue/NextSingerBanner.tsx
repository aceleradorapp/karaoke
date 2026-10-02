import { Play } from 'lucide-react';
import { Link } from 'react-router';
import { firstReadyRequest, singRequestRoute, useSingQueueQuery } from '../../api/singQueue';
import { Avatar } from '../../components/Avatar';

export function NextSingerBanner() {
  const queue = useSingQueueQuery();
  const requests = queue.data ?? [];
  const next = firstReadyRequest(requests);
  if (!next) return null;

  const othersCount = requests.length - 1;

  return (
    <section
      aria-label="Próximo a cantar"
      className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface p-4 ring-2 ring-primary sm:p-5"
    >
      <Avatar avatarId={next.profile.avatar} size="md" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl leading-tight sm:text-3xl">Vez de {next.profile.name}!</p>
        <p className="truncate text-base text-muted">
          {next.song.title} — {next.song.artist}
        </p>
        {othersCount > 0 && (
          <Link to="/proximos" className="inline-flex min-h-11 items-center text-base text-primary underline">
            e mais {othersCount} na fila
          </Link>
        )}
      </div>
      <Link
        to={singRequestRoute(next)}
        className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-lg font-semibold text-primary-contrast max-sm:w-full max-sm:justify-center"
      >
        <Play aria-hidden="true" className="size-5 fill-current" />
        Chamar
      </Link>
    </section>
  );
}
