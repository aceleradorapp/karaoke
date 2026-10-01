import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

interface SearchBoxProps {
  isOpenOnSmallScreens: boolean;
  onSubmitted: () => void;
}

export function SearchBox({ isOpenOnSmallScreens, onSubmitted }: SearchBoxProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/biblioteca?q=${encodeURIComponent(trimmed)}`);
    onSubmitted();
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={clsx(
        'order-last w-full items-center gap-2 rounded-lg bg-surface-2 px-3 lg:order-none lg:flex lg:w-72',
        isOpenOnSmallScreens ? 'flex' : 'hidden',
      )}
    >
      <Search aria-hidden="true" className="size-5 shrink-0 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar músicas"
        placeholder="Buscar músicas…"
        className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
      />
    </form>
  );
}
