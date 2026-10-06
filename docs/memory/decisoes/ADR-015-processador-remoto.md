# ADR-015 — Processar músicas em outra máquina (processador remoto com pareamento)

- **Status:** aceita
- **Data:** 2026-10-06

## Contexto
O PC do karaokê processa na CPU, a ~1,1 s por segundo de música. O Michael tem outra máquina **Windows com placa NVIDIA** e quer usá-la para processar, com um **app instalável** para testar. Decidido com ele em 2026-10-06: **ZIP com instalador** (não um .exe único).

## Decisão

**Pareamento e identidade**
- **Tabela nova `workers`:** id, nome, `tokenHash`, criado em, visto por último e revogado em. O worker local continua usando o `WORKER_TOKEN` do `.env` e aparece como "Este PC".
- **Parear:**
  - Em Configurações › "Máquinas de processamento", o botão **Parear uma máquina** mostra um **código de 6 dígitos válido por 10 min** (guardado em memória).
  - O app da outra máquina pede o endereço do karaokê e o código, e chama `POST /api/workers/pair { code, name }`. A resposta é `{ workerId, token }`, e o token é gravado só na outra máquina.
  - Depois de 5 códigos errados, o pareamento fica bloqueado até gerar um novo código.
- **Rotas internas** (`/api/internal/*`): aceitam o `WORKER_TOKEN` local **ou** o token de uma máquina pareada e não revogada (pelo hash). A requisição fica sabendo qual worker é.
- **Revogar:** na mesma tela; um job em andamento naquela máquina volta para a fila.

**Modo remoto do worker** (o mesmo código Python, com `CARAOKE_REMOTE=1`)
- Trabalha numa pasta local (`%LOCALAPPDATA%\ProcessadorKaraoke\trabalho\<job>`), não na `storage/` do servidor.
- **Origem:**
  - YouTube: baixa sozinho, como hoje;
  - upload: baixa o arquivo pelo servidor (`GET /api/internal/jobs/:id/source`).
- **Ao terminar:** envia os arquivos prontos por `POST /api/internal/songs/:id/files` (multipart: instrumental, voz, letra.json, letra.original.json, letra.lrc, capa e melodia; ~15 MB) e só então chama `complete`. O servidor grava em `storage/biblioteca/<id>/`.
- **Heartbeat por máquina:** o status do worker vira uma lista. A tela da fila e a saúde do sistema mostram as máquinas online e onde cada música está processando (o `job.device` já existe, e entra o `job.workerId`).

**Escolher onde processar**
- **Coluna nova `jobs.targetWorkerId`:**
  - `null` = qualquer máquina;
  - `"local"` = Este PC;
  - ou o id de uma máquina pareada.
- O claim só entrega jobs sem alvo ou com o alvo daquele worker.
- **Onde escolher:**
  - na **fila de processamento**, cada música que espera tem o seletor "Processar em" (Qualquer uma / Este PC / nome da máquina);
  - no MCP, `importar_musicas` ganha `maquina?`.
- Se a máquina escolhida estiver offline, a música espera. A tela avisa "a máquina X está desligada" e dá para trocar para "Qualquer uma".

**App para instalar** (pasta do repositório `remote-worker/`)
- `npm run processador:pacote` gera `dist-downloads/Processador-do-Karaoke.zip`, e o servidor publica em `GET /downloads/Processador-do-Karaoke.zip`. Assim dá para baixar abrindo o karaokê no navegador da outra máquina.
- **Conteúdo do ZIP:**
  - `Instalar.cmd`, que chama `instalar.ps1`:
    - instala o Python 3.11 e o FFmpeg pelo `winget`, se faltarem;
    - cria o venv em `%LOCALAPPDATA%\ProcessadorKaraoke`;
    - instala o PyTorch **com CUDA** (índice `cu124`) e o `requirements.txt` do worker;
    - copia o código do worker;
    - cria o atalho **"Processador do Karaokê"** na área de trabalho.
  - **"Processador do Karaokê"** abre uma janela de console em português:
    - na primeira vez, pede o endereço do karaokê (mostrado nas Configurações) e o código de pareamento;
    - depois mostra o status: "Pareado com Karaokê da sala · usando NVIDIA RTX… · aguardando músicas…" e "Processando Evidências — separando voz 40%".
    - Fechar a janela para o processador.
- **Desinstalar:** apagar a pasta `%LOCALAPPDATA%\ProcessadorKaraoke` e o atalho (o `Desinstalar.cmd` vem no ZIP).

## Consequências
- Nova tabela (`workers`), nova coluna (`jobs.targetWorkerId`, `jobs.workerId`) e rotas novas (pair, source, files, gerenciar máquinas).
- O servidor precisa estar acessível pela rede da outra máquina (na mesma casa; fora de casa, só com a Fase 8).
- O instalador baixa ~3 GB (PyTorch com CUDA e modelos) na primeira vez.
- A configuração "Processamento › Dispositivo" vale para **todas** as máquinas. Com "auto", cada uma usa a sua placa NVIDIA se tiver memória suficiente. Se um dia o PC do karaokê for fixado em "CPU", a máquina com GPU também passaria a usar CPU. Fica para o backlog: dispositivo por máquina.
- **Testado em 2026-10-06** (instalação isolada nesta máquina):
  - o instalador achou o Python e o FFmpeg, instalou torch cu124 e reconheceu a GT 1030;
  - o atalho pareou, processou uma música de 39 s mandada para ele e a enviou ao karaokê;
  - a janela mostrou cada etapa em português;
  - o desinstalador removeu tudo.
  - Pegadinhas resolvidas no caminho:
    - limite de 260 caracteres de caminho do Windows (só com pastas muito fundas);
    - BOM na entrada do console;
    - o FFmpeg do winget fica fora do PATH: o instalador grava a pasta dele no lançador.
- A lógica de processamento continua uma só: o modo remoto troca só de onde vem a origem e para onde vão os arquivos.
