# 04 — Back-end (Node + Fastify)

## 4.1 Dependências

```
dependencies:
  fastify@^5  @fastify/cors  @fastify/static  @fastify/multipart
  fastify-type-provider-zod  zod
  socket.io@^4
  @prisma/client@^6
  chokidar@^4  music-metadata  dotenv
devDependencies:
  prisma@^6  typescript  tsx  vitest  @types/node
```
O workspace `@caraoke/shared` é importado direto do TypeScript (`"@caraoke/shared": "*"`).

## 4.2 Bootstrap (`server.ts` / `app.ts`)

Ordem em `buildApp()`:
1. `Fastify({ logger: true, trustProxy: '127.0.0.1', bodyLimit: 1_000_000 })`
   - `trustProxy: '127.0.0.1'`: o proxy do Vite (dev) envia `X-Forwarded-For`, e o `request.ip` passa a ser o IP real do celular. **Necessário para o controle de acesso.**
2. `setValidatorCompiler` / `setSerializerCompiler` do `fastify-type-provider-zod`.
3. `@fastify/cors` com `origin: true` (rede local).
4. `@fastify/multipart` com `limits: { fileSize: 60 * 1024 * 1024, files: 10 }`.
5. Plugin `errors` (formato padrão de erro, ver 4.4).
6. Plugin `access` (ver 4.5).
7. `@fastify/static` em `STORAGE_DIR/biblioteca`, com prefixo `/media/`.
8. Rotas de cada módulo com prefixo `/api`.
9. Em produção local: `@fastify/static` servindo `frontend/dist` com fallback SPA (`index.html` para rotas que não sejam `/api`, `/media` ou `/socket.io`).

Em `server.ts`:
1. `storage.ensureDirs()` cria todas as pastas.
2. Recuperação de jobs (03 §3.4).
3. Garante os settings padrão.
4. `app.listen({ host: API_HOST, port: API_PORT })`.
5. Anexa o Socket.IO ao `app.server` (ver 4.7).
6. Inicia o watcher (4.8).

## 4.3 Padrão de módulo
```
modules/<dominio>/
  routes.ts    // registra rotas com schemas Zod (params, querystring, body, response)
  service.ts   // lógica + Prisma; sem conhecer Fastify
  service.test.ts (quando houver lógica relevante)
```
- Os **schemas Zod ficam em `shared/src/schemas.ts`** quando o frontend também os usa.
- Os services emitem eventos de tempo real via `realtime.emit*()`; as rotas nunca chamam o Socket.IO diretamente.

## 4.4 Erros
Formato único de resposta de erro:
```json
{ "error": { "code": "SONG_NOT_FOUND", "message": "Música não encontrada" } }
```
- Classe `AppError(code, message, statusCode)` em `utils/errors.ts`.
- Erro de validação Zod → 400 `VALIDATION_ERROR`, com `details`.
- Erro inesperado → 500 `INTERNAL_ERROR` (detalhes só no log).
- **Mensagens em português** (aparecem na UI).

## 4.5 Controle de acesso (`plugins/access.ts`)

Três tipos de cliente:

| Cliente | Como é identificado | Acesso |
|---|---|---|
| **Palco** | `request.ip` é loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) | Tudo, exceto `/api/internal/*` |
| **Worker** | Header `X-Worker-Token` igual a `WORKER_TOKEN` | Só `/api/internal/*` |
| **Celular** | IP não-loopback + header `X-Access-Code` igual ao setting `access.code` | Só a lista permitida abaixo |

Lista permitida para o celular (método + padrão):
```
GET    /api/health
GET    /api/system/access/check
GET    /api/youtube/search
POST   /api/youtube/import
POST   /api/uploads
GET    /api/jobs
GET    /api/songs              (biblioteca do celular e "já existe?")
GET    /api/profiles           ("Quem é você?")
POST   /api/profiles           (sempre cria convidado: isGuest=true, tema padrão)
GET    /api/sing-queue
POST   /api/sing-queue
DELETE /api/sing-queue/:id     (só os próprios pedidos: ?profileId= tem que ser o dono)
GET    /api/performances/voting/current
POST   /api/performances/:id/votes
```
- Rotas fora de `/api` (estáticos do front) são liberadas para todos; `/media/*` só para o palco.
- Falha → 401 `ACCESS_DENIED` ("Código de acesso inválido. Escaneie o QR code novamente.").
- `/api/internal/*` sem o token correto → 401, **mesmo do localhost**.

Esqueleto:
```ts
const MOBILE_ALLOWED: Array<[string, RegExp]> = [
  ['GET', /^\/api\/health$/],
  ['GET', /^\/api\/system\/access\/check$/],
  ['GET', /^\/api\/youtube\/search$/],
  ['POST', /^\/api\/youtube\/import$/],
  ['POST', /^\/api\/uploads$/],
  ['GET', /^\/api\/jobs$/],
  ['GET', /^\/api\/songs$/],
  ['GET', /^\/api\/profiles$/],
  ['POST', /^\/api\/profiles$/],
  ['GET', /^\/api\/sing-queue$/],
  ['POST', /^\/api\/sing-queue$/],
  ['DELETE', /^\/api\/sing-queue\/[^/]+$/],
  ['GET', /^\/api\/performances\/voting\/current$/],
  ['POST', /^\/api\/performances\/[^/]+\/votes$/],
];
const isLoopback = (ip: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

app.addHook('onRequest', async (req) => {
  const path = req.url.split('?')[0];
  if (path.startsWith('/api/internal/')) {
    if (req.headers['x-worker-token'] !== env.WORKER_TOKEN) throw new AppError('ACCESS_DENIED', 'Token inválido', 401);
    return;
  }
  if (!path.startsWith('/api/') && !path.startsWith('/media/')) return; // estáticos do front
  if (isLoopback(req.ip)) return;                                       // palco
  if (path.startsWith('/media/')) throw new AppError('ACCESS_DENIED', 'Acesso negado', 401);
  const code = req.headers['x-access-code'];
  const ok = code === (await settings.get('access.code'));
  const allowed = MOBILE_ALLOWED.some(([m, re]) => m === req.method && re.test(path));
  if (!ok || !allowed) throw new AppError('ACCESS_DENIED', 'Código de acesso inválido. Escaneie o QR code novamente.', 401);
  req.isMobile = true; // decorate
});
```
Teste obrigatório (vitest + `app.inject` com `remoteAddress`): palco passa; celular sem código → 401; celular com código em rota permitida passa; celular em rota não permitida → 401; internal sem token → 401.

## 4.6 Endpoints

Convenções: JSON; datas em ISO; listas retornam `{ items: [...] }`; paginação com `?limit=&cursor=` quando indicado. `SongDTO` inclui URLs prontas:
```ts
type SongDTO = {
  id, title, artist, durationSec, source, youtubeId, status,
  coverUrl: string | null,        // "/media/<id>/capa.jpg?v=<updatedAt>"
  instrumentalUrl: string | null, // "/media/<id>/instrumental.mp3"
  vocalsUrl: string | null,
  lyricsUrl: string | null,       // "/media/<id>/letra.json"
  melodyUrl: string | null,
  lyricsSource, lyricsNeedsReview, lyricsOffsetMs, fillPercent, playCount, createdAt,
  job?: JobDTO | null             // job ativo, se QUEUED/PROCESSING/ERROR
  isFavorite?: boolean            // quando a request traz ?profileId=
}
```

### Saúde e sistema
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | `{ ok: true, version }` |
| GET | `/api/system/info` | `{ worker: { online, lastSeen, device, cudaAvailable, gpuName, vramMb, ytdlpVersion }, storage: { usedBytes, songs } }` |
| GET | `/api/system/access` | `{ code, urls: ["http://192.168.98.10.nip.io:5173/m?c=ABC123", ..., "http://192.168.98.10:5173/m?c=ABC123"] }`: primeiro um endereço com nome (`<ip>.nip.io`, exigido pela prévia do YouTube) por IPv4 privado, depois os mesmos só por IP (ignore `172.*` de WSL/Hyper-V quando houver um `192.168.*`). Porta = a do front (em dev, `WEB_DEV_PORT`; em produção, `API_PORT`) |
| POST | `/api/system/access/regenerate` | Gera um novo código; emite `access:changed` para os celulares e **desconecta** os sockets deles (precisam do código novo) |
| GET | `/api/system/access/check` | Celular valida o código: `{ ok: true }` |
| POST | `/api/system/ytdlp/update` | Executa `pip install -U yt-dlp` no venv; retorna a versão |

### Perfis
| Método | Rota | Body / Query | Resposta |
|---|---|---|---|
| GET | `/api/profiles` | — | `{ items: Profile[] }` (família primeiro, por `createdAt`; depois convidados, por `lastUsedAt desc`) |
| POST | `/api/profiles` | `{ name, avatar, theme?, isGuest? }` | `Profile` (nome 1..40, avatar válido em `AVATARS`). Vindo do celular: `isGuest` forçado a `true` e `theme` ignorado (ADR-008) |
| PATCH | `/api/profiles/:id` | `{ name?, avatar?, theme? }` | `Profile` |
| POST | `/api/profiles/:id/touch` | — | atualiza `lastUsedAt` (ao selecionar o perfil) |
| DELETE | `/api/profiles/:id` | — | 204 (cascata em playlists/favoritos/histórico; pedir confirmação na UI) |

### Músicas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/songs?q=&status=&artist=&sort=recent\|title\|artist\|popular&limit=&cursor=&profileId=` | Lista/busca. `q` busca em título e artista (sem diferenciar maiúsculas/acentos) |
| GET | `/api/songs/home?profileId=` | Fileiras do Início (ver 06 §6.6): `{ hero: SongDTO \| null, rows: [{ id, title, items: SongDTO[] }] }` |
| GET | `/api/songs/:id?profileId=` | `SongDTO` |
| PATCH | `/api/songs/:id` | `{ title?, artist?, lyricsOffsetMs?, fillPercent? }` (`fillPercent` inteiro 20..150) |
| DELETE | `/api/songs/:id` | Apaga a música + arquivos |
| PUT | `/api/songs/:id/lyrics` | Body `LyricsDoc` → grava `letra.json`, `lyricsSource=MANUAL`, `lyricsNeedsReview=false` |
| POST | `/api/songs/:id/lyrics/search` | (Fase 6) Pede ao worker para buscar/alinhar de novo: cria um job só com LYRICS |
| POST | `/api/songs/:id/lyrics/align` | (Fase 6) Body `{ text }`: texto colado pelo usuário; cria um job de alinhamento |
| POST | `/api/songs/:id/reprocess` | Só para `source=YOUTUBE` (a origem é baixada de novo): cria um job com todas as etapas. Upload → 409 `SOURCE_UNAVAILABLE` ("O arquivo original foi apagado; envie de novo") |

### YouTube
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/youtube/search?q=&limit=12` | Executa o yt-dlp (4.9). Resposta: `{ items: [{ youtubeId, title, channel, durationSec, thumbnailUrl, suggested: { artist, title }, existingSongId \| null }] }`. Cache em memória por 10 min, por `q` |
| POST | `/api/youtube/import` | `{ youtubeId, title, artist, profileId? }` → cria Song + Job. Se o `youtubeId` já existir: `{ song, alreadyExists: true }` |

Regras: rejeitar vídeos com mais de **12 min** (`VIDEO_TOO_LONG`). Título e artista obrigatórios (o usuário confirma no diálogo de importação).

### Uploads
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/uploads` | multipart, campo `files` (1..10). Extensões: `.mp3 .m4a .wav .flac .ogg .webm .opus .aac`. Salva em `entrada/upload/` com nome seguro (`<timestamp>-<nome-sanitizado>`). **Quem cria a Song/Job é o watcher** (único caminho). Resposta `201 { received: [{ filename }], rejected: [{ filename, reason }] }` (`reason`: `UNSUPPORTED_TYPE` ou `FILE_TOO_LARGE`); `400 UNSUPPORTED_FILE` se nenhum for aceito, `400 TOO_MANY_FILES` acima de 10. O arquivo é gravado como `.part` e só vira definitivo depois do sidecar. Campo opcional `profileId` |

> Para associar o `profileId` ao arquivo enviado pela página, grave um arquivo lateral `<nome>.meta.json` com `{ profileId, title?, artist? }`; o watcher lê e apaga. Arquivos copiados à mão não têm meta.

### Fila de cantores (ADR-008) — `modules/singQueue/`
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/sing-queue` | `{ items: SingRequestDTO[] }` em ordem de `position` |
| POST | `/api/sing-queue` | `{ profileId, songId }` → `201 SingRequestDTO`. 404 `PROFILE_NOT_FOUND`/`SONG_NOT_FOUND`; 409 `SONG_UNAVAILABLE` (música com erro); 409 `ALREADY_REQUESTED` (mesma pessoa e música); 409 `TOO_MANY_REQUESTS` ("Você já tem 3 músicas na fila") |
| PUT | `/api/sing-queue/order` | (palco) `{ ids }` → regrava as posições; ids desconhecidos são ignorados e os que faltarem vão para o fim, na ordem atual |
| DELETE | `/api/sing-queue/:id?profileId=` | 204. Do celular, `profileId` é obrigatório e precisa ser o dono (403 `NOT_YOUR_REQUEST`); o palco remove qualquer um |

```ts
type SingRequestDTO = {
  id: string; position: number; createdAt: string;
  profile: { id: string; name: string; avatar: string; isGuest: boolean };
  song: SongDTO;                     // status diz se está pronta (READY) ou "preparando"
}
```
Toda mudança (criar, remover, reordenar, apresentação começou, perfil ou música apagados) emite `singQueue:changed` com a fila inteira.

### Fila de processamento (jobs)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/jobs?scope=active\|recent` | `active` = PENDING + RUNNING (por position); `recent` = DONE/FAILED/CANCELED das últimas 48 h. Inclui título, artista e capa da música |
| PATCH | `/api/jobs/reorder` | `{ ids: string[] }` (só PENDING) |
| POST | `/api/jobs/:id/cancel` | PENDING → CANCELED na hora; RUNNING → marca `cancelRequested` (em memória) e o worker aborta na próxima chamada de progresso. Música → ERROR com mensagem "Cancelado" |
| POST | `/api/jobs/:id/retry` | FAILED/CANCELED → cria um job novo PENDING no fim da fila |
| DELETE | `/api/jobs/:id` | Remove um job finalizado da lista (só DONE/FAILED/CANCELED) |

### Interno (worker) — header `X-Worker-Token`
- `POST /api/internal/songs/:id/melody` → marca `hasMelody=true` e emite `song:updated` (usado por `npm run worker:melody`, Fase 7).
| Método | Rota | Body | Resposta |
|---|---|---|---|
| POST | `/api/internal/worker/heartbeat` | `{ instanceId, device, cudaAvailable, gpuName, vramMb, ytdlpVersion }` | `{ ok }`. Guarda em memória; `online` = último heartbeat há menos de 30 s. Se o `instanceId` mudar (worker reiniciou com o back-end no ar), os jobs RUNNING órfãos voltam para a fila antes de responder |
| GET | `/api/internal/settings` | — | `AppSettings` (o worker usa `processing.*`) |
| POST | `/api/internal/jobs/claim` | — | `204` se vazio, ou `{ job: { id, steps: JobStep[], sourcePath, song: { id, title, artist, source, youtubeId } }, paths: { storageDir, songDir, tmpDir } }` |
| PATCH | `/api/internal/jobs/:id/progress` | `{ step, progress, message, device? }` | `{ cancel: boolean }` |
| POST | `/api/internal/jobs/:id/complete` | `{ durationSec, hasInstrumental, hasVocals, hasCover, hasMelody, lyricsSource, lyricsNeedsReview }` | `{ ok }` → Song READY, Job DONE, apaga `sourcePath` |
| POST | `/api/internal/jobs/:id/fail` | `{ error, step }` | `{ ok }` → Job FAILED, Song ERROR, move `sourcePath` para `erro/` |

`steps` calculado pelo backend: YouTube = `[DOWNLOAD, SEPARATE, LYRICS, COVER, MELODY, FINALIZE]`; Upload = sem DOWNLOAD. O MELODY só é incluído a partir da Fase 7 (flag `FEATURE_MELODY` em `backend/src/features.ts`). Jobs de "só letra" = `[LYRICS, FINALIZE]`.

### Playlists
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/profiles/:profileId/playlists?songId=` | `{ items: [{ id, name, count, coverUrls: string[4], containsSong?: boolean }] }`; `containsSong` quando há `songId` (para o seletor de playlists) |
| POST | `/api/profiles/:profileId/playlists` | `{ name }` |
| GET | `/api/playlists/:id` | `{ id, name, profileId, items: SongDTO[] }` (por position) |
| PATCH | `/api/playlists/:id` | `{ name }` |
| DELETE | `/api/playlists/:id` | 204 |
| POST | `/api/playlists/:id/items` | `{ songId }` (no fim; ignora se já existir) |
| DELETE | `/api/playlists/:id/items/:songId` | 204 |
| PATCH | `/api/playlists/:id/items/reorder` | `{ songIds: string[] }` |

### Favoritos
| Método | Rota |
|---|---|
| GET | `/api/profiles/:profileId/favorites` → `{ items: SongDTO[] }` |
| PUT | `/api/profiles/:profileId/favorites/:songId` → 204 |
| DELETE | `/api/profiles/:profileId/favorites/:songId` → 204 |

### Apresentações (histórico, pontuação, votos)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/performances` | `{ profileId, songId, requestId? }` → cria, incrementa `playCount`, retorna `{ id }`. Com `requestId` (veio da fila de cantores), apaga o pedido na mesma transação e emite `singQueue:changed` |
| POST | `/api/performances/:id/finish` | `{ completed, voiceGuideUsed, pitchScore: number \| null }`. Se o modo usa plateia e `completed`: abre a votação (4.7) e responde `{ voting: { endsAt } }`; senão calcula `finalScore` na hora e responde `{ finalScore }` |
| GET | `/api/performances/voting/current` | Votação aberta: `{ performanceId, singer: {id, name, avatar}, song: {title, artist}, endsAt } \| null` |
| POST | `/api/performances/:id/voting/close` | (palco) Encerra a votação agora ("Encerrar votação"): calcula as notas, emite `score:final` e responde o `FinalScore`. 409 `VOTING_CLOSED` se não estiver aberta |
| POST | `/api/performances/:id/votes` | `{ voterToken, voterProfileId?, stars: 1..5 }`. 409 `VOTING_CLOSED` se encerrada; 409 `ALREADY_VOTED` em caso de duplicidade; 409 `CANNOT_VOTE_FOR_SELF` se `voterProfileId` é quem cantou (ADR-008). Resposta `{ votes }` (total até agora). `voterToken` com 8 a 64 caracteres |
| GET | `/api/profiles/:profileId/history?limit=&cursor=` | `{ items: [{ id, song: SongDTO, startedAt, finalScore, pitchScore, audienceScore, completed }] }` |

**Cálculo da nota final** (`performances/service.ts → computeFinalScore`), conforme o ADR-006:
```ts
function computeFinalScore(mode, pitch: number|null, audience: number|null, w: number): number|null {
  switch (mode) {
    case 'off': return null;
    case 'pitch': return pitch;
    case 'audience': return audience;
    case 'pitch+audience':
      if (pitch == null) return audience;
      if (audience == null) return pitch;
      return Math.round(pitch * (1 - w) + audience * w);
  }
}
// audienceScore = round(média(stars) / 5 * 100), ou null sem votos
```
Ao encerrar a votação (timer de `voteSeconds` no servidor, `setTimeout` por performance): grava `audienceScore` e `finalScore` e emite `score:final`. Testes unitários obrigatórios para `computeFinalScore`.

**Implementação (2026-10-02):** `performances/voting.ts`. Só uma votação aberta por vez, guardada em memória: se outra música termina com a votação ainda aberta, a anterior é encerrada antes. Música deixada no meio (`completed=false`) não abre votação nem ganha nota. Sem modo de plateia, a nota final sai na resposta do `finish`. Se o backend reiniciar com uma votação aberta, ela se perde e a apresentação fica sem nota (aceitável no uso em casa).

### Ranking
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/ranking?period=week\|month\|all&scope=all\|family` | `{ bestAverage: [{ profile, avg, count }], mostSung: [{ profile, count }], topSongs: [{ song, count }], champion: { profile, avg } \| null }`. Média só com `finalScore != null`; mínimo de 3 apresentações para entrar em `bestAverage`. `period`: `week` = últimos 7 dias, `month` = últimos 30 dias (padrão), `all`. `mostSung` e `topSongs` contam só músicas cantadas até o fim (`completed`). `champion` = melhor média do **mês do calendário** atual, qualquer que seja o período. `scope=family` exclui convidados. Listas com até 10 itens |

### Configurações
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/settings` | `AppSettings` (sem `access.code`; este sai em `/system/access`) |
| PATCH | `/api/settings` | Parcial, validado por Zod; emite `settings:updated` |

## 4.7 Tempo real (Socket.IO)

- Anexado a `app.server`, com path padrão `/socket.io`.
- **Handshake:** `auth: { client: 'stage' | 'mobile', code?: string }`. Clientes não-loopback precisam do `code` válido, senão `next(new Error('ACCESS_DENIED'))`, e entram sempre na sala `mobile` (mesmo dizendo `stage`). Em desenvolvimento o celular passa pelo proxy do Vite: o endereço real é o **último** do `X-Forwarded-For` (o que o proxy acrescentou), e só quando a conexão vem do próprio PC (`services/network.ts`).
- **Salas:** `stage` (palco) e `mobile` (celulares). Os eventos vão para as duas, salvo indicação contrária.
- Os nomes e tipos dos eventos ficam em `shared/src/events.ts` (fonte única).

| Evento (servidor → cliente) | Payload | Sala | Quando |
|---|---|---|---|
| `job:updated` | `JobDTO` (com resumo da música) | ambas | Criação, claim, progresso (máx. 1 a cada 500 ms por job), conclusão, falha, cancelamento |
| `jobs:reordered` | `{ ids: string[] }` | ambas | Reordenação |
| `song:updated` | `SongDTO` | ambas | Mudança de status ou de dados |
| `song:deleted` | `{ id }` | ambas | Exclusão |
| `vote:open` | `{ performanceId, singer, song, endsAt }` | ambas | Fim da música com plateia ativa |
| `vote:progress` | `{ performanceId, count }` | stage | A cada voto |
| `score:final` | `{ performanceId, pitchScore, audienceScore, finalScore, votes }` | ambas | Fim da votação |
| `settings:updated` | `AppSettings` | stage | Configurações mudaram |
| `singQueue:changed` | `{ items: SingRequestDTO[] }` | ambas | Qualquer mudança na fila de cantores (ADR-008) |
| `profiles:changed` | — | ambas | Perfil criado, editado ou apagado (o convidado criado no celular aparece na TV na hora) |
| `access:changed` | `{}` | mobile | Código regenerado (o celular mostra "escaneie de novo") |
| `worker:status` | `{ online, device, gpuName }` | stage | Worker ficou online/offline |

Nenhum evento é enviado do cliente para o servidor no MVP (tudo vai por REST).

## 4.8 Watcher da pasta de upload (`services/watcher.ts`)
```ts
chokidar.watch(uploadDir, {
  ignoreInitial: false,               // processa o que já estava lá ao iniciar
  depth: 0,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  ignored: (p) => p.endsWith('.meta.json') || p.endsWith('.part') || p.endsWith('.tmp'),
}).on('add', handleNewFile);
```
`handleNewFile(path)`:
1. Ignora extensões não suportadas (loga um aviso).
2. Se já existir um Job PENDING/RUNNING com esse `sourcePath`, ignora (evita duplicidade ao reiniciar).
3. Lê `<arquivo>.meta.json`, se existir.
4. Metadados: `music-metadata.parseFile` → `common.artist`, `common.title`, `format.duration`.
5. Fallback: `titleParser` no nome do arquivo ("Artista - Música.mp3"); se não houver " - ", artist = "Desconhecido".
6. Cria a Song (`source=UPLOAD`, `originalFilename`) + Job (`sourcePath` absoluto), emite os eventos.

## 4.9 Busca no YouTube (`services/ytdlp.ts`)
```
<YTDLP_PATH> "ytsearch{limit}:{q}" --flat-playlist --dump-single-json --no-warnings --skip-download
```
- `child_process.execFile` (sem shell), timeout de 25 s, `maxBuffer` de 10 MB.
- Mapear `entries[]`: `id`, `title`, `channel ?? uploader`, `duration`, e a thumbnail `https://i.ytimg.com/vi/<id>/hqdefault.jpg`.
- Descartar entradas sem `duration` (lives) ou com mais de 12 min.
- `suggested = parseYoutubeTitle(title, channel)` (shared).
- `existingSongId`: consulta em lote por `youtubeId`.
- Erro do yt-dlp → 502 `YOUTUBE_SEARCH_FAILED` ("Falha na busca do YouTube. Tente atualizar o yt-dlp nas configurações.").

## 4.10 Storage (`services/storage.ts`)
Funções: `ensureDirs()`, `songDir(id)`, `songFile(id, name)`, `uploadDir`, `youtubeDir`, `errorDir`, `tmpDir`, `deleteSongDir(id)`, `moveToError(path)`, `safeFilename(name)`, `diskUsage()`. **Nunca** monte caminhos com concatenação de strings: use `path.join` e valide que o resultado fica dentro de `STORAGE_DIR` (proteção contra path traversal).
