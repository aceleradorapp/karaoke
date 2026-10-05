# 02 — Ambiente

## 2.1 Máquina de referência (PC da casa)

| Item | Valor | Impacto |
|---|---|---|
| CPU | Intel Core i5-4460 (4 núcleos, 3,2 GHz) | Demucs na CPU: ~1 a 1,5× a duração da música (4 min de música ≈ 4–6 min) |
| RAM | 8 GB | Use 1 job por vez; o modelo Whisper deve ser `small` |
| GPU | NVIDIA GeForce GT 1030, **2 GB**, driver 560.94 | Insuficiente para o `htdemucs` padrão. O modo `auto` escolhe a **CPU**; o modo `gpu` tenta com `--segment` baixo e volta para a CPU se faltar memória |
| SO | Windows 11 Pro | Caminhos com `\`; use `path.join` / `pathlib` sempre |
| IP na rede | 192.168.98.10 (pode mudar) | O QR code usa o IP detectado em runtime |
| Banco | MariaDB 10.4.32 (XAMPP, `C:\xampp`) | Provider `mysql` no Prisma |

## 2.2 Pré-requisitos

| Ferramenta | Versão | Status | Como instalar |
|---|---|---|---|
| Node.js | 24.x | ✅ instalado (24.14) | — |
| npm | 11.x | ✅ instalado | — |
| Git | 2.x | ✅ instalado | — |
| XAMPP / MariaDB | 10.4 | ✅ rodando | Iniciar o MySQL pelo painel do XAMPP |
| Python | **3.11** (não use 3.12+: o Demucs 4.0.1 e o torch 2.5.1 são mais estáveis no 3.11) | ver roadmap F0 | `winget install --id Python.Python.3.11 --scope user` |
| FFmpeg | qualquer versão recente | ver roadmap F0 | `winget install --id Gyan.FFmpeg` (abra um terminal novo depois, para atualizar o PATH) |

Verificação rápida:
```powershell
node -v; npm -v; git --version
py -3.11 --version      # ou: python --version
ffmpeg -version
C:\xampp\mysql\bin\mysql.exe -u root -e "SHOW DATABASES LIKE 'caraoke';"
nvidia-smi
```

## 2.3 Banco de dados
- Banco: `caraoke` (**já criado**, utf8mb4 / utf8mb4_unicode_ci).
- Usuário `root`, sem senha, `localhost:3306`.
- `DATABASE_URL="mysql://root:@localhost:3306/caraoke"`
- O Prisma `migrate dev` cria um *shadow database* temporário; o root tem permissão para isso.

## 2.4 Variáveis de ambiente

Um único `.env` na **raiz**, lido pelo backend (`dotenv` com caminho `../.env`) e pelo worker (`python-dotenv`). O `.env.example` é versionado; o `.env` não.

```dotenv
# Banco
DATABASE_URL="mysql://root:@localhost:3306/caraoke"

# Backend
API_HOST=0.0.0.0            # 0.0.0.0 para aceitar conexões dos celulares
API_PORT=3333
WEB_DEV_PORT=5173           # porta do Vite em desenvolvimento

# Armazenamento (relativo à raiz do repositório ou absoluto)
STORAGE_DIR=./storage

# Worker
WORKER_TOKEN=troque-por-um-texto-aleatorio-longo
API_URL=http://127.0.0.1:3333
YTDLP_PATH=./worker/.venv/Scripts/yt-dlp.exe
PYTHON_PATH=./worker/.venv/Scripts/python.exe

# Integrações
LRCLIB_USER_AGENT="caraoke-michael/0.1 (uso pessoal)"
```

Regras:
- O backend valida o `.env` com Zod em `backend/src/env.ts` e **falha ao iniciar** se faltar algo.
- Caminhos relativos são resolvidos a partir da **raiz do repositório** (não do `cwd`).

## 2.5 Portas

| Porta | Serviço | Observação |
|---|---|---|
| 3306 | MariaDB | XAMPP |
| 3333 | Backend (API + Socket.IO + /media) | Em "produção local", também serve o front buildado |
| 5173 | Vite (dev) | `server.host: true` para os celulares acessarem; proxy de `/api`, `/media` e `/socket.io` para a 3333 |

**Firewall do Windows:** na primeira execução, permitir o Node.js em **redes privadas**. Se o celular não conseguir conectar, verificar isso primeiro.

## 2.6 Scripts (package.json da raiz)

```jsonc
{
  "name": "caraoke-michael",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "backend", "frontend"],
  "scripts": {
    "dev": "concurrently -n api,web,worker -c blue,magenta,yellow \"npm:dev:api\" \"npm:dev:web\" \"npm:dev:worker\"",
    "dev:api": "npm run dev -w backend",
    "dev:web": "npm run dev -w frontend",
    "dev:worker": "worker\\.venv\\Scripts\\python.exe -m caraoke_worker",
    "build": "npm run build -w frontend",
    "start": "npm run start -w backend",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "db:migrate": "npm run db:migrate -w backend",
    "db:seed": "npm run db:seed -w backend",
    "db:studio": "npm run db:studio -w backend",
    "worker:setup": "powershell -ExecutionPolicy Bypass -File scripts/setup-worker.ps1"
  },
  "devDependencies": { "concurrently": "^9" }
}
```

Scripts do backend: `dev` (`tsx watch src/server.ts`), `start` (`tsx src/server.ts`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `db:migrate` (`prisma migrate dev`), `db:seed` (`tsx prisma/seed.ts`), `db:studio` (`prisma studio`).

Scripts do frontend: `dev` (`vite`), `build` (`tsc -b && vite build`), `test` (`vitest run`), `typecheck`.

> O worker roda pelo Python do venv, executado a partir da **raiz** (para que `caraoke_worker` seja encontrado, o `dev:worker` precisa de `cwd=worker`). Implementação recomendada: `"dev:worker": "cd worker && .venv\\Scripts\\python.exe -m caraoke_worker"`.

### Modo festa (uso no dia a dia) — `npm run festa`
- Monta o site otimizado (`npm run build`: ~0,3 MB comprimido, 19 arquivos) e sobe **servidor + worker**; o próprio servidor entrega o site na porta **3333** (sem o Vite).
- Na TV: **http://localhost:3333**. O QR passa a apontar para `http://<ip>.nip.io:3333/m?c=…` (o backend usa `API_PORT` quando `NODE_ENV=production`; `backend/src/festa.ts` liga isso).
- Medido (2026-10-05): celular abre em ~1–2 s, contra 15 MB e vários segundos no modo de desenvolvimento.
- Mudança no código só aparece depois de rodar `npm run festa` de novo. Para desenvolver, use `npm run dev` (porta 5173, com recarga automática).
- **Vigia (ADR-011):** `npm run festa` roda `scripts/supervisor.mjs`, que inicia o servidor (`node --import tsx src/festa.ts`) e o worker com `CARAOKE_SUPERVISED=1`, mostra as mensagens com `[api]`/`[worker]`, religa em 3 s quem cair e, quando o servidor sai com o código **75** (botão "Reiniciar o sistema", `POST /api/system/restart`), reinicia servidor e worker. Ctrl+C desliga tudo.

## 2.7 Setup do worker (Python)

`scripts/setup-worker.ps1` deve executar:
```powershell
cd worker
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
# torch com CUDA 12.4 (suporta a GT 1030 / sm_61). Para instalar só a CPU, troque cu124 por cpu.
.\.venv\Scripts\python.exe -m pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -c "import torch; print('CUDA:', torch.cuda.is_available())"
```

`worker/requirements.txt`:
```
demucs==4.0.1
yt-dlp>=2025.1.1
requests>=2.32
python-dotenv>=1.0
mutagen>=1.47
soundfile>=0.12
numpy<2
praat-parselmouth>=0.4.4
stable-ts>=2.17
```
> O `yt-dlp` deve ser atualizado com frequência (`pip install -U yt-dlp`), porque o YouTube muda e ele quebra. A tela de Configurações terá um botão "Atualizar yt-dlp" (Fase 2).

## 2.8 Rodando o projeto
```powershell
# 1ª vez
copy .env.example .env      # e editar o WORKER_TOKEN
npm install
npm run worker:setup
npm run db:migrate
npm run db:seed

# dia a dia
npm run dev                 # sobe api + web + worker
# abrir no PC:      http://localhost:5173
# celular:          botão "QR code" na tela principal
```
