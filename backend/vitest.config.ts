import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL, TEST_STORAGE_DIR, TEST_WORKER_TOKEN } from './test/constants.js';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      WORKER_TOKEN: TEST_WORKER_TOKEN,
      STORAGE_DIR: TEST_STORAGE_DIR,
    },
  },
});
