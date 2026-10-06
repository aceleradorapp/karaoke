import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JobDTO } from '@caraoke/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createKaraokeServer } from './index.js';
import { KaraokeApi, type FetchLike } from './karaokeApi.js';

type Route = { status?: number; body?: unknown };

function fakeKaraoke(routes: Record<string, Route | ((body: unknown) => Route)>) {
  const calls: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];
  const fetcher: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    const path = url.replace('http://karaoke:3333', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, auth: new Headers(init?.headers).get('authorization') });
    const handler = routes[`${method} ${path}`];
    const route = typeof handler === 'function' ? handler(body) : (handler ?? { status: 404, body: { error: { message: 'Rota desconhecida' } } });
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status ?? 200 });
  };
  return { fetcher, calls };
}

let client: Client | null = null;

async function connect(fetcher: FetchLike) {
  const server = createKaraokeServer(new KaraokeApi('http://karaoke:3333/', 'ck_teste', fetcher));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function call(tool: string, args: Record<string, unknown> = {}) {
  const result = await client!.callTool({ name: tool, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  return { text: content.map((part) => part.text).join('\n'), isError: Boolean(result.isError) };
}

function job(overrides: Partial<JobDTO>): JobDTO {
  return {
    id: 'j1',
    songId: 's1',
    status: 'PENDING',
    step: null,
    progress: 0,
    message: null,
    position: 1,
    device: null,
    workerId: null,
    workerName: null,
    targetWorkerId: null,
    targetWorkerName: null,
    error: null,
    attempts: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    song: { title: 'Flores', artist: 'Titãs', coverUrl: null, durationSec: 208 },
    ...overrides,
  };
}

afterEach(async () => {
  await client?.close();
  client = null;
});

describe('karaoke MCP', () => {
  it('offers only the tools agreed with the family', async () => {
    const { fetcher } = fakeKaraoke({});
    const { tools } = await (await connect(fetcher)).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'buscar_na_biblioteca',
      'buscar_youtube',
      'cancelar_processamento',
      'fila_de_processamento',
      'importar_musicas',
      'reordenar_fila',
      'verificar_letra',
    ]);
  });

  it('searches YouTube telling what is in the library and what has lyrics', async () => {
    const { fetcher, calls } = fakeKaraoke({
      'GET /api/youtube/search?q=flores+karaoke&limit=10': {
        body: {
          items: [
            {
              youtubeId: 'abc12345678',
              title: 'Titãs - Flores (Karaokê)',
              channel: 'Karaokê BR',
              durationSec: 208,
              thumbnailUrl: '',
              suggested: { artist: 'Titãs', title: 'Flores' },
              existingSongId: 's1',
            },
            {
              youtubeId: 'def12345678',
              title: 'Flores - versão rara',
              channel: 'Fulano',
              durationSec: 300,
              thumbnailUrl: '',
              suggested: { artist: 'Fulano', title: 'Flores' },
              existingSongId: null,
            },
          ],
        },
      },
      'GET /api/lyrics/check?artist=Tit%C3%A3s&title=Flores&duration=208': { body: { status: 'SYNCED' } },
      'GET /api/lyrics/check?artist=Fulano&title=Flores&duration=300': { body: { status: 'NONE' } },
    });
    await connect(fetcher);

    const { text, isError } = await call('buscar_youtube', { termo: 'flores karaoke' });

    expect(isError).toBe(false);
    expect(text).toContain('1. Titãs - Flores (Karaokê) (3:28)');
    expect(text).toContain('letra: sincronizada · JÁ ESTÁ NA BIBLIOTECA · youtube_id abc12345678');
    expect(text).toContain('letra: não encontrada · não está na biblioteca · youtube_id def12345678');
    expect(calls.every((request) => request.auth === 'Bearer ck_teste')).toBe(true);
  });

  it('imports several songs and tells which ones already existed', async () => {
    const { fetcher, calls } = fakeKaraoke({
      'POST /api/youtube/import': (body) => ({
        status: 201,
        body: { song: {}, alreadyExists: (body as { youtubeId: string }).youtubeId === 'abc12345678' },
      }),
    });
    await connect(fetcher);

    const { text } = await call('importar_musicas', {
      musicas: [
        { youtube_id: 'abc12345678', artista: 'Titãs', titulo: 'Flores', duracao_seg: 208 },
        { youtube_id: 'def12345678', artista: 'Legião Urbana', titulo: 'Tempo Perdido' },
      ],
    });

    expect(text).toContain('• Flores — Titãs: já estava na biblioteca');
    expect(text).toContain('• Tempo Perdido — Legião Urbana: entrou na fila');
    expect(calls.map((request) => request.body)).toEqual([
      { youtubeId: 'abc12345678', artist: 'Titãs', title: 'Flores', durationSec: 208 },
      { youtubeId: 'def12345678', artist: 'Legião Urbana', title: 'Tempo Perdido' },
    ]);
  });

  it('sends the songs to the machine asked for, by its name', async () => {
    const machines = {
      body: {
        items: [
          { id: 'local', name: 'Este PC', isLocal: true, online: true, device: 'cpu', gpuName: null, lastSeenAt: null, currentSongTitle: null },
          { id: 'w1', name: 'Notebook GPU', isLocal: false, online: true, device: 'cuda', gpuName: 'RTX', lastSeenAt: null, currentSongTitle: null },
        ],
      },
    };
    const { fetcher, calls } = fakeKaraoke({
      'GET /api/workers': machines,
      'POST /api/youtube/import': { status: 201, body: { song: {}, alreadyExists: false } },
    });
    await connect(fetcher);

    await call('importar_musicas', {
      musicas: [{ youtube_id: 'abc12345678', artista: 'Titãs', titulo: 'Flores' }],
      maquina: 'notebook gpu',
    });
    expect(calls.find((request) => request.method === 'POST')?.body).toMatchObject({ targetWorkerId: 'w1' });

    const unknown = await call('importar_musicas', {
      musicas: [{ youtube_id: 'abc12345678', artista: 'Titãs', titulo: 'Flores' }],
      maquina: 'PC da cozinha',
    });
    expect(unknown.text).toBe('Não achei a máquina "PC da cozinha". Máquinas: Este PC (ligada), Notebook GPU (ligada).');
  });

  it('shows the processing queue with the estimated times', async () => {
    const running = job({
      id: 'j1',
      status: 'RUNNING',
      message: 'Separando voz… 40%',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      song: { title: 'Evidências', artist: 'Chitãozinho & Xororó', coverUrl: null, durationSec: 300 },
    });
    const waiting = job({ id: 'j2', position: 2 });
    const failed = job({ id: 'j3', status: 'FAILED', error: 'Vídeo indisponível' });
    const { fetcher } = fakeKaraoke({
      'GET /api/jobs?scope=active': { body: { items: [running, waiting] } },
      'GET /api/jobs?scope=recent': { body: { items: [failed] } },
      'GET /api/jobs/estimate': { body: { secondsPerSongSecond: 1, basedOnJobs: 5, unknownDurationSec: 240 } },
    });
    await connect(fetcher);

    const { text } = await call('fila_de_processamento');

    expect(text).toContain('Fila (tudo pronto em ~7 min, estimativa):');
    expect(text).toContain('Evidências — Chitãozinho & Xororó · Separando voz… 40% · faltam ~4 min · job_id j1');
    expect(text).toContain('Flores — Titãs · aguardando · começa em ~4 min · pronta em ~7 min · job_id j2');
    expect(text).toContain('falhou: Vídeo indisponível');
  });

  it('lists the most sung songs of the library', async () => {
    const { fetcher } = fakeKaraoke({
      'GET /api/songs?sort=popular&limit=5': {
        body: {
          items: [{ title: 'Evidências', artist: 'C&X', status: 'READY', lyricsSource: 'ALIGNED', playCount: 12, youtubeId: null }],
          nextCursor: null,
        },
      },
    });
    await connect(fetcher);

    const { text } = await call('buscar_na_biblioteca', { ordem: 'mais_cantadas', limite: 5 });

    expect(text).toBe('1. Evidências — C&X · pronta para cantar · letra: sincronizada · cantada 12 vezes');
  });

  it('cancels and reorders the processing queue', async () => {
    const { fetcher, calls } = fakeKaraoke({
      'POST /api/jobs/j2/cancel': { status: 204 },
      'PATCH /api/jobs/reorder': { body: { ids: ['j3', 'j2'] } },
      'GET /api/jobs?scope=active': {
        body: { items: [job({ id: 'j2' }), job({ id: 'j3', song: { title: 'Azul', artist: 'Djavan', coverUrl: null, durationSec: 200 } })] },
      },
    });
    await connect(fetcher);

    expect((await call('cancelar_processamento', { job_id: 'j2' })).text).toBe('Processamento j2 cancelado.');
    expect((await call('reordenar_fila', { job_ids: ['j3'] })).text).toBe('Nova ordem da fila:\n1. Azul\n2. Flores');
    expect(calls.find((request) => request.method === 'PATCH')?.body).toEqual({ ids: ['j3'] });
  });

  it('explains when the key is wrong or the karaoke is off', async () => {
    const denial = { status: 401, body: { error: { message: 'Chave para IA inválida.' } } };
    const { fetcher } = fakeKaraoke({
      'GET /api/jobs?scope=active': denial,
      'GET /api/jobs?scope=recent': denial,
      'GET /api/jobs/estimate': denial,
    });
    await connect(fetcher);
    const denied = await call('fila_de_processamento');
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain('Confira a CARAOKE_KEY');

    await client!.close();
    await connect(async () => {
      throw new TypeError('fetch failed');
    });
    const offline = await call('verificar_letra', { artista: 'Titãs', titulo: 'Flores' });
    expect(offline.text).toContain('Não consegui falar com o karaokê em http://karaoke:3333');
  });
});
