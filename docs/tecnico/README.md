# Documento Técnico — caraoke-michael

Esta é a **fonte da verdade técnica** do projeto. Foi escrita com detalhe suficiente para que qualquer modelo (inclusive um mais simples) implemente as tarefas do [roadmap](../roadmap/ROADMAP.md) sem precisar tomar decisões de arquitetura.

> **Regra de ouro:** se algo não estiver descrito aqui, **não invente**. Pare, pergunte ao Michael e, depois de decidido, registre aqui ou num ADR.

## Índice

| Arquivo | Conteúdo | Leia quando for… |
|---|---|---|
| [01-arquitetura.md](01-arquitetura.md) | Visão geral, componentes, fluxo de uma música, estrutura do repositório | Sempre (leitura inicial) |
| [02-ambiente.md](02-ambiente.md) | Pré-requisitos, instalação, `.env`, scripts, portas, hardware | Preparar ambiente / rodar o projeto |
| [03-banco-de-dados.md](03-banco-de-dados.md) | Schema Prisma completo, enums, regras, seeds | Mexer em dados / migrations |
| [04-backend-api.md](04-backend-api.md) | Fastify, todos os endpoints, WebSocket, controle de acesso, watcher | Implementar o back-end |
| [05-worker-processamento.md](05-worker-processamento.md) | Worker Python: fila, download, Demucs, GPU/CPU, letras, capa, melodia | Implementar o processamento |
| [06-frontend.md](06-frontend.md) | React: rotas, telas, componentes, temas, avatares, estado | Implementar telas |
| [07-player-letras-pontuacao.md](07-player-letras-pontuacao.md) | Player Web Audio, voz guia, exibição de letra, afinação, votação | Player, letra, pontuação |
| [08-celular-qrcode.md](08-celular-qrcode.md) | Acesso pelo celular, QR code, código de acesso, páginas móveis | Funcionalidades do celular |
| [09-convencoes.md](09-convencoes.md) | Padrões de código, idioma, commits, testes, checklist de tarefa | Sempre (antes de codar) |

## Resumo em 10 linhas
1. Monorepo npm workspaces: `frontend/` (React + Vite + TS + Tailwind 4), `backend/` (Fastify 5 + TS + Prisma 6), `shared/` (tipos e utilitários TS), `worker/` (Python 3.11).
2. Banco **MariaDB 10.4 (XAMPP)**, banco `caraoke`, usuário `root` sem senha.
3. O **back-end** é o centro: API REST + Socket.IO + arquivos estáticos + monitor da pasta de upload.
4. O **worker Python** pede jobs ao back-end por HTTP, processa e devolve o resultado. Ele **não acessa o banco**.
5. Processamento: yt-dlp (download) → Demucs (separa voz) → LRCLIB/stable-ts (letra) → capa → parselmouth (melodia de referência).
6. GPU: modo `auto` usa CUDA só se houver ≥ 3,5 GB de VRAM. **A GT 1030 (2 GB) cai na CPU no modo auto**; o modo manual `gpu` tenta e volta para a CPU se faltar memória.
7. O **palco** (PC/TV) é o app completo; o **celular** acessa só buscar/importar/fila/votar, via QR code com código de acesso.
8. Player com **Web Audio API**: instrumental + voz tocando sincronizados; a voz guia é um ganho (padrão 0).
9. Pontuação = **afinação (microfone no PC) × 0,8 + plateia (votos pelo celular) × 0,2**, configurável.
10. Temas por variáveis CSS; visual estilo Netflix com capas.
