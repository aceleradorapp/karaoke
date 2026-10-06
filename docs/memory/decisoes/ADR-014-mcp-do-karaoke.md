# ADR-014 — MCP do karaokê com "Chave para IA"

- **Status:** aceita
- **Data:** 2026-10-06

## Contexto
O Michael quer pedir pelo chat do Claude (Desktop ou Code), por exemplo: "liste as 20 mais cantadas em karaokê nacional", "veja quais têm letra" e "importe a 1, 3 e 7". Decidido com ele em 2026-10-06:
- o MCP roda em **qualquer PC da casa**, com uma chave;
- a IA pode **buscar e ver a letra**, **importar** e **mexer na fila de processamento**;
- a IA **não** mexe na fila de cantores.

## Decisão
- **Servidor MCP próprio** no workspace `mcp/` (`@caraoke/mcp`):
  - Node 24 com `@modelcontextprotocol/sdk` (transporte **stdio**);
  - fala com a API do karaokê por HTTP: `CARAOKE_URL` e `CARAOKE_KEY` nas variáveis de ambiente.
- **Um arquivo só:** `npm run mcp:build` empacota tudo em `mcp/dist/caraoke-mcp.mjs` com o Vite (modo SSR, sem dependências externas). Não entra ferramenta nova de build.
  - O servidor publica esse arquivo em `GET /downloads/caraoke-mcp.mjs` para baixar de outro PC (é só código, sem segredo).
  - Precisa de Node no PC que roda o Claude.
- **Ferramentas** (nomes em português, que é a língua das conversas):
  - `buscar_youtube(termo, limite?)`: resultados com título, canal, duração, artista e título sugeridos, se **já está na biblioteca** e **se tem letra** (`/lyrics/check`, ADR-013);
  - `verificar_letra(artista, titulo, duracao_seg?)`;
  - `buscar_na_biblioteca(termo?, ordem?)`, que inclui as **mais cantadas** (`ordem: "mais_cantadas"`);
  - `importar_musicas([{ youtube_id, artista, titulo, duracao_seg? }])`: uma ou várias de uma vez; responde com o que entrou na fila e o que já existia. A escolha da máquina entra com o ADR-015;
  - `fila_de_processamento()`: o que está processando e na fila, com o tempo estimado (ADR-012), e as concluídas ou falhas das últimas 48 h;
  - `cancelar_processamento(job_id)` e `reordenar_fila(job_ids)`.
- **Chave para IA:**
  - Nas Configurações, seção "IA (MCP)":
    - **Gerar chave**: aparece uma vez, com botão de copiar;
    - **Trocar chave**;
    - **Revogar**.
  - No banco fica só o hash SHA-256 (setting `ai.keyHash`, fora do `GET /settings`).
  - A API aceita `Authorization: Bearer <chave>` vinda da rede. Com a chave certa, libera **só** as rotas das ferramentas: `GET /youtube/search`, `GET /lyrics/check`, `GET /songs`, `GET /songs/:id`, `POST /youtube/import`, `GET /jobs`, `GET /jobs/estimate`, `POST /jobs/:id/cancel` e `PATCH /jobs/reorder`.
  - No próprio PC do karaokê (localhost), as rotas já são livres, como no palco.
- **Ajuda na tela:** a seção mostra, prontos para copiar:
  - o comando do Claude Code (`claude mcp add karaoke -e CARAOKE_URL=… -e CARAOKE_KEY=… -- node <arquivo>`);
  - o trecho do `claude_desktop_config.json`;
  - o endereço do karaokê na rede.

## Atualização (2026-10-06)
- **Versões originais:** a primeira versão da ferramenta sugeria buscar "karaoke", e o Claude importou versões já sem voz (sem voz guia nem pontuação). Agora as instruções mandam importar só a versão **original**, e `buscar_youtube` marca com ⚠ os títulos que parecem karaokê ou instrumental (`mcp/src/versionKind.ts`).
- **Claude Desktop da Microsoft Store:** o arquivo lido é `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json`. O app regrava esse arquivo ao sair, então só se edita com ele **fechado**.
- `GET /api/ai-key` traz `localSetup` (`nodePath`, `mcpPath`, `url` 127.0.0.1): no próprio PC do karaokê não precisa de chave nem de download.

## Consequências
- Nova dependência: `@modelcontextprotocol/sdk`, só no workspace `mcp` (registrada no T-06/T-01).
- Fora de casa (claude.ai/celular) só depois da Fase 8: precisa de HTTPS e transporte HTTP.
- Quem tem a chave pode importar, cancelar e reordenar. Por isso dá para revogar a chave a qualquer momento.
