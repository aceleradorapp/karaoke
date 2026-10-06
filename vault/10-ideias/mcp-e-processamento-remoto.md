# MCP para IA + processamento em outras máquinas

> Ideia do Michael (2026-10-06). Viável; ainda sem fase. Detalhar em spec/ADR quando for priorizada.

## 1. MCP do karaokê (usar o sistema por uma IA)
Um servidor MCP que expõe o karaokê como ferramentas para uma IA (Claude Desktop, Claude Code ou outra que use MCP).

**Ferramentas previstas**
- `buscar_youtube(termo)`: resultados com título, canal, duração, se **já está na biblioteca** e **se tem letra** (sincronizada, só texto ou nenhuma).
- `verificar_letra(artista, titulo, duracao?)`: consulta o LRCLIB com a mesma lógica do worker.
- `importar(youtubeId, artista, titulo)` e `importar_varias([...])`, com a opção de escolher **onde processar** (item 2).
- `fila_de_processamento()`, `status_da_musica(id)`, `buscar_na_biblioteca(termo)`.
- `por_na_fila_de_cantores(pessoa, musica)` (opcional).

**Exemplo de uso**
"Liste as 20 músicas mais cantadas em karaokê nacional." A IA monta a lista; depois "processe a 1, 3 e 7". A IA busca cada uma, mostra se tem letra e importa só as escolhidas.

**Verificação de letra antes de importar (novo)**
- Um endpoint `GET /api/lyrics/check?artist=&title=&duration=` no backend, reaproveitando a busca do worker.
- Serve ao MCP e também à tela "Buscar no YouTube": um selo "tem letra" ou "sem letra" em cada resultado.

**A decidir**
- Onde o MCP roda: no PC do karaokê (fala com a API como o palco) ou em outro computador (precisa de um token próprio).
- Transporte: stdio (local) ou HTTP.

## 2. Processamento em outras máquinas (GPU)
O worker já pede trabalho ao servidor por HTTP (`/api/internal/jobs/claim`, token `WORKER_TOKEN`) e o claim é atômico, então várias máquinas não pegam o mesmo job.

**O que falta**
- **Modo remoto do worker:** hoje ele grava direto em `storage/biblioteca/<id>` (pasta local do servidor). Remoto, ele precisa:
  - baixar a origem pelo servidor quando a música veio de upload (as do YouTube ele baixa sozinho);
  - processar com a GPU dele;
  - **enviar os arquivos prontos** (instrumental, voz, letra, capa, melodia) por uma rota interna de upload.
- **Escolher a máquina:** cada worker tem um nome (ex.: "PC da sala", "Notebook GPU"). O job pode ser "qualquer um" ou de uma máquina específica, escolhido pela tela do sistema ou pela IA via MCP.
- **Tela da fila:** mostrar em qual máquina cada música está sendo processada e quais máquinas estão online.
- **Instalação** na outra máquina: script que cria o venv e configura `API_URL` e o token.

**Riscos e cuidados:** token por máquina (não o mesmo do worker local), tamanho dos uploads (~15 MB por música), o servidor precisa ser acessível pela rede da outra máquina (na mesma casa; fora de casa só com a Fase 8 e HTTPS).
