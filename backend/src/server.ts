import { buildApp } from './app.js';
import { env } from './env.js';
import { attachRealtime, closeRealtime } from './realtime.js';
import { recoverInterruptedJobs } from './modules/jobs/recovery.js';
import { ensureDirs } from './services/storage.js';
import { startUploadWatcher } from './services/watcher.js';
import { startWorkerWatchdog } from './services/workerStatus.js';
import { ensureAccessCode } from './modules/system/access.js';
import { getAccessCode } from './modules/settings/service.js';

async function main(): Promise<void> {
  await ensureDirs();
  const recovery = await recoverInterruptedJobs();
  if (recovery.requeued + recovery.gaveUp > 0) console.info('Interrupted jobs recovered:', recovery);

  const app = await buildApp();
  await ensureAccessCode();
  attachRealtime(app.server, getAccessCode);
  startWorkerWatchdog();
  const uploadWatcher = startUploadWatcher();

  const shutdown = async () => {
    await uploadWatcher.close();
    await closeRealtime();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
