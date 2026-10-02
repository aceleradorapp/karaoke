import type { RankingPeriod, RankingProfile, RankingResponse } from '@caraoke/shared';
import clsx from 'clsx';
import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useRankingQuery } from '../../api/ranking';
import { Avatar } from '../../components/Avatar';
import { Spinner } from '../../components/Spinner';
import { ToggleField } from '../settings/fields';

const PERIODS: Array<{ value: RankingPeriod; label: string }> = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'all', label: 'Sempre' },
];

const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHTS = ['h-36 sm:h-44', 'h-28 sm:h-32', 'h-20 sm:h-24'];
const MEDALS = ['🥇', '🥈', '🥉'];

function readPeriod(value: string | null): RankingPeriod {
  return PERIODS.some((period) => period.value === value) ? (value as RankingPeriod) : 'month';
}

function ProfileName({ profile }: { profile: RankingProfile }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{profile.name}</span>
      {profile.isGuest && (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 text-xs text-muted">convidado</span>
      )}
    </span>
  );
}

function Podium({ rows }: { rows: RankingResponse['bestAverage'] }) {
  const top = rows.slice(0, 3);
  return (
    <ol aria-label="Pódio" className="flex items-end justify-center gap-2 sm:gap-6">
      {PODIUM_ORDER.filter((index) => top[index]).map((index) => {
        const row = top[index];
        if (!row) return null;
        return (
          <li key={row.profile.id} className="flex w-24 min-w-0 flex-col items-center gap-2 sm:w-40">
            <Avatar avatarId={row.profile.avatar} size={index === 0 ? 'lg' : 'md'} />
            <span className="w-full truncate text-center text-base font-semibold sm:text-lg">
              {row.profile.name}
            </span>
            <div
              className={clsx(
                'flex w-full flex-col items-center justify-start gap-1 rounded-t-xl bg-surface pt-3',
                PODIUM_HEIGHTS[index],
                index === 0 && 'ring-2 ring-primary',
              )}
            >
              <span aria-hidden="true" className="text-3xl">
                {MEDALS[index]}
              </span>
              <span
                className="font-display text-3xl tabular-nums"
                aria-label={`${index + 1}º lugar, média ${row.avg}`}
              >
                {row.avg}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RankingList({ title, children, isEmpty }: { title: string; children: ReactNode; isEmpty: boolean }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {isEmpty ? (
        <p className="text-base text-muted">Ninguém ainda neste período.</p>
      ) : (
        <ol className="flex flex-col gap-2">{children}</ol>
      )}
    </section>
  );
}

function Row({ position, children, value }: { position: number; children: ReactNode; value: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center gap-3">
      <span className="w-6 shrink-0 text-center text-lg font-semibold text-muted">{position}</span>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <span className="shrink-0 text-base tabular-nums text-muted">{value}</span>
    </li>
  );
}

export function RankingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = readPeriod(searchParams.get('periodo'));
  const isFamilyOnly = searchParams.get('familia') === '1';
  const ranking = useRankingQuery(period, isFamilyOnly ? 'family' : 'all');

  function update(key: string, value: string | null) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const data = ranking.data;
  const hasPodium = (data?.bestAverage.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-4xl sm:text-5xl">Ranking</h1>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="radiogroup" aria-label="Período" className="inline-flex rounded-xl bg-surface p-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={period === option.value}
              onClick={() => update('periodo', option.value === 'month' ? null : option.value)}
              className={clsx(
                'min-h-11 rounded-lg px-4 text-base font-semibold',
                period === option.value ? 'bg-primary text-primary-contrast' : 'text-muted hover:text-text',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-auto">
          <ToggleField
            label="Só a família"
            checked={isFamilyOnly}
            onChange={(checked) => update('familia', checked ? '1' : null)}
          />
        </div>
      </div>

      {ranking.isLoading && <Spinner className="mx-auto size-10" />}
      {ranking.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar o ranking.
        </p>
      )}

      {data && (
        <>
          {data.champion && (
            <section
              aria-label="Estrela do mês"
              className="flex items-center gap-4 rounded-2xl bg-surface p-4 ring-2 ring-primary sm:p-6"
            >
              <Crown aria-hidden="true" className="size-10 shrink-0 text-yellow-400" />
              <Avatar avatarId={data.champion.profile.avatar} size="md" />
              <div className="min-w-0">
                <p className="text-sm text-muted">Estrela do karaokê do mês</p>
                <p className="truncate font-display text-3xl">{data.champion.profile.name}</p>
                <p className="text-base text-muted">média {data.champion.avg}</p>
              </div>
            </section>
          )}

          <section aria-label="Melhores médias" className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold">Melhores médias</h2>
            {hasPodium ? (
              <>
                <Podium rows={data.bestAverage} />
                {data.bestAverage.length > 3 && (
                  <ol className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
                    {data.bestAverage.slice(3).map((row, index) => (
                      <Row key={row.profile.id} position={index + 4} value={`média ${row.avg}`}>
                        <Avatar avatarId={row.profile.avatar} size="sm" />
                        <ProfileName profile={row.profile} />
                      </Row>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className="rounded-2xl bg-surface p-4 text-base text-muted">
                Ainda não há pódio neste período: cada pessoa precisa de 3 músicas com nota para entrar.
              </p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankingList title="Quem mais cantou" isEmpty={data.mostSung.length === 0}>
              {data.mostSung.map((row, index) => (
                <Row
                  key={row.profile.id}
                  position={index + 1}
                  value={`${row.count} ${row.count === 1 ? 'música' : 'músicas'}`}
                >
                  <Avatar avatarId={row.profile.avatar} size="sm" />
                  <ProfileName profile={row.profile} />
                </Row>
              ))}
            </RankingList>
            <RankingList title="Músicas mais cantadas" isEmpty={data.topSongs.length === 0}>
              {data.topSongs.map((row, index) => (
                <Row key={row.song.id} position={index + 1} value={`${row.count}×`}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{row.song.title}</span>
                    <span className="block truncate text-sm text-muted">{row.song.artist}</span>
                  </span>
                </Row>
              ))}
            </RankingList>
          </div>
        </>
      )}
    </div>
  );
}
