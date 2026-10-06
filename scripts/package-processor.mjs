import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'dist-downloads');
const zipPath = path.join(outputDir, 'Processador-do-Karaoke.zip');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'processador-'));
const packageDir = path.join(staging, 'Processador-do-Karaoke');
const SKIPPED = new Set(['__pycache__', '.pytest_cache']);
const DEV_ONLY_REQUIREMENTS = /^pytest\b/;

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

copyTree(path.join(root, 'remote-worker'), packageDir);
copyTree(path.join(root, 'worker', 'caraoke_worker'), path.join(packageDir, 'caraoke_worker'));
const requirements = fs
  .readFileSync(path.join(root, 'worker', 'requirements.txt'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() && !DEV_ONLY_REQUIREMENTS.test(line.trim()));
fs.writeFileSync(path.join(packageDir, 'requirements.txt'), `${requirements.join('\n')}\n`);

fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(zipPath, { force: true });
execFileSync(
  'powershell',
  ['-NoProfile', '-Command', `Compress-Archive -Path '${packageDir}' -DestinationPath '${zipPath}' -Force`],
  { stdio: 'inherit' },
);
fs.rmSync(staging, { recursive: true, force: true });
console.log(`Pacote gerado: ${path.relative(root, zipPath)} (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB)`);
