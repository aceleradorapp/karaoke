import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const SONG_ID = 'cmupw7a4q0001u0v0facactnd';
const SONG_DIR = `D:/Projetos/caraoke-michael/storage/biblioteca/${SONG_ID}`;
const SHOTS = 'shots6c';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (route, init) => (await fetch(`${BASE}/api${route}`, init)).json();
const send = (method, route, body) =>
  api(route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const stored = () => JSON.parse(fs.readFileSync(`${SONG_DIR}/letra.json`, 'utf-8'));
const waitUntil = async (description, predicate, timeoutMs = 15000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return true;
    await sleep(150);
  }
  throw new Error(`Timeout: ${description}`);
};

const doc = stored();
const settingsBefore = await api('/settings');
const song = await api(`/songs/${SONG_ID}`);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const consoleErrors = [];
page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
page.on('pageerror', (error) => consoleErrors.push(error.message));
const wake = () => page.mouse.move(300 + Math.random() * 300, 300 + Math.random() * 200);

const seekTo = (seconds) =>
  page.getByRole('slider', { name: 'Posição da música' }).evaluate(
    (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    Math.round((seconds / song.durationSec) * 1000),
  );

async function sampleLine(lineIndex, seconds) {
  const line = doc.lines[lineIndex];
  await seekTo(line.start - 0.8);
  return page.evaluate(
    ({ limit, prefix }) =>
      new Promise((resolve) => {
        const startedAt = performance.now();
        const out = [];
        const timer = setInterval(() => {
          const text = document.querySelector('p.lyric-enter')?.textContent?.trim() ?? '';
          const p = [...document.querySelectorAll('p.lyric-enter .lyric-fill')].map((s) => Number(s.style.getPropertyValue('--p') || 0));
          if (text.startsWith(prefix)) out.push({ t: (performance.now() - startedAt) / 1000, p });
          if (performance.now() - startedAt > limit * 1000) {
            clearInterval(timer);
            resolve(out);
          }
        }, 40);
      }),
    { limit: seconds, prefix: line.text.split(' ').slice(0, 2).join(' ') },
  );
}

function crossings(samples, wordCount) {
  return Array.from({ length: wordCount }, (_, word) => samples.find((sample) => (sample.p[word] ?? 0) > 0)?.t ?? null);
}

try {
  await send('PATCH', '/settings', { 'player.lyricsEffectEnabled': true, 'player.lyricsEffect': 'smooth' });

  await page.goto(`${BASE}/perfis`);
  await page.getByRole('button', { name: /Michael/ }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/player/${SONG_ID}`);
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 60000 });
  await wake();

  check('a letra salva tem os tempos de cada palavra em todas as linhas', doc.lines.every((line) => line.words?.length === line.text.split(/\s+/).length));

  for (const lineIndex of [2, 3, 6]) {
    const line = doc.lines[lineIndex];
    const samples = await sampleLine(lineIndex, line.end - line.start + 1.5);
    const crossed = crossings(samples, line.words.length);
    const base = crossed[0];
    const errors = line.words.map((word, index) =>
      crossed[index] === null || base === null ? null : crossed[index] - base - (word.start - line.words[0].start),
    );
    const worst = Math.max(...errors.map((value) => (value === null ? 99 : Math.abs(value))));
    check(
      `linha ${lineIndex + 1}: cada palavra começa a pintar no tempo dela (erro máx. ${worst.toFixed(2)} s)`,
      worst <= 0.2,
      line.words.map((word, index) => `${word.text}:${errors[index]?.toFixed(2)}`).join(' '),
    );
    await wake();
  }

  const line4 = doc.lines[3];
  const amor = line4.words.length - 1;
  const held = await sampleLine(3, line4.end - line4.start + 1);
  const amorSamples = held.filter((sample) => sample.p[amor] > 0 && sample.p[amor] < 1);
  check('a última palavra ("amor") enche aos poucos durante o tempo em que é cantada', amorSamples.length >= 5, `${amorSamples.length} amostras parciais`);

  await wake();
  await page.getByRole('combobox', { name: 'Modelo do efeito' }).selectOption('words');
  await waitUntil('modelo', async () => (await api('/settings'))['player.lyricsEffect'] === 'words');
  const whole = await sampleLine(2, 6);
  const wholeCrossed = crossings(whole, doc.lines[2].words.length);
  const gap = wholeCrossed[3] - wholeCrossed[2];
  const expected = doc.lines[2].words[3].start - doc.lines[2].words[2].start;
  check('"Palavra por palavra" respeita a pausa real da linha 3 ("atrás" → "pensei")', Math.abs(gap - expected) <= 0.2, `${gap.toFixed(2)} s contra ${expected.toFixed(2)} s`);
  check('"Palavra por palavra" só usa 0 ou 1', whole.every((sample) => sample.p.every((value) => value === 0 || value === 1)));
  await page.screenshot({ path: `${SHOTS}/player-palavras.png` });

  await wake();
  await page.keyboard.press('Escape');
  await sleep(400);
  const exit = page.getByRole('dialog', { name: 'Sair da música' });
  if (await exit.count()) await exit.getByRole('button', { name: 'Sair' }).click();

  // sync page keeps the words
  await page.goto(`${BASE}/musica/${SONG_ID}/sincronizar`);
  await page.getByRole('list', { name: 'Linhas da letra' }).waitFor({ timeout: 60000 });
  await sleep(1200);
  await page.getByRole('button', { name: 'Atrasar a linha 4 em 0,1 s' }).click();
  await page.getByRole('button', { name: 'Atrasar a linha 4 em 0,1 s' }).click();
  await waitUntil('linha salva', () => Math.abs(stored().lines[3].start - (doc.lines[3].start + 0.2)) < 0.011, 8000);
  const moved = stored().lines[3];
  check('mover a linha na página de sincronizar leva as palavras junto', moved.words?.length === line4.words.length && Math.abs(moved.words[2].start - (line4.words[2].start + 0.2)) < 0.011, `${line4.words[2].start} → ${moved.words?.[2]?.start}`);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await waitUntil('desfeito', () => Math.abs(stored().lines[3].start - doc.lines[3].start) < 0.011, 8000);
  check('desfazer volta a linha e as palavras e salva de novo', Math.abs(stored().lines[3].words[2].start - line4.words[2].start) < 0.011);
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/sincronizar-palavras.png`, fullPage: true });

  const filtered = consoleErrors.filter((text) => !/favicon|ERR_BLOCKED|status of 404/i.test(text));
  check('nenhum erro no console', filtered.length === 0, filtered.slice(0, 3).join(' | '));
} catch (error) {
  console.error('ERRO NO ROTEIRO:', error.message);
  results.push(false);
  await page.screenshot({ path: `${SHOTS}/erro.png`, fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  await send('PATCH', '/settings', {
    'player.lyricsEffectEnabled': settingsBefore['player.lyricsEffectEnabled'],
    'player.lyricsEffect': settingsBefore['player.lyricsEffect'],
  });
}

console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(results.every(Boolean) ? 0 : 1);
