import type { SongDTO } from '@caraoke/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useRef } from 'react';
import { SongCard } from './SongCard';

const SCROLL_FRACTION = 0.8;

interface SongRowProps {
  title: string;
  songs: SongDTO[];
}

export function SongRow({ title, songs }: SongRowProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const headingId = useId();

  function scrollBy(direction: -1 | 1) {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * SCROLL_FRACTION, behavior: 'smooth' });
  }

  return (
    <section aria-labelledby={headingId} className="group/row flex flex-col gap-3">
      <h2 id={headingId} className="px-1 text-xl font-semibold">
        {title}
      </h2>

      <div className="relative">
        <button
          type="button"
          aria-label={`Rolar ${title} para a esquerda`}
          onClick={() => scrollBy(-1)}
          className="absolute left-2 top-1/3 z-20 hidden size-11 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-black group-hover/row:opacity-100 focus-visible:opacity-100 md:inline-flex"
        >
          <ChevronLeft aria-hidden="true" />
        </button>

        <ul
          ref={scroller}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {songs.map((song) => (
            <li key={song.id} className="w-64 shrink-0 snap-start sm:w-72 lg:w-80">
              <SongCard song={song} />
            </li>
          ))}
        </ul>

        <button
          type="button"
          aria-label={`Rolar ${title} para a direita`}
          onClick={() => scrollBy(1)}
          className="absolute right-2 top-1/3 z-20 hidden size-11 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-black group-hover/row:opacity-100 focus-visible:opacity-100 md:inline-flex"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
