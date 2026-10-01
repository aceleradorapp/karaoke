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
| 4 | Playlists, favoritas e histórico | ⬜ (próxima) |
| 5 | Celular e QR code | ⬜ |
| 6 | Letras inteligentes | ⬜ |
| 7 | Pontuação e ranking | ⬜ |
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
| F3-15 | ⬜ | ✔ Verificação real da sincronização no navegador | — | 🟡 |

## Fase 4 — Playlists, favoritas e histórico
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F4-01 | ⬜ | API de playlists (CRUD, itens, reordenar, `containsSong`) com testes | T-04 §4.6 Playlists | 🟡 |
| F4-02 | ⬜ | API de favoritos + `isFavorite` no `SongDTO` | T-04 §4.6 Favoritos | 🟢 |
| F4-03 | ⬜ | `PlaylistPicker` (modal com checkboxes + criar nova) ligado ao ➕ do `SongCard` | T-06 §6.6 PlaylistPicker | 🟡 |
| F4-04 | ⬜ | `/playlists` e `/playlists/:id` (cantar tudo, aleatório, reordenar) + player com sequência | T-06 §6.6, T-07 §7.2 | 🟡 |
| F4-05 | ⬜ | `/favoritas` e `/historico` | T-06 §6.6 | 🟢 |
| F4-06 | ⬜ | ✔ Verificação | — | 🟢 |

## Fase 5 — Celular e QR code
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F5-01 | ⬜ | API `system/access` (IPs da rede, regenerar, check) + autenticação do socket por código | T-04 §4.6 Sistema, §4.7 | 🟡 |
| F5-02 | ⬜ | Modal do QR code no palco | T-08 §8.1 | 🟢 |
| F5-03 | ⬜ | `MobileLayout` + `/m` (validação do código) + client com `X-Access-Code` | T-08 §8.1 §8.2, T-06 §6.2 | 🟡 |
| F5-04 | ⬜ | `/m/buscar`, `/m/enviar`, `/m/fila` (reutilizando os componentes) | T-08 §8.2 | 🟡 |
| F5-05 | ⬜ | ✔ Verificação com um celular real na rede (inclui o firewall do Windows) | T-02 §2.5 | 🟢 |

## Fase 6 — Letras inteligentes
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F6-01 | ⬜ | Worker: `align.py` com stable-ts (alinhar texto + transcrever) integrado à etapa LYRICS | T-05 §5.8 §5.7 | 🔴 |
| F6-02 | ⬜ | API: `PUT lyrics`, `lyrics/search`, `lyrics/align` (jobs só de letra) | T-04 §4.6 Músicas | 🟡 |
| F6-03 | ⬜ | Editor de letra (texto, sincronização por toque, ajuste fino) | T-07 §7.4 | 🔴 |
| F6-04 | ⬜ | Exibição palavra a palavra quando houver `words` | T-07 §7.3 | 🟡 |
| F6-05 | ⬜ | ✔ Verificação com 3 músicas brasileiras sem letra sincronizada no LRCLIB | — | 🟡 |

## Fase 7 — Pontuação e ranking
| ID | Status | Tarefa | Docs | Modelo |
|---|---|---|---|---|
| F7-01 | ⬜ | Worker: etapa MELODY (parselmouth) + `FEATURE_MELODY` + reprocessar as músicas existentes | T-05 §5.10 | 🟡 |
| F7-02 | ⬜ | `PitchScorer` + detecção com pitchy + testes | T-07 §7.5 | 🔴 |
| F7-03 | ⬜ | Configurações de pontuação: modo, peso, microfone, medidor, calibração da latência | T-07 §7.5, T-06 §6.6 Config | 🔴 |
| F7-04 | ⬜ | Backend: votação (abrir/encerrar, timer, votos, `computeFinalScore`) + testes | T-04 §4.6 Apresentações | 🔴 |
| F7-05 | ⬜ | Palco: medidor ao vivo, tela de votação e tela de nota animada | T-07 §7.6 | 🟡 |
| F7-06 | ⬜ | Celular: `/m/votar` | T-07 §7.6, T-08 §8.2 | 🟡 |
| F7-07 | ⬜ | API + tela `/ranking` | T-04 §4.6 Ranking, T-06 §6.6 | 🟡 |
| F7-08 | ⬜ | ✔ Verificação: festa-teste com 2 celulares votando | — | 🟡 |

## Fase 8 — Publicação (futuro)
| ID | Status | Tarefa | Modelo |
|---|---|---|---|
| F8-01 | ⬜ | ADR: onde hospedar e onde processar (PC de casa × nuvem com GPU) | 🔴 |
| F8-02 | ⬜ | Conta da casa com senha acima dos perfis (ADR-003) + HTTPS | 🔴 |
| F8-03 | ⬜ | Storage externo (S3 ou similar) e deploy | 🔴 |

## Backlog (ideias ainda sem fase)
- Celular colocar músicas na **fila de quem vai cantar** e criar perfil de convidado pelo celular (falado em 01/10, a confirmar)
- Tocar a versão original enquanto o instrumental não fica pronto (hoje: play bloqueado)
- Foto própria como avatar
- Conquistas ("cantou 10 músicas", "nota 100")
- Dueto (duas vozes, duas notas)
- Ajuste de tom (pitch shift) do instrumental
- Ver também `vault/10-ideias/`
