import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const SHOTS = 'shots6b';
const SONG_ID = 'cmupw7a4q0001u0v0facactnd';
const SONG_DIR = `D:/Projetos/caraoke-michael/storage/biblioteca/${SONG_ID}`;
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (route, init) => {
  const response = await fetch(`${BASE}/api${route}`, init);
  return response.status === 204 ? null : response.json();
};
const send = (method, route, body) =>
  api(route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const waitUntil = async (description, predicate, timeoutMs = 15000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(120);
  }
  throw new Error(`Timeout esperando: ${description}`);
};
const wake = () => page.mouse.move(380 + Math.random() * 200, 380 + Math.random() * 200);
const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const doc = JSON.parse(fs.readFileSync(`${SONG_DIR}/letra.json`, 'utf-8'));
const line = doc.lines[3];
const LINE_START = line.start;
const LINE_END = line.end;
const WORDS = line.text.split(/\s+/).length;
console.log(`linha 4: ${LINE_START}s – ${LINE_END}s, ${WORDS} palavras`);

const settingsBefore = await api('/settings');
const songBefore = await api(`/songs/${SONG_ID}`);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

const seekTo = (seconds) =>
  page.getByRole('slider', { name: 'Posição da música' }).evaluate(
    (input, fraction) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(fraction));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    Math.round((seconds / songBefore.durationSec) * 1000),
  );

async function sampleLine(maxMs = 11000) {
  await seekTo(LINE_START - 0.6);
  await page.waitForFunction(() => document.querySelector('p.lyric-enter') !== null, null, { timeout: 8000 }).catch(() => undefined);
  const samples = await page.evaluate(
    (limit) =>
      new Promise((resolve) => {
        const startedAt = performance.now();
        const out = [];
        const timer = setInterval(() => {
          const spans = [...document.querySelectorAll('p.lyric-enter .lyric-fill')];
          const text = document.querySelector('p.lyric-enter')?.textContent?.trim() ?? null;
          out.push({ t: performance.now() - startedAt, text, p: spans.map((s) => Number(s.style.getPropertyValue('--p') || 0)) });
          const done = spans.length > 0 && spans.every((s) => Number(s.style.getPropertyValue('--p')) === 1);
          if (performance.now() - startedAt > limit || (done && out.length > 20)) {
            clearInterval(timer);
            resolve(out);
          }
        }, 80);
      }),
    maxMs,
  );
  return samples.filter((sample) => sample.text && sample.text.startsWith('Que eu nunca'));
}

const timeToFull = (samples) => {
  const first = samples[0];
  const full = samples.find((sample) => sample.p.length > 0 && sample.p.every((value) => value === 1));
  return first && full ? (full.t - first.t) / 1000 : null;
};
const isNonDecreasing = (samples) =>
  samples.every((sample, index) => index === 0 || sample.p.every((value, word) => value >= (samples[index - 1].p[word] ?? 0) - 1e-9));

try {
  await send('PATCH', '/settings', { 'player.lyricsEffectEnabled': true, 'player.lyricsEffect': 'smooth' });
  await send('PATCH', `/songs/${SONG_ID}`, { fillPercent: 100 });

  await page.goto(`${BASE}/perfis`);
  await page.getByRole('button', { name: /Michael/ }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/player/${SONG_ID}`);
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 60000 });
  await page.mouse.move(400, 400);

  // 1. controls
  check('o botão "Efeito: ligado" está no player', await page.getByRole('button', { name: /Efeito: ligado/ }).isVisible());
  check('o combo do modelo começa em "Preencher aos poucos"', (await page.getByRole('combobox', { name: 'Modelo do efeito' }).inputValue()) === 'smooth');
  check('o tempo começa em 100%', (await page.getByRole('slider', { name: 'Tempo de preenchimento' }).inputValue()) === '100');
  await page.screenshot({ path: `${SHOTS}/player-controles-1366.png` });

  // 2. smooth model
  await page.mouse.move(420, 420);
  const smooth = await sampleLine();
  const smoothFull = timeToFull(smooth);
  const intermediate = smooth.some((sample) => sample.p.some((value) => value > 0 && value < 1));
  check('"Preencher aos poucos" enche gradualmente, sem voltar atrás', intermediate && isNonDecreasing(smooth), `${smooth.length} amostras`);
  check('termina de pintar perto do fim da linha (100%)', smoothFull !== null && Math.abs(smoothFull - (LINE_END - LINE_START)) < 1.2, `${smoothFull?.toFixed(2)} s para ${(LINE_END - LINE_START).toFixed(2)} s`);

  // 3. fill time: faster
  await page.mouse.move(430, 430);
  for (let step = 0; step < 10; step++) await page.getByRole('button', { name: 'Terminar de pintar mais cedo' }).click();
  check('os botões levam o tempo para 50%', (await page.getByRole('slider', { name: 'Tempo de preenchimento' }).inputValue()) === '50');
  await waitUntil('tempo salvo na música', async () => (await api(`/songs/${SONG_ID}`)).fillPercent === 50);
  check('o tempo (50%) foi salvo sozinho na música', true);
  const fast = await sampleLine();
  const fastFull = timeToFull(fast);
  check('com 50% termina de pintar na metade do tempo, e começa no mesmo ponto', fastFull !== null && smoothFull !== null && Math.abs(fastFull - smoothFull * 0.5) < 0.9 , `${fastFull?.toFixed(2)} s contra ${smoothFull?.toFixed(2)} s`);

  // 4. slower
  await page.mouse.move(440, 440);
  await page.getByRole('slider', { name: 'Tempo de preenchimento' }).focus();
  await page.getByRole('slider', { name: 'Tempo de preenchimento' }).evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '150');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitUntil('150 salvo', async () => (await api(`/songs/${SONG_ID}`)).fillPercent === 150);
  const slow = await sampleLine(14000);
  const slowFull = timeToFull(slow);
  check('com 150% termina de pintar depois do tempo normal', slowFull === null || (smoothFull !== null && slowFull > smoothFull * 1.2), `${slowFull?.toFixed(2) ?? 'não terminou na amostra'} s`);

  // 5. words model
  await wake();
  await page.getByRole('button', { name: 'Voltar o tempo para 100%' }).click();
  await waitUntil('100 salvo', async () => (await api(`/songs/${SONG_ID}`)).fillPercent === 100);
  await wake();
  await page.getByRole('combobox', { name: 'Modelo do efeito' }).selectOption('words');
  await waitUntil('modelo salvo', async () => (await api('/settings'))['player.lyricsEffect'] === 'words');
  check('o modelo escolhido foi gravado nas configurações', true);
  const words = await sampleLine();
  const wordsFull = timeToFull(words);
  const onlyWhole = words.every((sample) => sample.p.every((value) => value === 0 || value === 1));
  const paintedCounts = words.map((sample) => sample.p.filter((value) => value === 1).length);
  const inOrder = words.every((sample) => sample.p.every((value, index) => index === 0 || value <= sample.p[index - 1]));
  check('"Palavra por palavra" só pinta palavras inteiras (0 ou 1)', onlyWhole);
  check('as palavras são pintadas em ordem, uma de cada vez', inOrder && Math.max(...paintedCounts) === WORDS && new Set(paintedCounts).size >= 4, `etapas: ${[...new Set(paintedCounts)].join('→')}`);
  check('a primeira palavra pinta logo no começo da linha', paintedCounts.slice(0, 6).some((count) => count >= 1));
  check('a última palavra é pintada antes do fim da linha (100%)', wordsFull !== null && wordsFull < LINE_END - LINE_START, `${wordsFull?.toFixed(2)} s`);
  await page.screenshot({ path: `${SHOTS}/player-palavras-1366.png` });

  // 6. effect off
  await wake();
  await page.getByRole('button', { name: /Efeito: ligado/ }).click();
  await waitUntil('efeito desligado salvo', async () => (await api('/settings'))['player.lyricsEffectEnabled'] === false);
  const off = await sampleLine(3000);
  check('com o efeito desligado a linha inteira fica pintada assim que começa', off.length > 0 && off[0].p.every((value) => value === 1), JSON.stringify(off[0]?.p));
  check('com o efeito desligado o combo e o tempo ficam travados', await page.getByRole('combobox', { name: 'Modelo do efeito' }).isDisabled() && await page.getByRole('slider', { name: 'Tempo de preenchimento' }).isDisabled());
  await page.screenshot({ path: `${SHOTS}/player-efeito-desligado-1366.png` });

  // 7. key E
  await wake();
  await page.keyboard.press('e');
  await waitUntil('efeito religado', async () => (await api('/settings'))['player.lyricsEffectEnabled'] === true);
  check('a tecla E liga o efeito de novo', await page.getByRole('button', { name: /Efeito: ligado/ }).isVisible());

  // 8. persistence after reload
  await page.reload();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 60000 });
  await page.mouse.move(400, 400);
  check('ao reabrir o player o modelo gravado continua (Palavra por palavra)', (await page.getByRole('combobox', { name: 'Modelo do efeito' }).inputValue()) === 'words');
  check('ao reabrir o tempo da música continua (100%)', (await page.getByRole('slider', { name: 'Tempo de preenchimento' }).inputValue()) === '100');

  await page.keyboard.press('Escape');
  await sleep(400);
  const exit = page.getByRole('dialog', { name: 'Sair da música' });
  if (await exit.count()) await exit.getByRole('button', { name: 'Sair' }).click();

  // 9. sync page layout and controls
  await page.goto(`${BASE}/musica/${SONG_ID}/sincronizar`);
  await page.getByRole('list', { name: 'Linhas da letra' }).waitFor({ timeout: 60000 });
  await sleep(1200);
  const timelineBox = await page.getByRole('region', { name: 'Linha do tempo' }).boundingBox();
  const previewBox = await page.getByRole('region', { name: 'Como vai aparecer no karaokê' }).boundingBox();
  check('na página de sincronizar a pré-visualização fica logo abaixo da linha do tempo', previewBox.y >= timelineBox.y + timelineBox.height - 1 && previewBox.y - (timelineBox.y + timelineBox.height) < 40, `${Math.round(previewBox.y - (timelineBox.y + timelineBox.height))}px de distância`);
  const preview = page.getByRole('region', { name: 'Como vai aparecer no karaokê' });
  check('a pré-visualização tem o combo, o liga/desliga e o tempo', await preview.getByRole('combobox', { name: 'Modelo do efeito' }).isVisible() && await preview.getByRole('button', { name: /Efeito:/ }).isVisible() && await preview.getByRole('slider', { name: 'Tempo de preenchimento' }).isVisible());
  await preview.getByRole('button', { name: 'Terminar de pintar mais tarde' }).click();
  await preview.getByRole('button', { name: 'Terminar de pintar mais tarde' }).click();
  await waitUntil('tempo salvo pela página de sincronizar', async () => (await api(`/songs/${SONG_ID}`)).fillPercent === 110);
  check('mudar o tempo na página de sincronizar salva na música (110%)', true);
  check('a mesma escolha de modelo aparece aqui', (await preview.getByRole('combobox', { name: 'Modelo do efeito' }).inputValue()) === 'words');
  await page.screenshot({ path: `${SHOTS}/sincronizar-1366.png`, fullPage: true });

  // 10. responsive
  for (const width of [375, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
    await page.goto(`${BASE}/musica/${SONG_ID}/sincronizar`);
    await page.getByRole('list', { name: 'Linhas da letra' }).waitFor({ timeout: 60000 });
    await sleep(500);
    check(`${width}px: sincronizar sem rolagem horizontal`, (await overflowOf(page)) <= 0, `overflow=${await overflowOf(page)}`);
    const small = await page.getByRole('button').evaluateAll((list) => list.filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim()).slice(0, 3));
    check(`${width}px: sincronizar com botões de toque`, small.length === 0, small.join(','));
    await page.goto(`${BASE}/player/${SONG_ID}`);
    await page.getByRole('button', { name: 'Começar' }).click();
    await page.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 60000 });
    await page.mouse.move(100, 100);
    await sleep(300);
    check(`${width}px: player sem rolagem horizontal com a linha do efeito`, (await overflowOf(page)) <= 0, `overflow=${await overflowOf(page)}`);
    const controls = await page.getByRole('combobox', { name: 'Modelo do efeito' }).boundingBox();
    check(`${width}px: o combo do efeito cabe na tela`, controls.x >= 0 && controls.x + controls.width <= width + 1, `${Math.round(controls.x)}..${Math.round(controls.x + controls.width)}`);
    const smallPlayer = await page.getByRole('button').evaluateAll((list) => list.filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim()).slice(0, 3));
    check(`${width}px: player com botões de toque`, smallPlayer.length === 0, smallPlayer.join(','));
    await page.screenshot({ path: `${SHOTS}/player-${width}.png` });
    await page.keyboard.press('Escape');
    await sleep(300);
    const exitDialog = page.getByRole('dialog', { name: 'Sair da música' });
    if (await exitDialog.count()) await exitDialog.getByRole('button', { name: 'Sair' }).click();
  }

  const filtered = consoleErrors.filter((text) => !/favicon|ERR_BLOCKED|Not implemented/i.test(text));
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
  await send('PATCH', `/songs/${SONG_ID}`, { fillPercent: songBefore.fillPercent });
  console.log('\nconfigurações e tempo da música restaurados para os valores de antes do teste');
}

console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(results.every(Boolean) ? 0 : 1);
