# ADR-005 — Stack detalhada

- **Status:** aceita
- **Data:** 2026-10-01

## Contexto
Com React + Node (ADR-001), MySQL (ADR-002) e o processamento assíncrono (ADR-004) definidos, faltava escolher as bibliotecas e ferramentas. As ferramentas de IA de áudio (Demucs, Whisper) só existem em Python.

## Decisão
| Camada | Escolha | Alternativas descartadas |
|---|---|---|
| Linguagem | **TypeScript** (front, back, shared) | JavaScript puro (menos segurança para modelos mais simples) |
| Organização | **Monorepo npm workspaces**: `frontend/`, `backend/`, `shared/`, `worker/` | Repositórios separados |
| Front | **Vite + React 19 + Tailwind 4 + React Router 7 + TanStack Query + Zustand** | Next.js (desnecessário para um app local) |
| Back | **Fastify 5 + Zod + Socket.IO 4** | Express (menos tipagem), NestJS (pesado demais) |
| ORM | **Prisma 6** (fixado em ^6) | Drizzle; Prisma 7 (mudanças grandes, menos material) |
| Worker | **Python 3.11**: yt-dlp, Demucs 4.0.1, torch 2.5.1 (cu124), stable-ts, praat-parselmouth | Tudo em Node (as ferramentas de IA não existem lá) |
| Comunicação worker ↔ back | **HTTP com token**; o worker não acessa o banco | Worker acessando o MySQL direto (duplica as regras) |
| Letras | **LRCLIB** → **stable-ts** (alinhamento/transcrição) → editor manual | Raspar o Letras.mus.br (frágil) |
| Afinação | **parselmouth** (referência, no worker) + **pitchy** (microfone, no navegador) | CREPE (pesado demais para a CPU) |

## Consequências
- Tipos compartilhados entre front e back via `@caraoke/shared`.
- São dois runtimes (Node e Python) para instalar e manter; o `npm run dev` sobe os dois.
- Hardware modesto (i5-4460 / GT 1030 2 GB): o Demucs roda na CPU no modo automático (4–6 min por música).
