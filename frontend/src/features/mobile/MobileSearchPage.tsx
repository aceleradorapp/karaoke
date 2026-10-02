import { YoutubeSearch } from '../youtube/YoutubeSearch';

export function MobileSearchPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Buscar no YouTube</h1>
      <YoutubeSearch />
    </div>
  );
}
