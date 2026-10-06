# Roadmap — caraoke-michael

> **Status:** ⬜ a fazer · 🟨 em andamento · ✅ concluído (com data) · ⏸️ pausado · ❌ descartado
> **Modelo sugerido:** 🟢 simples (Haiku/Sonnet) · 🟡 Sonnet · 🔴 Opus (lógica delicada, revise com cuidado)
> **Docs:** `T-04 §4.6` = [docs/tecnico/04-backend-api.md](../tecnico/04-backend-api.md), seção 4.6.

**Como trabalhar:** pegue a **primeira tarefa ⬜** da fase atual (respeitando as dependências), leia as seções indicadas, implemente, siga o checklist de [T-09 §9.5](../tecnico/09-convencoes.md) e marque aqui como ✅ com a data.

## Progresso geral
| Fase | Nome | Status |
|---|---|---|
| 0 | Fundação e ambiente | ✅ |
| 1 | Perfis, temas e base visual | ✅ |
| 2 | Importação e processamento | ✅ |
| 3 | Biblioteca e player | ✅ |
| 4 | Playlists, favoritas e histórico | ✅ |
| 5 | Celular e QR code | ✅ |
| 6 | Letras inteligentes | ✅ (feita antes da 5; só F6-02, transcrever músicas sem letra, ficou pausada) |
| 5B | Convidados no celular e fila de cantores (ADR-008) | ✅ |
| 7 | Pontuação e ranking | ✅ (sem teste com microfone real) |
| 7B | Fila v2 e letra no celular (ADR-009) | ✅ |
| 7C | Disputas (ADR-010) | ✅ |
| 8 | Publicação (futuro) | ⬜ |

---

## Fase 0 — Fundação e ambiente
**Objetivo:** monorepo rodando com `npm run dev` (api + web + worker conversando) e banco migrado.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F0-01 | ✅ 2026-10-01 | Estrutura de apoio: CLAUDE.md, .claude, roadmap, specs, memória, vault | — | — |
| F0-02 | ✅ 2026-10-01 | Visão, requisitos e decisões (ADR-001..006) | `docs/memory/` | — |
| F0-03 | ✅ 2026-10-01 | Documento técnico completo | `docs/tecnico/` | — |
| F0-04 | ✅ 2026-10-01 | Banco `caraoke` criado no MariaDB (XAMPP) e `git init` | T-02 §2.3 | — |
| F0-05 | ✅ 2026-10-01 (Python 3.11.9 + FFmpeg 9.0.2 instalados via winget) | Conferir Python 3.11 e FFmpeg instalados (`py -3.11 --version`, `ffmpeg -version`, em um terminal novo). Se faltar: `winget install --id Python.Python.3.11 --scope user` / `winget install --id Gyan.FFmpeg` | T-02 §2.2 | 🟢 |
| F0-06 | ✅ 2026-10-01 | Monorepo: `package.json` raiz com workspaces e scripts, `.env.example`, `.env` (gerar `WORKER_TOKEN` aleatório), Prettier, tsconfig base | T-01 §1.3, T-02 §2.4 §2.6 | 🟢 |
| F0-07 | ✅ 2026-10-01 | `shared/`: pacote `@caraoke/shared` com `avatars.ts`, `themes.ts`, `events.ts` (tipos), `types.ts` iniciais e `index.ts` | T-01 §1.3, T-06 §6.4 §6.5, T-04 §4.7 | 🟢 |
| F0-08 | ✅ 2026-10-01 | `backend/`: Fastify + env (Zod) + errors + `/api/health` + storage `ensureDirs` + Socket.IO anexado | T-04 §4.1–4.4 §4.10 | 🟡 |
| F0-09 | ✅ 2026-10-01 | Prisma: schema completo, `migrate dev` (nome `init`), seed (settings + perfil Michael) | T-03 inteiro | 🟡 |
| F0-10 | ✅ 2026-10-01 | `frontend/`: Vite + React + TS + Tailwind 4 + temas CSS + Router + Query + proxy; página de teste mostrando `/api/health` | T-06 §6.1 §6.4 | 🟡 |
| F0-11 | ✅ 2026-10-01 | `worker/`: venv (`scripts/setup-worker.ps1`), requirements, `config.py`, `api.py`, `device.py`, loop com heartbeat + claim (sem etapas ainda) | T-02 §2.7, T-05 §5.2–5.4 | 🟡 |
| F0-12 | ✅ 2026-10-01 | Rotas internas `heartbeat`/`settings`/`claim` + `GET /api/system/info`; o front mostra "Worker online • CPU/GPU" | T-04 §4.6 (Interno, Sistema) | 🟡 |
| F0-13 | ✅ 2026-10-01 | Plugin de controle de acesso + testes | T-04 §4.5 | 🔴 |
| F0-14 | ✅ 2026-10-01 | ✔ Verificação da fase: `npm run dev` sobe tudo; health ok; worker online; testes passam; commit inicial (se autorizado) | T-09 §9.5 | 🟢 |

## Fase 1 — Perfis, temas e base visual
**Objetivo:** a tela "Quem vai cantar?" funcionando, com perfis, avatares e temas.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F1-01 | ✅ 2026-10-01 | API de perfis (CRUD + touch) com testes | T-04 §4.6 Perfis | 🟢 |
| F1-02 | ✅ 2026-10-01 | Componentes base responsivos: `Avatar`, `Button`, `Modal` (tela cheia no celular), `Toast`, `Spinner`, `ProgressRing`, `SaveIndicator` + hook `useAutoSave` com testes | T-06 §6.4 §6.5 §6.9 §6.10 | 🟡 |
| F1-03 | ✅ 2026-10-01 | Tela `/perfis` (família + convidados) + modal de criar perfil/convidado | T-06 §6.6 Perfis | 🟡 |
| F1-04 | ✅ 2026-10-01 | `/perfis/gerenciar` (editar nome, avatar e tema; excluir com confirmação) | T-06 §6.6 | 🟢 |
| F1-05 | ✅ 2026-10-01 | `useProfileStore` + guarda de rota (sem perfil → `/perfis`) + aplicação do tema do perfil | T-06 §6.7 | 🟢 |
| F1-06 | ✅ 2026-10-01 | `StageLayout` com a barra superior (links, menu do perfil, placeholders do QR e da fila) | T-06 §6.6 Barra superior | 🟡 |
| F1-07 | ✅ 2026-10-01 | API de settings + tela `/configuracoes` (seções Aparência e Processamento, por enquanto) | T-04 §4.6 Config, T-03 §3.3 | 🟡 |
| F1-08 | ✅ 2026-10-01 | ✔ Verificação: criar 3 perfis, trocar temas, recarregar e manter o perfil | — | 🟢 |

## Fase 2 — Importação e processamento
**Objetivo:** buscar no YouTube ou enviar um arquivo → a música sai pronta (instrumental + voz + letra LRCLIB + capa), com progresso em tempo real.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F2-01 | ✅ 2026-10-01 | `shared`: `parseYoutubeTitle` + `lyrics.ts` (`LyricsDoc`, `parseLrc`, `toLrc`) com testes | T-05 §5.7, T-09 §9.3 | 🟡 |
| F2-02 | ✅ 2026-10-01 | Backend: busca no YouTube via yt-dlp (+ cache) | T-04 §4.9, §4.6 YouTube | 🟡 |
| F2-03 | ✅ 2026-10-01 | Backend: import do YouTube (cria Song + Job, duplicidade, limite de 12 min) | T-04 §4.6 YouTube, T-03 §3.4 | 🟡 |
| F2-04 | ✅ 2026-10-01 | Backend: jobs (listar, reordenar, cancelar, retry, remover) + rotas internas progress/complete/fail + recuperação ao iniciar + eventos | T-04 §4.6 Jobs/Interno, T-03 §3.4 | 🔴 |
| F2-05 | ✅ 2026-10-01 | Backend: upload (multipart + meta.json) + watcher chokidar | T-04 §4.6 Uploads, §4.8 | 🟡 |
| F2-06 | ✅ 2026-10-01 | Worker: etapa DOWNLOAD | T-05 §5.5 | 🟢 |
| F2-07 | ✅ 2026-10-01 | Worker: etapa SEPARATE (Demucs, progresso, cancelamento, fallback GPU→CPU) | T-05 §5.4 §5.6 | 🔴 |
| F2-08 | ✅ 2026-10-01 | Worker: etapa LYRICS (LRCLIB → letra.json/lrc; PLAIN/NONE) | T-05 §5.7 | 🟡 |
| F2-09 | ✅ 2026-10-01 | Worker: etapa COVER | T-05 §5.9 | 🟢 |
| F2-10 | ✅ 2026-10-01 | Front: `realtime/` (socket + `useRealtimeSync`) | T-04 §4.7, T-06 §6.7 | 🟡 |
| F2-11 | ✅ 2026-10-01 | Front: `/youtube` (busca, prévia embutida, modal de confirmar importação) | T-06 §6.6 YouTube | 🟡 |
| F2-12 | ✅ 2026-10-01 | Front: `/enviar` (arrastar e soltar + progresso) | T-06 §6.6 Enviar | 🟢 |
| F2-13 | ✅ 2026-10-01 | Front: `/fila` (em tempo real, reordenar, cancelar, retry) + indicador na barra superior | T-06 §6.6 Fila | 🟡 |
| F2-14 | ✅ 2026-10-01 | Configurações: dispositivo com info detectada, modelo Demucs, "Atualizar yt-dlp" | T-06 §6.6 Config, T-04 §4.6 Sistema | 🟢 |
| F2-15 | ✅ 2026-10-01 | ✔ Verificação: importar 1 do YouTube + 1 upload (arquivo copiado na pasta) + 1 upload pela página; as 3 ficam prontas; origens apagadas; cancelar funciona | — | 🟡 |

## Fase 3 — Biblioteca e player  ⭐ *primeira versão "cantável"*
**Objetivo:** escolher uma música estilo Netflix e cantar com a letra e a voz guia.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F3-01 | ✅ 2026-10-01 | (`/media` estático já existe, feito na F2) API de músicas: listar/buscar, detalhe, editar, excluir, `SongDTO` com URLs; `/media` estático | T-04 §4.6 Músicas, §4.2 | 🟡 |
| F3-02 | ✅ 2026-10-01 | API `GET /songs/home` (fileiras) | T-04 §4.6, T-06 §6.6 Início | 🟡 |
| F3-03 | ✅ 2026-10-01 | `SongCard` (capa/gradiente, hover, status de processamento) + `SongRow` (rolagem horizontal) | T-06 §6.6 SongCard | 🟡 |
| F3-04 | ✅ 2026-10-01 | Tela Início (hero + fileiras + estado vazio) | T-06 §6.6 Início | 🟡 |
| F3-05 | ✅ 2026-10-01 | `/biblioteca` (busca, filtros, rolagem infinita) | T-06 §6.6 Biblioteca | 🟢 |
| F3-06 | ✅ 2026-10-01 | `/musica/:id` (detalhe + ações) | T-06 §6.6 Detalhe | 🟢 |
| F3-07 | ✅ 2026-10-01 | `KaraokeEngine` (Web Audio, sincronia, voz guia, seek, volume) | T-07 §7.2 | 🔴 |
| F3-08 | ✅ 2026-10-01 | `LyricsView` (linha atual/próxima, preenchimento, contagem, PLAIN/NONE) + `findLineIndex` com testes | T-07 §7.3 | 🔴 |
| F3-09 | ✅ 2026-10-01 | `PlayerPage`: overlay "quem canta", controles, atalhos, ajuste de atraso da letra, tela cheia | T-07 §7.1 §7.7 | 🟡 |
| F3-10 | ✅ 2026-10-01 | API de performances (criar/finalizar sem nota) — registra o histórico | T-04 §4.6 Apresentações | 🟢 |
| F3-11 | ✅ 2026-10-01 (61 checagens no Chromium, áudio real) | ✔ Verificação: cantar uma música inteira na TV; voz guia liga/desliga sem engasgo; letra sincronizada; histórico gravado | — | 🟡 |
| F3-12 | ✅ 2026-10-01 | Sincronização automática: o worker acha onde a voz começa (faixa de voz) e grava o atraso da letra; limite do atraso sobe para ±60 s | T-05 | 🟡 |
| F3-13 | ✅ 2026-10-01 | Biblioteca de análise da voz no front (envelope + início da voz) | T-06 | 🟡 |
| F3-14 | ✅ 2026-10-01 | Tela "Sincronizar a letra" (/musica/:id/sincronizar): linha do tempo com a voz, arrastar a letra, ouvir e marcar, passos de ajuste, auto-save | T-06 | 🔴 |
| F3-15 | ✅ 2026-10-01 (44 checagens no Chromium) | ✔ Verificação real da sincronização no navegador | — | 🟡 |

## Fase 4 — Playlists, favoritas e histórico
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F4-01 | ✅ 2026-10-01 | API de playlists (CRUD, itens, reordenar, `containsSong`) com testes | T-04 §4.6 Playlists | 🟡 |
| F4-02 | ✅ 2026-10-01 | API de favoritos + `isFavorite` no `SongDTO` | T-04 §4.6 Favoritos | 🟢 |
| F4-03 | ✅ 2026-10-01 | `PlaylistPicker` (modal com checkboxes + criar nova) ligado ao ➕ do `SongCard` | T-06 §6.6 PlaylistPicker | 🟡 |
| F4-04 | ✅ 2026-10-01 | `/playlists` e `/playlists/:id` (cantar tudo, aleatório, reordenar) + player com sequência | T-06 §6.6, T-07 §7.2 | 🟡 |
| F4-05 | ✅ 2026-10-01 | `/favoritas` e `/historico` | T-06 §6.6 | 🟢 |
| F4-06 | ✅ 2026-10-01 (47 checagens no Chromium) | ✔ Verificação | — | 🟢 |

## Fase 5 — Celular e QR code
> Próxima fase (2026-10-02). Começar pela F5-01. Lembrete da Fase 4: hoje o celular não tem acesso a playlists nem favoritas (a lista de rotas liberadas para o celular fica em `backend/src/plugins/access.ts`); decidir com o Michael se entra nesta fase.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F5-01 | ✅ 2026-10-02 | API `system/access` (IPs da rede, regenerar, check) + autenticação do socket por código | T-04 §4.6 Sistema, §4.7 | 🟡 |
| F5-02 | ✅ 2026-10-02 | Modal do QR code no palco | T-08 §8.1 | 🟢 |
| F5-03 | ✅ 2026-10-02 | `MobileLayout` + `/m` (validação do código) + client com `X-Access-Code` | T-08 §8.1 §8.2, T-06 §6.2 | 🟡 |
| F5-04 | ✅ 2026-10-02 | `/m/buscar`, `/m/enviar`, `/m/fila` (reutilizando os componentes) | T-08 §8.2 | 🟡 |
| F5-05 | ✅ 2026-10-02 (celular real do Michael: entrar pelo QR, buscar, prévia e importar; 26/26 com celular emulado) | ✔ Verificação com um celular real na rede (inclui o firewall do Windows) | T-02 §2.5 | 🟢 |

## Fase 6 — Letras inteligentes (sincronia)  ⭐ *prioridade do Michael*
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F6-01 | ✅ 2026-10-01 | Worker: alinhar a letra do LRCLIB com a voz — atraso global ajustado com **todas** as linhas + cada linha imantada ao início de frase da voz; guarda `letra.original.json` (rápido, sem Whisper; substitui o atraso só pelo 1º som) | T-05 §5.7, SPEC-001 RF11 | 🔴 |
| F6-02 | ⏸️ | Worker: Whisper só para **transcrever** músicas sem letra (o alinhamento de letras com texto passou a ser feito pelo MMS, F6-05); precisa de job só de letra | T-05 §5.8 | 🔴 |
| F6-03 | ✅ 2026-10-01 | API: `PUT /songs/:id/lyrics`, `GET .../lyrics/original`, `POST .../lyrics/restore` (guarda a letra original na 1ª edição). O realinhamento por voz roda no navegador (F6-04); o job com Whisper entra na F6-02 | T-04 §4.6 Músicas | 🟡 |
| F6-04 | ✅ 2026-10-01 (38 checagens no Chromium, com a música real) | Front: nova página de sincronização (SPEC-001): arrastar linhas (corpo e bordas), marcar tocando, ímã nos inícios de voz, alinhar tudo com a voz (no navegador), editar texto/inserir/apagar linha, desfazer/refazer, voltar ao original, auto-save | SPEC-001, T-07 §7.4 | 🔴 |
| F6-07 | ✅ 2026-10-02 (43 de 44 checagens, a restante corrigida e conferida) | Player e sincronizar: efeito da letra com modelos (preencher aos poucos / palavra por palavra), liga/desliga (tecla E), modelo gravado nas configurações e tempo de preenchimento por música (`fillPercent`); pré-visualização da página de sincronizar logo abaixo da linha do tempo | pedido do Michael, T-07 §7.3 | 🟡 |
| F6-05 | ✅ 2026-10-02 | Tempos reais por palavra: alinhamento forçado (MMS do torchaudio) do texto de cada linha com a voz isolada, dentro da janela da linha; fim da palavra cortado onde a voz para; página de sincronizar preserva as palavras; comando `caraoke_worker.realign` (10 de 10 checagens no Chromium, erro ≤ 0,05 s) | `docs/memory/sincronizacao-da-letra.md` §14 | 🔴 |
| F6-06 | ✅ 2026-10-02 | ✔ Verificação com músicas brasileiras reais: "À Sua Maneira" (16/16 linhas com palavras, erro ≤ 0,05 s no player), "Ela É Demais" (39/39) e "Flores" (aprovadas de ouvido pelo Michael: "ficou muito bom"). Caso sem letra sincronizada no LRCLIB ficou com a F6-02 | — | 🟡 |

## Fase 5B — Convidados no celular e fila de cantores (ADR-008)
**Objetivo:** cada convidado entra pelo celular com seu nome, vê a biblioteca, pede as músicas que vai cantar e a TV chama um por vez, na ordem. Vem antes da Fase 7 porque a votação usa essa identidade.
Branch: `feature/f5b-fila-de-cantores`.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F5B-01 | ✅ 2026-10-02 | ADR-008 + documento técnico atualizado (banco, API, telas, celular, player) | ADR-008 | 🟡 |
| F5B-02 | ✅ 2026-10-02 | Backend: celular lista perfis e cria convidado; importação/envio pelo celular grava quem pediu + testes | T-04 §4.5 §4.6 Perfis, T-08 §8.2 | 🟡 |
| F5B-03 | ✅ 2026-10-02 | Backend: tabela `sing_requests`, rotas `/api/sing-queue`, `singQueue:changed`, `requestId` em `POST /performances` + testes | T-03, T-04 §4.6 Fila de cantores, §4.7 | 🔴 |
| F5B-04 | ✅ 2026-10-02 | Celular: "Quem é você?", aba Músicas com "Quero cantar", "Quero cantar esta" na importação, aba Fila com Próximos + Preparando | T-08 §8.2 §8.4 | 🟡 |
| F5B-05 | ✅ 2026-10-02 | Palco: página Próximos (reordenar, remover, chamar), contador na barra, faixa no início, player "Vez de Ana" e "Chamar o próximo" | T-06 §6.6 Próximos, T-07 §7.1 | 🔴 |
| F5B-06 | ✅ 2026-10-02 (37/37 no navegador: palco + 2 celulares) | ✔ Verificação: palco + 2 celulares (identidade, pedidos, limites, ordem, chamar o próximo) | — | 🟡 |

## Fase 7 — Pontuação e ranking
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F7-01 | ✅ 2026-10-02 | Worker: etapa MELODY (parselmouth) + `FEATURE_MELODY` + reprocessar as músicas existentes | T-05 §5.10 | 🟡 |
| F7-02 | ✅ 2026-10-02 | `PitchScorer` + detecção com pitchy + testes | T-07 §7.5 | 🔴 |
| F7-03 | ✅ 2026-10-02 (sem teste com microfone real) | Configurações de pontuação: modo, peso, microfone, medidor, calibração da latência | T-07 §7.5, T-06 §6.6 Config | 🔴 |
| F7-04 | ✅ 2026-10-02 | Backend: votação (abrir/encerrar, timer, votos, `computeFinalScore`, não votar em si mesmo) + testes | T-04 §4.6 Apresentações | 🔴 |
| F7-05 | ✅ 2026-10-02 | Palco: medidor ao vivo, tela de votação e tela de nota animada | T-07 §7.6 | 🟡 |
| F7-06 | ✅ 2026-10-02 | Celular: `/m/votar` | T-07 §7.6, T-08 §8.2 | 🟡 |
| F7-07 | ✅ 2026-10-02 | API + tela `/ranking` (família e convidados juntos, filtro "Só a família") | T-04 §4.6 Ranking, T-06 §6.6 | 🟡 |
| F7-08 | ✅ 2026-10-02 (29/29: TV + 3 celulares; sem microfone real) | ✔ Verificação: festa-teste com 2 celulares votando | — | 🟡 |

## Fase 7B — Fila de cantores v2 e letra no celular (ADR-009)
**Objetivo:** a festa anda quase sozinha (TV adiciona, arrasta, sorteia, chama o próximo com contagem) e quem não canta acompanha a letra pelo celular.
Branch: `feature/f7b-fila-e-letra`.

| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F7B-01 | ✅ 2026-10-03 | ADR-009/010 + roadmap + documento técnico | ADR-009, ADR-010 | 🟡 |
| F7B-02 | ✅ 2026-10-03 | "+ Convidado" no "Quem vai cantar esta?" e "Gerenciar perfis" no menu | ADR-009 | 🟢 |
| F7B-03 | ✅ 2026-10-03 | Backend da fila: limite configurável, TV passa do limite, aleatório com `nextId` no servidor + testes | ADR-009, T-04 Fila de cantores | 🔴 |
| F7B-04 | ✅ 2026-10-03 | Palco: "+ Adicionar" e "Pôr na fila", arrastar (dnd-kit), botão Aleatório, "Próximo" vindo do servidor; seção Fila nas configurações | ADR-009, T-06 Próximos | 🟡 |
| F7B-05 | ✅ 2026-10-03 | Chamar o próximo sozinho com contagem configurável depois da nota | ADR-009, T-07 §7.6 | 🟡 |
| F7B-06 | ✅ 2026-10-03 | Letra no celular: relógio da TV (`/api/player/state`, `player:state`, `/api/system/time`), letra liberada, aba Letra, tela acesa | ADR-009, T-08 | 🔴 |
| F7B-07 | ✅ 2026-10-03 (18/18: TV + 2 celulares) | ✔ Verificação: TV + celulares (adicionar, arrastar, aleatório, contagem, letra sincronizada) | — | 🟡 |

## Fase 7C — Disputas (ADR-010)
| ID | Status | Tarefa | Modelo |
|---|---|---|---|
| F7C-01 | ✅ 2026-10-05 | Banco + API das disputas (criar, editar, participantes, músicas, imagem, iniciar, encerrar, placar) + testes | 🔴 |
| F7C-02 | ✅ 2026-10-05 | Modo disputa na fila e na votação (regras da disputa, pedidos normais guardados) + testes | 🔴 |
| F7C-03 | ✅ 2026-10-05 | Página `/disputas`: lista, criar/editar com arrastar participantes, músicas por pessoa | 🟡 |
| F7C-04 | ✅ 2026-10-05 | Placar ao vivo e pódio final da disputa | 🟡 |
| F7C-05 | ✅ 2026-10-05 (19/19 no navegador) | ✔ Verificação: disputa-teste com 3 participantes | 🟡 |

## Modo festa (2026-10-05)
| ID | Status | Tarefa |
|---|---|---|
| MF-01 | ✅ 2026-10-05 | Servidor entrega o site empacotado e comprimido (`plugins/web.ts`, `@fastify/compress`) + `npm run festa`; QR na porta 3333 |
| MF-02 | ✅ 2026-10-05 | Verificação: celular 0,3 MB/19 arquivos (~1–2 s, antes 15 MB/212), roteiros 7B (18/18) e 7C (19/19) rodando no modo festa |

## Fase 7E — Saúde do sistema e reiniciar (ADR-011)
| ID | Status | Tarefa | Modelo |
|---|---|---|---|
| F7E-01 | ✅ 2026-10-05 | ADR-011 + roadmap | 🟡 |
| F7E-02 | ✅ 2026-10-05 | Backend: relatório de saúde (banco, worker, internet, LRCLIB, YouTube, disco, falhas recentes) + motivo da falta de letra (`lyricsNotice`) no worker e na música + testes | 🔴 |
| F7E-03 | ✅ 2026-10-05 | Reiniciar: vigia `scripts/supervisor.mjs` no `npm run festa`, `POST /api/system/restart`, `system:restarting` + testes | 🔴 |
| F7E-04 | ✅ 2026-10-05 | Telas: página `/saude`, indicador ⚠ na barra, seção Sistema nas configurações, camada "Reiniciando…", motivo da letra na música e na fila | 🟡 |
| F7E-05 | ✅ 2026-10-05 (9/9 no modo festa) | ✔ Verificação: falhas simuladas (sem LRCLIB, worker parado) e reinício de verdade no modo festa | 🟡 |

## Fase 7F — Tom da música e tempo estimado (ADR-012)
| ID | Status | Tarefa | Modelo |
|---|---|---|---|
| F7F-01 | ✅ 2026-10-06 | ADR-012 + roadmap (+ plano da Fase 7G) | 🟡 |
| F7F-02 | ✅ 2026-10-06 | Mudar o tom: SoundTouch num Web Worker, motor troca as faixas no mesmo ponto, controle no player (−6..+6, teclas - e =), `songs.keyShift` salvo por música, pontuação acompanha o tom + testes | 🔴 |
| F7F-03 | ✅ 2026-10-06 | Tempo estimado: `/api/jobs/estimate` (mediana do histórico), "faltam/começa em/pronta em" na fila (TV e celular) e "Tudo pronto em ~X" + testes | 🟡 |
| F7F-04 | ✅ 2026-10-06 | ✔ Verificação no navegador (tom ouvido/medido e fila com estimativa) | 🟡 |

## Fase 7G — IA e processamento em outras máquinas (ADR-013, ADR-014, ADR-015)
| ID | Status | Tarefa | Modelo |
|---|---|---|---|
| F7G-01 | ✅ 2026-10-06 | Selo "tem letra / sem letra" na busca do YouTube (`/api/lyrics/check`) | 🟡 |
| F7G-02 | ✅ 2026-10-06 | Chave para IA (gerar/trocar/revogar, Bearer só nas rotas do MCP) + seção "IA (MCP)" nas Configurações (ADR-014) | 🟡 |
| F7G-03 | ✅ 2026-10-06 | Servidor MCP `mcp/` (stdio): buscar_youtube, verificar_letra, buscar_na_biblioteca, importar_musicas, fila_de_processamento, cancelar_processamento, reordenar_fila; arquivo único em `/downloads/caraoke-mcp.mjs` (ADR-014) | 🔴 |
| F7G-04 | ✅ 2026-10-06 | Máquinas pareadas: tabela `workers`, pareamento por código, token por máquina nas rotas internas, heartbeat por máquina, tela "Máquinas de processamento" (ADR-015) | 🔴 |
| F7G-05 | ✅ 2026-10-06 | Modo remoto do worker: baixa a origem, envia os arquivos prontos; escolher onde processar (`targetWorkerId`) na fila e no MCP (ADR-015) | 🔴 |
| F7G-06 | ⬜ | App instalável: `remote-worker/` (Instalar.cmd, atalho, console em português) + `npm run processador:pacote` + download pelo karaokê (ADR-015) | 🔴 |
| F7G-07 | ⬜ | Opcional: extensão do Chrome "Mandar para o karaokê" | 🟡 |
| F7G-08 | ⬜ | ✔ Verificação: MCP de verdade no Claude Code; worker remoto simulado nesta máquina (outra pasta + token pareado) | 🟡 |

## Fase 8 — Publicação (futuro)
| ID | Status | Tarefa | Modelo |
|---|---|---|---|
| F8-01 | ⬜ | ADR: onde hospedar e onde processar (PC de casa × nuvem com GPU) | 🔴 |
| F8-02 | ⬜ | Conta da casa com senha acima dos perfis (ADR-003) + HTTPS (servidor Linux da casa: domínio próprio apontando para o IP local + Caddy com Let's Encrypt via DNS; libera tela acesa, microfone de outro aparelho e instalar como app) | 🔴 |
| F8-03 | ⬜ | Storage externo (S3 ou similar) e deploy | 🔴 |

## Backlog (ideias ainda sem fase)
- **MCP do karaokê para IA** (2026-10-06): buscar no YouTube, ver se já existe e **se tem letra antes de importar**, importar uma ou várias, acompanhar a fila, por exemplo "liste as 20 mais cantadas de karaokê nacional" e depois "processe a 1, 3 e 7". Detalhes em `vault/10-ideias/mcp-e-processamento-remoto.md`
- **Processar em outras máquinas (GPU)** (2026-10-06): worker remoto que baixa a origem e envia os arquivos prontos pela rede, várias máquinas com nome, escolher onde processar (pela tela ou pela IA via MCP). Mesmo arquivo de ideias
- **Selo "tem letra / sem letra"** nos resultados da busca do YouTube (parte da ideia do MCP, útil sozinho)
- ~~Pacote de imagens~~ → 20 avatares divertidos (2026-10-05)
- Botão "Buscar a letra de novo" na página da música (sem reprocessar tudo), útil quando o site das letras estava fora do ar
- Tocar a versão original enquanto o instrumental não fica pronto (hoje: play bloqueado)
- Foto própria como avatar
- Conquistas ("cantou 10 músicas", "nota 100")
- Dueto (duas vozes, duas notas)
- Ver também `vault/10-ideias/`
