import chokidar, { type FSWatcher } from 'chokidar';
import { ingestUploadedFile } from '../modules/uploads/ingest.js';
import { storagePaths } from './storage.js';

const STABILITY_THRESHOLD_MS = 2000;
const POLL_INTERVAL_MS = 500;
const IGNORED_SUFFIXES = ['.meta.json', '.part', '.tmp'];

export function startUploadWatcher(): FSWatcher {
  const watcher = chokidar.watch(storagePaths.uploadDir, {
    ignoreInitial: false,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: STABILITY_THRESHOLD_MS, pollInterval: POLL_INTERVAL_MS },
    ignored: (filePath) => IGNORED_SUFFIXES.some((suffix) => filePath.endsWith(suffix)),
  });

  watcher.on('add', (filePath) => {
    ingestUploadedFile(filePath).catch((error) => console.error('Failed to ingest upload', filePath, error));
  });

  return watcher;
}
