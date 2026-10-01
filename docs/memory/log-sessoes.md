# Log de sessões

> Entradas mais recentes no topo. Use `/fim-sessao` para registrar.

## 2026-10-01 (noite, 4) — Fase 3 concluída
**Feito:** F3-01 a F3-11 — API de músicas (busca por tokens, filtros, ordenações, cursor), Início estilo Netflix (destaque + fileiras), Biblioteca com busca/filtros, detalhe com editor (auto-save) e letra, engine de áudio (Web Audio: instrumental + voz guia em sincronia), letra sincronizada com preenchimento por palavra e contagem regressiva, player com atalhos, atraso da letra salvo sozinho, histórico de apresentações, confirmação ao remover da fila.
**Verificado:** typecheck, testes (shared, backend 200, frontend 380, worker 121), build e Prettier. No Chromium real com a música "À Sua Maneira": 61 checagens (áudio rodando e com som, voz guia desligada por padrão e liga/desliga sem engasgo, letra acompanhando o tempo em 9 amostras, pausa/seek/atalhos, atraso salvo, fim da música, "Cantar de novo", sair no meio, áudio liberado, sem rolagem horizontal em 375/768/1366/1920 px).
**Bug achado só no navegador (corrigido):** setas de rolagem das fileiras ficavam meio fora do contêiner e geravam 6–7 px de rolagem horizontal no Início em 768 e 1366 px.
**Pendências/atenções:** músicas de teste seguem na biblioteca (usar "Excluir" no detalhe); revisar com Opus as tarefas 🔴 (F2-04, F2-07, F3-07, F3-08); depois de "Atualizar yt-dlp" reiniciar o sistema.
**Próximos passos:** Fase 4 (playlists, favoritas e histórico), em nova branch a partir de develop.

## 2026-10-01 (noite, 3) — Fase 2 concluída
**Feito:** F2-01 a F2-15 — parser de títulos e de LRC (shared), busca e importação do YouTube, upload e monitor da pasta, gerenciamento da fila e rotas do worker, worker com download (yt-dlp), separação (Demucs), letra (LRCLIB) e capa, tempo real (Socket.IO), telas de YouTube, envio, fila e botão de atualizar yt-dlp. Também: /media estático e API tolerante a corpo JSON vazio.
**Verificado com conteúdo real:** vídeo do YouTube baixado e separado na CPU (≈1,5× a duração), cancelar durante a separação (processos do Demucs encerrados em segundos) e tentar de novo, vídeo indisponível tratado, upload pela pasta e pela página, ordem da fila respeitada. 33 checagens no navegador (Playwright) + 24 testes shared, 155 backend, 196 frontend, 121 worker.
**Bugs achados na verificação real (e corrigidos):** barra de download do modelo lida como progresso da separação; `Content-Type: application/json` com corpo vazio rejeitado pelo Fastify (agora aceito); capas 404 por falta de /media; padrão de erro "confirm your age" traduzido como login; vazamento de .part ao estourar o limite de arquivos; `moveToError('')` poderia mover a pasta atual (agora recusa vazio e fora do storage).
**Decisões:** ADR-007 (cancelamento e recuperação). Prévia do YouTube em modal (não painel lateral). Menu ganhou "Enviar"; nome do perfil só a partir de 2xl.
**Pendências/atenções:** (1) as músicas de teste continuam na biblioteca porque o Claude Code bloqueou a limpeza com rm -rf; dá para excluir pelo app quando a F3-01 trouxer o botão Excluir (ou apagar storage/biblioteca/* e a tabela songs à mão). (2) Depois de "Atualizar yt-dlp" é preciso reiniciar o sistema para o worker usar a nova versão. (3) Tarefas 🔴 F2-04 e F2-07 foram feitas com Sonnet e testes extras: vale uma revisão com Opus.
**Próximos passos:** Fase 3 (biblioteca e player): API de músicas, Início estilo Netflix, player com voz guia e letra.

## 2026-10-01 (noite, 2) — Fase 1 concluída
**Feito:** F1-01 a F1-08 — API de perfis, componentes base responsivos e hook useAutoSave, tela "Quem vai cantar?", gerenciar perfis com auto-save, guarda de rota + ThemeSync, layout do palco com barra superior responsiva, API de configurações e tela /configuracoes. Branches main/develop criadas e publicadas; fase desenvolvida em feature/f1-perfis-e-temas.
**Verificado:** 45 testes backend, 73 frontend, 10 worker; typecheck, build e Prettier ok. Verificação ponta a ponta em navegador real (Playwright/Chromium instalado só na pasta temporária, fora do repositório) com 55 checagens: criação de perfis pela interface, tema por perfil, persistência após recarregar, auto-save, sem rolagem horizontal em 375/768/1366/1920 px, hambúrguer, modal em tela cheia no celular.
**Bugs achados só no navegador (e corrigidos):** perfis alinhados à esquerda (agora centralizados); ícone de QR aparecendo no celular (classe hidden perdia para inline-flex, trocado por max-sm:hidden); barra superior quebrando em 2 linhas em 1366 px (fonte base sobe para 18 px a partir de 1280 px; hambúrguer agora abaixo de xl e nome do perfil só a partir de 2xl).
**Decisões/desvios:** hambúrguer abaixo de xl (doc 06 atualizado); cliente HTTP só envia Content-Type JSON quando há corpo (Fastify rejeita corpo vazio com JSON); ThemeSync é o único ponto que aplica tema; a barra tem placeholders para a fila (/fila) e o QR code (desabilitado até a F5).
**Próximos passos:** Fase 2 (importação e processamento): YouTube, upload, fila e etapas do worker.

## 2026-10-01 (noite) — Fase 0 concluída
**Feito:** F0-06 a F0-14 — monorepo (workspaces, Prettier, tsconfig base, .env), pacote shared, backend Fastify (env Zod, erros, storage, Socket.IO, health, rotas internas do worker, controle de acesso), Prisma (schema completo, migration init, seed), frontend Vite/React/Tailwind 4 com 4 temas, worker Python (heartbeat + claim + detecção GPU/CPU), venv com torch cu124.
**Verificado:** npm run dev sobe api+web+worker; worker aparece online (CPU, GT 1030 detectada com 2 GB); 30 testes backend, 5 frontend, 10 worker; typecheck e build ok.
**Decisões/desvios:** tema claro com id `light`; banco de testes separado `caraoke_test` (db push no globalSetup, com trava de sufixo _test); prisma.config.ts carrega o .env da raiz; permissões do .claude/settings.json liberadas (git push etc. pedem confirmação). npm audit: 3 alertas high só na CLI do Prisma (deepmerge-ts), ignorados de propósito. Ao instalar deps com npm -w, a 1ª instalação às vezes não grava em dependencies; conferir o package.json.
**Próximos passos:** Fase 1 (perfis, temas, base visual), começando por F1-01.

## 2026-10-01 (tarde) — Planejamento completo
**Feito:**
- Requisitos fechados com o Michael: perfis estilo Netflix sem senha, várias playlists por perfil, fila de processamento assíncrona, YouTube + pasta de upload (a origem é apagada após processar), GPU automática/manual, página limitada no celular via QR code, vários temas, visual Netflix com capas, pontuação afinação + plateia configurável.
- Hardware levantado: i5-4460, 8 GB, GT 1030 2 GB (→ CPU no modo auto), MariaDB 10.4 do XAMPP (root sem senha).
- Banco `caraoke` criado; `git init` (branch `main`, sem commits).
- Documento técnico completo em `docs/tecnico/` (01–09).
- Roadmap detalhado com tarefas F0–F8 e o modelo sugerido por tarefa.
- ADR-005 (stack) e ADR-006 (pontuação).
- Comando `/proxima-tarefa` criado.
- Instalação do Python 3.11 e do FFmpeg via winget disparada (conferir na F0-05).

**Decisões padrão adotadas (podem mudar):** play bloqueado enquanto processa; convidado criado no palco; o celular não coloca músicas na fila de quem canta (backlog).

**Próximos passos:** F0-05 em diante (pode usar um modelo mais simples, como Sonnet).

## 2026-10-01 (manhã)
**Feito:** criada a estrutura de apoio (CLAUDE.md, .claude/, docs/roadmap, docs/specs, docs/memory, vault).
**Decisões:** front-end em React, back-end em Node.js (ADR-001).
