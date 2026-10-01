# 01 — Arquitetura

## 1.1 Visão geral

```
                        Rede local da casa (Wi-Fi)
┌──────────────────────────────────────────────────────────────────────┐
│  PC da casa                                                          │
│                                                                      │
│  ┌────────────────┐   HTTP/WS    ┌─────────────────────────────┐     │
│  │ Navegador      │◄────────────►│ BACKEND (Node/Fastify)      │     │
│  │ PALCO (TV/PC)  │              │  - API REST /api/*          │     │
│  │ localhost      │              │  - Socket.IO                │     │
│  │ + microfone    │              │  - arquivos /media/*        │     │
│  └────────────────┘              │  - monitor storage/upload   │     │
│                                  └──────┬───────────┬──────────┘     │
│                                         │ Prisma    │ HTTP (token)   │
│                                  ┌──────▼─────┐ ┌───▼────────────┐   │
│                                  │ MariaDB    │ │ WORKER Python  │   │
│                                  │ (XAMPP)    │ │ yt-dlp, Demucs │   │
│                                  │ db caraoke │ │ stable-ts,     │   │
│                                  └────────────┘ │ parselmouth    │   │
│                                                 └───┬────────────┘   │
│                         storage/  ◄─────────────────┘ (lê/escreve)   │
└──────────────────────────────────────────────────────────────────────┘
        ▲ HTTP/WS (com código de acesso)
┌───────┴────────┐
│ Celulares      │  buscar no YouTube, importar, enviar arquivo, fila, votar
└────────────────┘
```

### Componentes

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| **frontend** | React 19, Vite, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query, Zustand, socket.io-client | Telas do palco e do celular |
| **backend** | Node 24, Fastify 5, TypeScript, Prisma 6, Socket.IO 4, Zod, chokidar | Regras de negócio, API, tempo real, fila de jobs, arquivos |
| **shared** | TypeScript puro | Tipos, schemas Zod, constantes (avatares, temas, eventos), parser de LRC, parser de títulos |
| **worker** | Python 3.11, yt-dlp, Demucs 4, torch 2.5.1, stable-ts, praat-parselmouth, mutagen, requests | Processamento pesado de áudio e IA |
| **banco** | MariaDB 10.4 (XAMPP) | Persistência |
| **storage** | Sistema de arquivos | Áudios, letras, capas, melodias |

### Princípios
- **O back-end é o único que acessa o banco.** O worker conversa com o back-end por HTTP (`/api/internal/*`, com token).
- **Tudo que demora é assíncrono** (job na fila), e o progresso é transmitido em tempo real por Socket.IO.
- **O palco roda em `localhost`** no próprio PC, pois o navegador só libera o microfone em contexto seguro (`localhost` conta como seguro).
- **Perfis sem senha** (ADR-003); a autenticação de verdade fica para a fase de publicação.

## 1.2 Fluxo de uma música (ponta a ponta)

```
1. ORIGEM
   a) YouTube: usuário busca → backend roda `yt-dlp ytsearch` → resultados com miniatura
      → prévia no player embutido do YouTube → "Importar" (confirma artista/título)
      → POST /api/youtube/import → cria Song(status=QUEUED, source=YOUTUBE) + Job(PENDING)
   b) Upload: arquivo entra em storage/entrada/upload/ (copiado à mão OU via POST /api/uploads)
      → watcher (chokidar) detecta → lê metadados → cria Song(source=UPLOAD) + Job(PENDING, sourcePath)

2. FILA
   Job PENDING ordenado por `position`. O worker chama POST /api/internal/jobs/claim a cada 3 s.
   O backend entrega o primeiro PENDING e marca RUNNING (Song.status=PROCESSING).

3. WORKER (etapas, reportando progresso)
   DOWNLOAD  (só YouTube)  yt-dlp → storage/entrada/youtube/<songId>.<ext>
   SEPARATE  Demucs --two-stems vocals → storage/biblioteca/<songId>/instrumental.mp3 + voz.mp3
   LYRICS    LRCLIB → letra sincronizada; (Fase 6) alinhamento/transcrição com stable-ts
   COVER     miniatura do YouTube / capa embutida / iTunes Search API
   MELODY    (Fase 7) parselmouth na voz → melodia.json
   FINALIZE  POST /api/internal/jobs/:id/complete → apaga a origem

4. PRONTA
   Backend: Song.status=READY, emite `song:updated`. A música aparece nas fileiras do Início.

5. CANTAR
   Player baixa instrumental + voz + letra.json (+ melodia.json) → toca sincronizado
   → microfone mede a afinação → fim → celulares votam 20 s → nota final → histórico/ranking.
```

## 1.3 Estrutura do repositório (alvo)

```
caraoke-michael/
├── CLAUDE.md
├── README.md
├── package.json              # workspaces: frontend, backend, shared; scripts dev/test/lint
├── .env.example              # copiado para .env (lido pelo backend e pelo worker)
├── .gitignore
├── .claude/                  # config do Claude Code
├── docs/                     # roadmap, specs, memória, documento técnico
├── vault/                    # base de conhecimento (Obsidian)
├── shared/
│   ├── package.json          # name: "@caraoke/shared", main: "src/index.ts"
│   └── src/
│       ├── index.ts          # reexporta tudo
│       ├── types.ts          # tipos de domínio (DTOs)
│       ├── schemas.ts        # schemas Zod de request/response
│       ├── events.ts         # nomes e payloads dos eventos Socket.IO
│       ├── avatars.ts        # galeria de avatares
│       ├── themes.ts         # ids e nomes dos temas
│       ├── lyrics.ts         # tipo LyricsDoc, parseLrc, toLrc
│       └── titleParser.ts    # limpa títulos do YouTube → {artist, title}
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── server.ts         # bootstrap
│       ├── app.ts            # cria a instância Fastify (testável)
│       ├── env.ts            # lê e valida o .env com Zod
│       ├── db.ts             # PrismaClient singleton
│       ├── realtime.ts       # Socket.IO + helpers emit
│       ├── plugins/
│       │   ├── access.ts     # controle de acesso (localhost x celular)
│       │   └── errors.ts     # handler de erros padronizado
│       ├── modules/          # um diretório por domínio
│       │   ├── profiles/     # routes.ts, service.ts
│       │   ├── songs/
│       │   ├── youtube/
│       │   ├── uploads/
│       │   ├── jobs/         # inclui rotas internas do worker
│       │   ├── playlists/
│       │   ├── favorites/
│       │   ├── performances/ # histórico, pontuação, votos
│       │   ├── ranking/
│       │   ├── settings/
│       │   └── system/       # info, rede, código de acesso, heartbeat do worker
│       ├── services/
│       │   ├── storage.ts    # caminhos de pastas, criação, limpeza
│       │   ├── watcher.ts    # chokidar na pasta de upload
│       │   └── ytdlp.ts      # busca via yt-dlp CLI
│       └── utils/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx           # rotas
│       ├── styles/           # index.css (Tailwind + temas)
│       ├── api/              # client fetch + hooks TanStack Query
│       ├── realtime/         # socket.io-client + hooks
│       ├── stores/           # Zustand (perfil atual, player, tema)
│       ├── components/       # componentes reutilizáveis
│       ├── features/         # telas agrupadas por domínio
│       │   ├── profiles/  home/  library/  youtube/  processing/
│       │   ├── player/    playlists/  history/  ranking/  settings/
│       │   └── mobile/       # páginas do celular
│       └── lib/              # áudio, pitch, utilitários
├── worker/
│   ├── requirements.txt
│   ├── README.md
│   └── caraoke_worker/
│       ├── __main__.py       # loop principal
│       ├── config.py         # .env + settings vindas da API
│       ├── api.py            # cliente HTTP do backend
│       ├── device.py         # detecção GPU/CPU
│       ├── titles.py         # limpeza de título (espelha shared/titleParser)
│       └── steps/
│           ├── download.py
│           ├── separate.py
│           ├── lyrics.py
│           ├── align.py      # Fase 6
│           ├── cover.py
│           └── melody.py     # Fase 7
└── storage/                  # NÃO versionado; criado em runtime
    ├── entrada/youtube/
    ├── entrada/upload/
    ├── biblioteca/<songId>/
    ├── erro/
    └── tmp/
```

## 1.4 Decisões relacionadas
- ADR-001 React + Node · ADR-002 MySQL · ADR-003 Perfis · ADR-004 Processamento assíncrono
- ADR-005 Stack detalhada · ADR-006 Pontuação
