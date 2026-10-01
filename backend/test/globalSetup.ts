import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { TEST_DATABASE_URL } from './constants.js';

const TEST_DATABASE_SUFFIX = '_test';

export default function setup(): void {
  if (!TEST_DATABASE_URL.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error('Refusing to reset a database whose name does not end with "_test"');
  }

  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
    shell: true,
  });
}
