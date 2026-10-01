import type { YoutubeSearchResult } from '@caraoke/shared';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useYoutubeSearchQuery } from '../../api/youtube';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { ImportDialog } from './ImportDialog';
import { YoutubePreviewModal } from './YoutubePreviewModal';
import { YoutubeResultCard, type ImportState } from './YoutubeResultCard';

const QUERY_PARAM = 'q';

export function YoutubeSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = (searchParams.get(QUERY_PARAM) ?? '').trim();
  const [draft, setDraft] = useState(submittedQuery);
  const [previewing, setPreviewing] = useState<YoutubeSearchResult | null>(null);
  const [importing, setImporting] = useState<YoutubeSearchResult | null>(null);
  const [queuedIds, setQueuedIds] = useState<ReadonlySet<string>>(new Set());
  const search = useYoutubeSearchQuery(submittedQuery);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed) setSearchParams({ [QUERY_PARAM]: trimmed });
  }

  function stateOf(video: YoutubeSearchResult): ImportState {
    if (queuedIds.has(video.youtubeId)) return 'queued';
    return video.existingSongId ? 'in-library' : 'available';
  }

  function startImport(video: YoutubeSearchResult) {
    setPreviewing(null);
    setImporting(video);
  }

  return (
    <div className="flex flex-col gap-6">
      <form role="search" onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label className="flex min-h-11 flex-1 items-center gap-3 rounded-xl bg-surface-2 px-4">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted" />
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Buscar no YouTube"
            placeholder="Buscar música ou artista no YouTube…"
            className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
          />
        </label>
        <Button type="submit">Buscar</Button>
      </form>

      {search.isFetching && (
        <div role="status" className="flex items-center gap-3 text-muted">
          <Spinner className="size-6" />
          Buscando no YouTube…
        </div>
      )}

      {search.isError && (
        <p role="alert" className="text-danger">
          {search.error.message}
        </p>
      )}

      {search.isSuccess && search.data.length === 0 && (
        <p className="text-muted">Nenhum resultado para “{submittedQuery}”.</p>
      )}

      {search.isSuccess && search.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {search.data.map((video) => (
            <YoutubeResultCard
              key={video.youtubeId}
              video={video}
              importState={stateOf(video)}
              onPreview={() => setPreviewing(video)}
              onImport={() => startImport(video)}
            />
          ))}
        </ul>
      )}

      <YoutubePreviewModal
        video={previewing}
        canImport={previewing !== null && stateOf(previewing) === 'available'}
        onClose={() => setPreviewing(null)}
        onImport={startImport}
      />
      <ImportDialog
        video={importing}
        onClose={() => setImporting(null)}
        onImported={(youtubeId) => setQueuedIds((current) => new Set(current).add(youtubeId))}
      />
    </div>
  );
}
