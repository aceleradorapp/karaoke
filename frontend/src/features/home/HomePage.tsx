import { useHomeQuery } from '../../api/songs';
import { Spinner } from '../../components/Spinner';
import { useProfileStore } from '../../stores/useProfileStore';
import { NextSingerBanner } from '../singQueue/NextSingerBanner';
import { SongRow } from '../songs/SongRow';
import { EmptyLibrary } from './EmptyLibrary';
import { HomeHero } from './HomeHero';

export function HomePage() {
  const profileId = useProfileStore((state) => state.currentProfile?.id);
  const home = useHomeQuery(profileId);

  if (home.isLoading) return <Spinner className="mx-auto mt-10 size-10" />;

  if (home.isError) {
    return (
      <p role="alert" className="text-danger">
        Não foi possível carregar a biblioteca.
      </p>
    );
  }

  const { hero, rows } = home.data ?? { hero: null, rows: [] };
  if (!hero && rows.length === 0) return <EmptyLibrary />;

  return (
    <div className="flex flex-col gap-8">
      <NextSingerBanner />
      {hero && <HomeHero song={hero} />}
      {rows.map((row) => (
        <SongRow key={row.id} title={row.title} songs={row.items} />
      ))}
    </div>
  );
}
