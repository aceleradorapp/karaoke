# Log de sessões

> Entradas mais recentes no topo. Use `/fim-sessao` para registrar.

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
