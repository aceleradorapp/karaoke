import { YoutubeSearch } from './YoutubeSearch';

export function YoutubePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-display text-4xl text-text sm:text-5xl">YouTube</h1>
      <YoutubeSearch />
    </div>
  );
}
