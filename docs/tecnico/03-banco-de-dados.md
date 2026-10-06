# 03 — Banco de dados

- **SGBD:** MariaDB 10.4 (XAMPP) · **ORM:** Prisma **6.x** (fixar `prisma@^6` e `@prisma/client@^6`; não usar a 7 sem um novo ADR)
- **Nomes:** modelos e campos em inglês (camelCase no Prisma, `@@map` para tabelas em snake_case plural).
- **IDs:** `String @id @default(cuid())`, exceto `Setting` (chave textual).
- **Datas:** sempre `DateTime` em UTC.

## 3.1 Diagrama

```
Profile 1───* Playlist 1───* PlaylistItem *───1 Song
Profile 1───* Favorite *───1 Song
Profile 1───* Performance *───1 Song
Performance 1───* Vote
Profile 1───* SingRequest *───1 Song   (fila de cantores, ADR-008)
Competition 1───* CompetitionParticipant *───1 Profile   (disputas, ADR-010)
Competition 1───* CompetitionSong (pessoa + música) · Competition 1───* SingRequest / Performance (competitionId)
Song 1───* Job
Profile 1───* Song (addedBy, opcional)
Setting (chave/valor)
```

## 3.2 Schema Prisma completo (`backend/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────── PERFIS ───────────────────────────────

model Profile {
  id          String   @id @default(cuid())
  name        String   @db.VarChar(40)
  avatar      String   @db.VarChar(40)          // id da galeria (shared/avatars.ts), ex.: "mic-red"
  theme       String   @default("cinema") @db.VarChar(20) // id do tema (shared/themes.ts)
  isGuest     Boolean  @default(false)          // convidado temporário
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime @default(now())

  playlists    Playlist[]
  favorites    Favorite[]
  performances Performance[]
  songsAdded   Song[]       @relation("SongAddedBy")
  singRequests SingRequest[]

  @@map("profiles")
}

// ─────────────────────────────── MÚSICAS ──────────────────────────────

enum SongSource {
  YOUTUBE
  UPLOAD
}

enum SongStatus {
  QUEUED       // aguardando na fila
  PROCESSING   // worker trabalhando
  READY        // pronta para cantar
  ERROR        // falhou (ver último Job)
}

enum LyricsSource {
  NONE         // não encontrada
  LRCLIB       // sincronizada vinda do LRCLIB
  PLAIN        // só texto, sem tempos (antes da Fase 6)
  ALIGNED      // texto alinhado por IA (stable-ts) — palavra a palavra
  TRANSCRIBED  // transcrita por IA (pode ter erros)
  MANUAL       // editada à mão no editor
}

model Song {
  id               String       @id @default(cuid())
  title            String       @db.VarChar(200)
  artist           String       @db.VarChar(200)
  durationSec      Int?                                    // preenchido no complete
  source           SongSource
  youtubeId        String?      @unique @db.VarChar(20)    // evita importar o mesmo vídeo 2x
  originalFilename String?      @db.VarChar(255)           // uploads
  status           SongStatus   @default(QUEUED)

  // arquivos relativos a STORAGE_DIR/biblioteca/<id>/ (null = não existe)
  hasInstrumental  Boolean      @default(false)            // instrumental.mp3
  hasVocals        Boolean      @default(false)            // voz.mp3
  hasCover         Boolean      @default(false)            // capa.jpg
  hasMelody        Boolean      @default(false)            // melodia.json

  lyricsSource     LyricsSource @default(NONE)             // letra.json existe se != NONE
  lyricsNeedsReview Boolean     @default(false)
  lyricsOffsetMs   Int          @default(0)                // ajuste fino (+ atrasa a letra)
  fillPercent      Int          @default(100)              // tempo de preenchimento da letra: 100 = até o fim da linha (20..150)
  keyShift         Int          @default(0)                // tom escolhido no player, em semitons (−6..+6, ADR-012)

  playCount        Int          @default(0)
  addedById        String?
  addedBy          Profile?     @relation("SongAddedBy", fields: [addedById], references: [id], onDelete: SetNull)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  jobs           Job[]
  playlistItems  PlaylistItem[]
  favorites      Favorite[]
  performances   Performance[]
  singRequests   SingRequest[]

  @@index([status])
  @@index([artist])
  @@fulltext([title, artist])   // busca local
  @@map("songs")
}

// ─────────────────────────────── FILA ─────────────────────────────────

enum JobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
  CANCELED
}

enum JobStep {
  DOWNLOAD
  SEPARATE
  LYRICS
  COVER
  MELODY
  FINALIZE
}

model Job {
  id          String     @id @default(cuid())
  songId      String
  song        Song       @relation(fields: [songId], references: [id], onDelete: Cascade)
  status      JobStatus  @default(PENDING)
  step        JobStep?
  progress    Int        @default(0)           // 0..100 da etapa atual
  message     String?    @db.VarChar(255)      // texto amigável da etapa
  position    Int                               // ordem na fila (menor = primeiro)
  sourcePath  String?    @db.VarChar(500)      // caminho do arquivo de origem (upload/youtube)
  device      String?    @db.VarChar(40)       // "cpu" | "cuda:GeForce GT 1030"
  error       String?    @db.Text
  attempts    Int        @default(0)
  createdAt   DateTime   @default(now())
  startedAt   DateTime?
  finishedAt  DateTime?

  @@index([status, position])
  @@map("jobs")
}

// ─────────────────────────────── PLAYLISTS ────────────────────────────

model Playlist {
  id        String         @id @default(cuid())
  profileId String
  profile   Profile        @relation(fields: [profileId], references: [id], onDelete: Cascade)
  name      String         @db.VarChar(80)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  items     PlaylistItem[]

  @@map("playlists")
}

model PlaylistItem {
  playlistId String
  playlist   Playlist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  songId     String
  song       Song     @relation(fields: [songId], references: [id], onDelete: Cascade)
  position   Int
  addedAt    DateTime @default(now())

  @@id([playlistId, songId])     // uma música aparece no máximo 1x por playlist
  @@index([playlistId, position])
  @@map("playlist_items")
}

model Favorite {
  profileId String
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  songId    String
  song      Song     @relation(fields: [songId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([profileId, songId])
  @@map("favorites")
}

// ─────────────────────────── HISTÓRICO / PONTUAÇÃO ─────────────────────

model Performance {
  id             String    @id @default(cuid())
  profileId      String
  profile        Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  songId         String
  song           Song      @relation(fields: [songId], references: [id], onDelete: Cascade)
  startedAt      DateTime  @default(now())
  finishedAt     DateTime?
  completed      Boolean   @default(false)   // cantou até o fim (≥ 90% da duração)
  voiceGuideUsed Boolean   @default(false)
  pitchScore     Int?                        // 0..100 (null = sem microfone)
  audienceScore  Int?                        // 0..100 (null = sem votos)
  finalScore     Int?                        // 0..100
  votes          Vote[]

  @@index([profileId, startedAt])
  @@index([songId])
  @@map("performances")
}

model Vote {
  id            String      @id @default(cuid())
  performanceId String
  performance   Performance @relation(fields: [performanceId], references: [id], onDelete: Cascade)
  voterToken    String      @db.VarChar(64)  // id anônimo do celular (localStorage)
  stars         Int                          // 1..5
  createdAt     DateTime    @default(now())

  @@unique([performanceId, voterToken])      // 1 voto por celular por apresentação
  @@map("votes")
}

// ─────────────────────────── FILA DE CANTORES ─────────────────────────

model SingRequest {                          // pedido "quero cantar" (ADR-008)
  id        String   @id @default(cuid())
  profileId String
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  songId    String
  song      Song     @relation(fields: [songId], references: [id], onDelete: Cascade)
  position  Int
  createdAt DateTime @default(now())

  @@unique([profileId, songId])              // a mesma pessoa não pede a mesma música duas vezes
  @@index([position])
  @@map("sing_requests")
}

// ─────────────────────────────── CONFIG ───────────────────────────────

model Setting {
  key       String   @id @db.VarChar(60)
  value     Json
  updatedAt DateTime @updatedAt

  @@map("settings")
}
```

> **Observação sobre `@@fulltext`:** o Prisma precisa de `previewFeatures = ["fullTextIndex"]` no generator para o MySQL. Se der problema no MariaDB, **remova** o `@@fulltext` e faça a busca com `contains` (com 1000 músicas o desempenho é suficiente). Registre a escolha no log.

## 3.3 Settings (chaves e padrões)

Guardadas na tabela `settings`. O backend expõe um objeto tipado (`shared/types.ts → AppSettings`) e mescla com os padrões abaixo.

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `processing.device` | `"auto" \| "gpu" \| "cpu"` | `"auto"` | Dispositivo do Demucs/Whisper |
| `processing.demucsModel` | `"htdemucs" \| "htdemucs_ft"` | `"htdemucs"` | `_ft` = melhor qualidade, ~4× mais lento |
| `processing.whisperModel` | `"base" \| "small" \| "medium"` | `"small"` | Para alinhar/transcrever (Fase 6) |
| `processing.autoAlign` | boolean | `true` | Alinhar letra com IA quando o LRCLIB não tiver sincronizada |
| `scoring.mode` | `"pitch+audience" \| "pitch" \| "audience" \| "off"` | `"pitch+audience"` | ADR-006 |
| `scoring.audienceWeight` | number 0..1 | `0.2` | Peso da plateia no modo misto |
| `scoring.voteSeconds` | number | `20` | Duração da votação |
| `scoring.micLatencyMs` | number | `150` | Compensação de latência do microfone |
| `scoring.micDeviceId` | string \| null | `null` | `deviceId` do microfone no navegador do palco |
| `ui.defaultTheme` | string | `"cinema"` | Tema da tela de perfis |
| `player.lyricsEffectEnabled` | boolean | `true` | Efeito que pinta a letra enquanto se canta; desligado, a linha inteira fica colorida ao começar |
| `player.lyricsEffect` | `"smooth" \| "words"` | `"smooth"` | Modelo do efeito (`smooth` = preenche aos poucos; `words` = palavra por palavra). Novos modelos entram em `shared/src/lyricsEffects.ts` e `frontend/src/lib/lyrics/effects.ts` |
| `access.code` | string | gerado (6 chars A-Z0-9, sem 0/O/1/I) | Código do QR code |

Settings da fila (ADR-009): `queue.maxRequestsPerPerson` (0–10, 0 = sem limite, padrão 3), `queue.stageBypassesLimit` (padrão `true`), `queue.shuffle` (padrão `false`), `queue.autoAdvanceSeconds` (0–60, 0 = desligado, padrão 15).

**Disputas (ADR-010):** tabelas `competitions` (nome, `imageExt`, status DRAFT/RUNNING/FINISHED, regras), `competition_participants` (ordem) e `competition_songs` (músicas escolhidas por pessoa). `sing_requests.competitionId` (cascata) e `performances.competitionId` (SetNull). O único de `sing_requests` passou a ser `(profileId, songId, competitionId)`, para a mesma música poder estar na fila normal e na disputa.

## 3.4 Regras de negócio no banco
- **Posição na fila:** novo job recebe `position = max(position) + 1` entre os jobs PENDING/RUNNING (ou 1).
- **Reordenar:** recebe a lista ordenada de ids PENDING e regrava `position = índice + 1` numa transação.
- **Claim atômico:** numa transação, `findFirst({ where: {status: PENDING}, orderBy: {position: 'asc'} })` e depois `updateMany({ where: {id, status: PENDING}, data: {status: RUNNING, startedAt, attempts: {increment: 1}} })`. Se `count === 0`, outro worker pegou: tente de novo.
- **Recuperação ao iniciar o backend:** jobs `RUNNING` voltam para `PENDING` (o worker caiu), e as músicas correspondentes para `QUEUED`.
- **Excluir música:** apaga a pasta `biblioteca/<id>/` (cascata no banco). Se houver job RUNNING, cancela primeiro.
- **playCount:** incrementado em `POST /performances`.
- **Duplicidade YouTube:** `youtubeId` único. Ao importar de novo, retorna a música existente (HTTP 200 com `alreadyExists: true`).
- **Fila de cantores (ADR-008):** novo pedido recebe `position = max(position) + 1` (ou 1). Até `queue.maxRequestsPerPerson` pedidos por perfil (ADR-009). Reordenar regrava `position = índice + 1` numa transação. O pedido é **apagado** quando a apresentação começa (`POST /performances` com `requestId`, na mesma transação) ou quando é removido; não há histórico de pedidos (o histórico é a `Performance`).
- **Convidados:** `isGuest = true`. Criados no palco ou pelo celular (pelo celular, sempre `isGuest = true`). Aparecem na seção "Convidados" da tela de perfis, ordenados por `lastUsedAt desc`. Não são apagados automaticamente.

## 3.5 Seed (`backend/prisma/seed.ts`)
- Cria os settings padrão que não existirem (incluindo `access.code` aleatório).
- Cria 1 perfil inicial "Michael" (avatar `mic-red`, tema `cinema`) **somente se não houver nenhum perfil**.
- **Não** cria músicas falsas.
