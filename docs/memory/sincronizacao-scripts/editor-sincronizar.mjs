import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const SHOTS = 'shots6';
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
const waitUntil = async (description, predicate, timeoutMs = 20000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`Timeout esperando: ${description}`);
};
const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const storedLyrics = () => JSON.parse(fs.readFileSync(`${SONG_DIR}/letra.json`, 'utf-8'));

const PYTHON_ALIGNED = [34.75, 43.25, 51.55, 60.7, 69.45, 78.1, 104.25, 112.85, 121.75, 130.35, 156.7, 165.35, 173.85, 182.55, 191.55, 200.15];

const song = await api(`/songs/${SONG_ID}`);
const rawBefore = fs.readFileSync(`${SONG_DIR}/letra.json`, 'utf-8');
console.log(`música: ${song.title}; offset ${song.lyricsOffsetMs}; fonte ${song.lyricsSource}`);
if (fs.existsSync(`${SONG_DIR}/letra.original.json`)) throw new Error('Já existe letra original; reinicie o cenário');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

const timelineStarts = () => page.locator('[aria-label="Linhas da letra"] li button[aria-label^="Escolher a linha"]').evaluateAll((buttons) =>
  buttons.map((button) => button.querySelector('span:last-child').textContent));
const lineStartsFromList = async () => {
  const labels = await timelineStarts();
  return labels.map((text) => {
    const [minutes, rest] = text.split(':');
    return Number(minutes) * 60 + Number(rest.replace(',', '.'));
  });
};
const canvasBox = async () => {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await sleep(250);
  return page.locator('canvas').boundingBox();
};
const canvasStats = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const background = [data[0], data[1], data[2]];
    let different = 0;
    let white = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index], g = data[index + 1], b = data[index + 2];
      if (Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) > 40) different++;
      if (r > 235 && g > 235 && b > 235) white++;
    }
    return { total: data.length / 4, different, white };
  });

try {
  await page.goto(`${BASE}/perfis`);
  await page.getByRole('button', { name: /Michael/ }).click();
  await page.waitForURL(`${BASE}/`);

  await page.goto(`${BASE}/musica/${SONG_ID}`);
  await page.getByRole('link', { name: 'Sincronizar a letra' }).click();
  await page.getByRole('list', { name: 'Linhas da letra' }).waitFor({ timeout: 60000 });
  await sleep(1500);

  // 1. opening
  const opening = await lineStartsFromList();
  check('abre com as 16 linhas, já com o atraso antigo aplicado (+15,75 s)', opening.length === 16 && Math.abs(opening[0] - 34.99) < 0.02, opening.slice(0, 3).join(', '));
  await sleep(1300);
  check('abrir a tela não grava nada', fs.readFileSync(`${SONG_DIR}/letra.json`, 'utf-8') === rawBefore && (await api(`/songs/${SONG_ID}`)).lyricsOffsetMs === 15750);
  const stats = await canvasStats();
  check('a linha do tempo está desenhada (voz, marcas e faixas)', stats.different > stats.total * 0.05, `${((stats.different / stats.total) * 100).toFixed(1)}%`);
  await page.screenshot({ path: `${SHOTS}/editor-1366.png`, fullPage: true });

  // 2. align with the voice: parity with the Python worker
  await page.getByRole('button', { name: 'Alinhar tudo com a voz' }).click();
  const aligned = await lineStartsFromList();
  const maxDiff = Math.max(...aligned.map((value, index) => Math.abs(value - PYTHON_ALIGNED[index])));
  check('"Alinhar tudo com a voz" no navegador dá os mesmos tempos do worker (≤ 0,1 s)', maxDiff <= 0.1, `maior diferença ${maxDiff.toFixed(2)} s`);
  await waitUntil('letra salva', async () => (await api(`/songs/${SONG_ID}`)).lyricsSource === 'MANUAL', 8000);
  const saved = (await api(`/songs/${SONG_ID}`));
  check('salvou sozinho: fonte MANUAL e atraso zerado', saved.lyricsSource === 'MANUAL' && saved.lyricsOffsetMs === 0, `${saved.lyricsSource} ${saved.lyricsOffsetMs}`);
  check('guardou a letra original do LRCLIB (sem atraso)', fs.existsSync(`${SONG_DIR}/letra.original.json`) && JSON.parse(fs.readFileSync(`${SONG_DIR}/letra.original.json`, 'utf-8')).lines[0].start === 19.24);
  check('a letra salva tem os tempos alinhados', Math.abs(storedLyrics().lines[3].start - 60.7) < 0.1, String(storedLyrics().lines[3].start));
  await page.screenshot({ path: `${SHOTS}/editor-alinhada-1366.png`, fullPage: true });

  // 3. canvas: select and drag line 2 (index 1), then undo
  await page.getByRole('button', { name: 'Escolher a linha 2' }).click();
  await page.getByRole('button', { name: 'Da linha escolhida' }).click();
  await sleep(400);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Tocar a linha 2' }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  const box = await canvasBox();
  await sleep(300);
  const before = await lineStartsFromList();
  const laneY = box.y + 240 * 0.8;
  // line 2 starts at the center of the window (recentered on selection)
  const startX = box.x + box.width / 2 + 40;
  await page.mouse.move(startX, laneY);
  await page.mouse.down();
  await page.mouse.move(startX + 55, laneY, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await lineStartsFromList();
  const expectedDelta = (55 / box.width) * 20;
  check('arrastar a faixa da linha 2 mexe só nela', Math.abs(afterDrag[1] - before[1] - expectedDelta) < 0.06 && afterDrag[0] === before[0] && afterDrag[2] === before[2], `${before[1].toFixed(2)} → ${afterDrag[1].toFixed(2)} (esperado +${expectedDelta.toFixed(2)})`);
  await page.keyboard.press('Control+z');
  const afterUndo = await lineStartsFromList();
  check('Ctrl+Z desfaz o arraste inteiro de uma vez', Math.abs(afterUndo[1] - before[1]) < 0.011, afterUndo[1].toFixed(2));
  await page.keyboard.press('Control+y');
  check('Ctrl+Y refaz', Math.abs((await lineStartsFromList())[1] - afterDrag[1]) < 0.011);
  await page.keyboard.press('Control+z');

  // edge drag changes the start only
  const edgeBefore = await lineStartsFromList();
  const boxNow = await canvasBox();
  await page.mouse.move(boxNow.x + boxNow.width / 2, laneY);
  await page.mouse.down();
  await page.mouse.move(boxNow.x + boxNow.width / 2 + 30, laneY, { steps: 6 });
  await page.mouse.up();
  const edgeAfter = await lineStartsFromList();
  check('arrastar a borda esquerda muda só o começo da linha', edgeAfter[1] > edgeBefore[1] + 0.3 && edgeAfter[0] === edgeBefore[0], `${edgeBefore[1].toFixed(2)} → ${edgeAfter[1].toFixed(2)}`);
  await page.keyboard.press('Control+z');

  // 4. nudge with row buttons, keyboard, magnet
  await page.getByRole('button', { name: 'Atrasar a linha 3 em 0,1 s' }).click();
  await page.getByRole('button', { name: 'Atrasar a linha 3 em 0,1 s' }).click();
  const nudged = await lineStartsFromList();
  check('os botões da linha mexem 0,1 s por clique', Math.abs(nudged[2] - aligned[2] - 0.2) < 0.011, `${aligned[2].toFixed(2)} → ${nudged[2].toFixed(2)}`);
  await page.getByRole('button', { name: 'Imantar a linha 3 ao começo da voz' }).click();
  const snapped = await lineStartsFromList();
  check('o ímã devolve a linha ao começo da voz', Math.abs(snapped[2] - aligned[2]) < 0.06, snapped[2].toFixed(2));

  // 5. text edit
  const input = page.getByLabel('Texto da linha 1', { exact: true });
  const originalText = await input.inputValue();
  await input.fill(`${originalText} (teste)`);
  await input.blur();
  await waitUntil('texto salvo', async () => storedLyrics().lines[0].text.endsWith('(teste)'), 8000);
  check('editar o texto de uma linha salva sozinho', true);
  await page.keyboard.press('Control+z');
  await waitUntil('texto desfeito e salvo', async () => !storedLyrics().lines[0].text.endsWith('(teste)'), 8000);
  check('desfazer volta o texto e salva de novo', true);

  // 6. original
  await waitUntil('original disponível', async () => await page.getByRole('button', { name: 'Voltar ao original' }).isEnabled(), 8000);
  await page.getByRole('button', { name: 'Voltar ao original' }).click();
  const original = await lineStartsFromList();
  check('"Voltar ao original" traz os tempos do LRCLIB', Math.abs(original[0] - 19.24) < 0.06, original[0].toFixed(2));
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  check('e dá para desfazer isso', Math.abs((await lineStartsFromList())[3] - 60.7) < 0.1);

  // 7. tap mode
  await page.getByRole('button', { name: 'Começar a marcar' }).click();
  await page.getByText(/^Linha 1 de 16/).waitFor();
  check('o modo "Marcar tocando" mostra a linha da vez', true);
  await page.getByRole('button', { name: 'Parar de marcar' }).click();

  // 8. wait for saves and compare with what the player will use
  await sleep(1500);
  const finalDoc = storedLyrics();
  const finalStarts = finalDoc.lines.map((line) => line.start);
  const finalDiff = Math.max(...finalStarts.map((value, index) => Math.abs(value - PYTHON_ALIGNED[index])));
  check('a letra salva no fim continua alinhada com a voz (≤ 0,1 s do worker)', finalDiff <= 0.1, `maior diferença ${finalDiff.toFixed(2)} s`);

  // 9. the player uses the saved lyrics, with no offset
  await page.goto(`${BASE}/player/${SONG_ID}`);
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: 'Pausar' }).waitFor({ timeout: 60000 });
  const duration = 258;
  await page.getByRole('slider', { name: 'Posição da música' }).evaluate((input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, Math.round((58.5 / duration) * 1000));
  await sleep(900);
  const sung = () => page.evaluate(() => document.querySelector('.lyric-fill')?.textContent ?? null);
  const beforeLine4 = await sung();
  check('no player, aos 59 s a 4ª linha ainda não entrou', !(beforeLine4 ?? '').includes('Que eu nunca'), String(beforeLine4));
  await sleep(1500);
  const duringLine4 = await sung();
  check('no player, logo depois de 60,7 s a 4ª linha está sendo cantada', (duringLine4 ?? '').includes('Que eu nunca'), String(duringLine4));
  await page.keyboard.press('Escape');
  await sleep(400);
  const exit = page.getByRole('dialog', { name: 'Sair da música' });
  if (await exit.count()) await exit.getByRole('button', { name: 'Sair' }).click();

  // 10. responsive
  for (const width of [375, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
    await page.goto(`${BASE}/musica/${SONG_ID}/sincronizar`);
    await page.getByRole('list', { name: 'Linhas da letra' }).waitFor({ timeout: 60000 });
    await sleep(700);
    const overflow = await overflowOf(page);
    check(`${width}px: sem rolagem horizontal`, overflow <= 0, `overflow=${overflow}`);
    const small = await page.getByRole('button').evaluateAll((list) => list.filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim()).slice(0, 3));
    check(`${width}px: botões com altura de toque (≥ 40 px)`, small.length === 0, small.join(','));
    const sized = await canvasBox();
    check(`${width}px: a linha do tempo cabe na tela`, sized.x >= 0 && sized.x + sized.width <= width + 1, `${Math.round(sized.width)}px`);
    const rowInside = await page.getByLabel('Texto da linha 1', { exact: true }).boundingBox();
    check(`${width}px: o campo de texto da linha cabe na tela`, rowInside.x >= 0 && rowInside.x + rowInside.width <= width + 1, `${Math.round(rowInside.width)}px`);
    await page.screenshot({ path: `${SHOTS}/editor-${width}.png`, fullPage: true });
  }

  const filtered = consoleErrors.filter((text) => !/favicon|ERR_BLOCKED|Not implemented|404 (Not Found)/i.test(text));
  check('nenhum erro no console', filtered.length === 0, filtered.slice(0, 3).join(' | '));
} catch (error) {
  console.error('ERRO NO ROTEIRO:', error.message);
  results.push(false);
  await page.screenshot({ path: `${SHOTS}/erro.png`, fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

const finalSong = await api(`/songs/${SONG_ID}`);
console.log(`\nestado final da música: fonte ${finalSong.lyricsSource}, atraso ${finalSong.lyricsOffsetMs} ms`);
console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(results.every(Boolean) ? 0 : 1);
