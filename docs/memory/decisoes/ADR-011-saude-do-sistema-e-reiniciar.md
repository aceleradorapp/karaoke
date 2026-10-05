# ADR-011 — Saúde do sistema e reiniciar pelas configurações

- **Status:** aceita
- **Data:** 2026-10-05

## Contexto
O app depende de coisas externas que podem falhar sem aviso: o site das letras (LRCLIB), o YouTube (yt-dlp), a internet, o banco (XAMPP), o worker e o espaço em disco.
Hoje, quando algo falha, o efeito aparece sem explicação. Por exemplo, a música fica "sem letra" e ninguém sabe se a letra não existe ou se o site não respondeu.
O Michael pediu mensagens que ajudem a entender o que está acontecendo, e um botão para reiniciar o sistema.

## Decisão

**Página "Saúde do sistema" (`/saude`)**
- O endpoint `GET /api/system/health-report` é só do palco. Ele roda verificações e responde `{ status, checkedAt, checks[], canRestart, mode }`.
- O resultado fica guardado por 60 s; `?fresh=1` refaz na hora (botão "Verificar agora").
- Cada verificação tem status `ok | warning | error`, uma mensagem e uma **dica do que fazer**:
  - **Banco de dados:** responde a uma consulta simples. Dica: ligar o MySQL no XAMPP.
  - **Processador de músicas (worker):** online pelo heartbeat. Dica: reiniciar o sistema.
  - **Internet:** pedido curto a `https://www.gstatic.com/generate_204` (4 s). Sem internet, avisa que busca, letras e capas não funcionam.
  - **Site das letras (LRCLIB):** busca de teste (6 s), mais as músicas das últimas 24 h que ficaram sem letra porque o site não respondeu.
  - **YouTube:** versão do yt-dlp informada pelo worker, mais os downloads que falharam nas últimas 24 h. Dica: "Atualizar yt-dlp" em Configurações.
  - **Espaço em disco** na pasta `storage`: abaixo de 5 GB é aviso, abaixo de 1 GB é erro.
  - **Falhas recentes no processamento:** jobs que falharam nas últimas 24 h, agrupados pela etapa, com a última mensagem.
- **Indicador na barra superior:** um ícone ⚠ (âmbar ou vermelho) aparece só quando algo não está ok e leva a `/saude`. É verificado a cada 2 min.

**Motivo da falta de letra, por música**
- O worker passa a distinguir "letra não encontrada" de "o site das letras não respondeu".
- O motivo vai no resultado do job (`lyricsNotice`: `NOT_FOUND` ou `SITE_UNREACHABLE`) e fica gravado na música (`songs.lyricsNotice`).
- Aparece na página da música (e conta na saúde do sistema), com a dica do que fazer. Um botão "Buscar a letra de novo" ficou no backlog.

**Reiniciar o sistema**
- `npm run festa` passa a rodar um pequeno **vigia** (`scripts/supervisor.mjs`) que inicia o servidor e o worker.
- `POST /api/system/restart` (só o palco): responde, avisa as telas (`system:restarting`) e encerra o servidor com o código 75. O vigia reinicia o servidor e o worker.
- O vigia também religa sozinho um processo que cair inesperadamente, depois de 3 s.
- Só existe no modo festa (`CARAOKE_SUPERVISED=1`). No modo de desenvolvimento o botão aparece desabilitado com a explicação.
- **Na tela:** uma camada "Reiniciando o sistema… volta em alguns segundos" consulta `/api/health` até responder e então recarrega a página. Os celulares reconectam sozinhos.
- O botão fica em **Configurações → Sistema** e na página de saúde, com confirmação.
- No servidor Linux (Fase 8), o papel do vigia passa a ser do systemd.

## Consequências
- Nova coluna `songs.lyricsNotice`, novas rotas `/api/system/health-report` e `/api/system/restart` e o evento `system:restarting`.
- `npm run festa` deixa de usar o `concurrently` e passa a usar o vigia.
- As verificações externas fazem no máximo uma chamada por minuto a cada serviço.
