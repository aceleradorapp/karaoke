import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESTART_EXIT_CODE = 75;
const RETRY_DELAY_MS = 3000;
const PYTHON =
  process.platform === 'win32'
    ? path.join(ROOT, 'worker', '.venv', 'Scripts', 'python.exe')
    : path.join(ROOT, 'worker', '.venv', 'bin', 'python');

const SERVICES = {
  api: {
    color: '\x1b[34m',
    command: process.execPath,
    args: ['--import', 'tsx', 'src/festa.ts'],
    cwd: path.join(ROOT, 'backend'),
  },
  worker: {
    color: '\x1b[33m',
    command: PYTHON,
    args: ['-m', 'caraoke_worker'],
    cwd: path.join(ROOT, 'worker'),
  },
};

const running = new Map();
let isStopping = false;

function log(name, message) {
  const color = SERVICES[name]?.color ?? '\x1b[35m';
  process.stdout.write(`${color}[${name}]\x1b[0m ${message}\n`);
}

function pipe(name, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) log(name, line);
  });
}

function start(name) {
  const service = SERVICES[name];
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, CARAOKE_SUPERVISED: '1', PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.set(name, child);
  pipe(name, child.stdout);
  pipe(name, child.stderr);
  child.on('exit', (code) => onExit(name, child, code));
}

function stop(name) {
  const child = running.get(name);
  running.delete(name);
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

async function restartAll() {
  log('vigia', 'Reiniciando o sistema a pedido do app…');
  await stop('worker');
  start('api');
  start('worker');
}

function onExit(name, child, code) {
  if (running.get(name) !== child) return;
  running.delete(name);
  if (isStopping) return;
  if (name === 'api' && code === RESTART_EXIT_CODE) {
    void restartAll();
    return;
  }
  log('vigia', `${name} parou (código ${code}). Religando em ${RETRY_DELAY_MS / 1000} s…`);
  setTimeout(() => {
    if (!isStopping && !running.has(name)) start(name);
  }, RETRY_DELAY_MS);
}

async function shutdown() {
  if (isStopping) return;
  isStopping = true;
  log('vigia', 'Desligando…');
  await Promise.all([...running.keys()].map(stop));
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

log('vigia', 'Modo festa: servidor e worker sob o vigia (reinicia sozinho se algo cair).');
start('api');
start('worker');
