# Log de sessões

> Entradas mais recentes no topo. Use `/fim-sessao` para registrar.

## 2026-10-07 (17) — Fase 7I: perfis da casa × convidados (ADR-016)
**Pedido:** o perfil é só para as pessoas da casa (com playlists). Convidado só canta: é escolhido na hora ou entra pelo próprio celular. Precisa de uma área para gerenciar os convidados e o player não pode ficar poluído.
**Decidido com o Michael:**
- no player aparece só o perfil da TV + "Convidado ▾";
- excluir um convidado apaga tudo dele;
- "Limpar antigos" exclui quem não canta há 30 dias;
- no celular, casa e convidados como antes.

**Feito:**
- "Quem está usando?" e Gerenciar perfis só com os da casa; a TV deixada num convidado volta para a escolha de perfil.
- `SingerChooser` no player e no "Pôr na fila": busca, Novo convidado, Convidados (mais recentes) e Da casa.
- Página `/convidados`:
  - editar com salvamento automático;
  - tornar da casa;
  - selecionar e excluir vários;
  - limpar antigos.
- Backend: `/profiles/guests`, `/profiles/guests/stale` e `/profiles/guests/delete-many`.
- Busca de convidados no celular quando passam de 8.

**Verificado:**
- Testes: backend 468, frontend 890.
- No navegador, na TV (1366 e 390) e no celular, sem rolagem lateral.

## 2026-10-06 (16) — Ajustes: MCP no Claude Desktop, Ollama, excluir músicas
- **MCP no Claude Desktop (Microsoft Store):** o app lê `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` e regrava o arquivo ao sair. A configuração só "pega" se for gravada com o app fechado (Node pelo caminho completo e `mcp/dist/caraoke-mcp.mjs` do próprio projeto, URL 127.0.0.1, sem chave).
- **Limpeza da máquina, a pedido:**
  - Ollama desinstalado (programa, modelos de 1,5 GB, variável e PATH);
  - containers, volumes, rede e imagens do Docker do Hapvida/CodeIntelligence removidos;
  - o askbrain ficou intacto, aguardando decisão.
- **O Claude importou 6 versões karaokê** (sem voz): a dica da ferramenta pedia "karaoke". Corrigido: o MCP manda importar a original e marca versões sem voz com ⚠ (F7H-02). As 6 foram apagadas com a exclusão em lote nova (títulos conferidos no YouTube; voz separada entre −60 e −80 dB em 5 delas).
- **F7H-01/03:** "Excluir música" no topo da página da música; "Selecionar" na biblioteca para excluir várias.

## 2026-10-06 (15) — Fase 7G: selo de letra, MCP e processador remoto
**Pedido:** seguir a "ordem sugerida", com um app para instalar na outra máquina. Decidido com o Michael:
- ZIP com instalador, para Windows com NVIDIA;
- o MCP pode buscar e ver letra, importar e mexer na fila de processamento;
- o MCP roda em qualquer PC, com chave.

**Feito:**
- **F7G-01 (ADR-013):** selo "Letra sincronizada / Só o texto / Sem letra" em cada resultado do YouTube (`/api/lyrics/check`, mesmas regras do worker).
  - Achado: o LRCLIB falha ~30% das vezes de forma aleatória. Backend e **worker** passaram a tentar de novo; antes, várias importações podiam ficar "sem letra" à toa.
- **F7G-02/03 (ADR-014):**
  - Chave para IA (Bearer com hash, só nas rotas do MCP) e seção "IA (MCP)" com os comandos prontos;
  - servidor MCP `mcp/` (7 ferramentas), arquivo único baixado em `/downloads/caraoke-mcp.mjs`.
- **F7G-04/05 (ADR-015):**
  - máquinas pareadas por código de 6 dígitos (tabela `workers`, token por máquina);
  - claim e recuperação por máquina, watchdog de 2 min;
  - modo remoto do worker (baixa a origem, envia os arquivos prontos);
  - "Processar em" na fila; import e MCP com máquina.
- **F7G-06:** `remote-worker/` (Instalar.cmd, atalho, console em português) e `npm run processador:pacote`.

**Verificado:**
- MCP de verdade por stdio, como se fosse outro PC: busca com selos, "já estava na biblioteca", fila, chave errada explicada.
- Pareamento pela rede.
- Worker remoto simulado processou uma música de 39 s direcionada a ele e enviou instrumental, voz, capa e melodia ao karaokê (a música de teste foi apagada).
- Instalador rodado de verdade numa pasta isolada: instalou, pareou, processou uma música e a enviou, e o desinstalador removeu tudo.
- Testes: backend 461, frontend 880, shared 30, mcp 8, worker 219.
- F7G-07 (extensão do Chrome, opcional) ficou adiada.

## 2026-10-06 (14) — Fase 7F concluída: mudar o tom e tempo estimado
**Pedido:** mudar o tom da música e mostrar o tempo estimado na fila de processamento. Depois, seguir a "ordem sugerida" (Fase 7G), com um app para instalar na outra máquina.
**Feito (ADR-012):**
- **Tom:**
  - controle "Tom" no player (−6..+6, ↺ original, teclas `-` e `=`), salvo por música (`songs.keyShift`);
  - SoundTouch (`soundtouchjs`, LGPL) num Web Worker processa instrumental e voz, e o motor troca as faixas no mesmo ponto;
  - a pontuação acompanha o tom.
- **Fila:** `/api/jobs/estimate` (mediana do histórico por tipo de aparelho). A fila da TV e a do celular mostram "Faltam ~X", "Começa em ~X · pronta em ~Y" e "Tudo pronto em ~Z".
- Plano da Fase 7G registrado no roadmap.
**Verificado:**
- 876 testes frontend, 423 backend.
- No navegador:
  - worker com 2 faixas de 4 min, tom exato (246,9 Hz);
  - troca numa música real em ~2,4 s, retomando no mesmo ponto;
  - tom salvo e restaurado no banco;
  - fila com estimativa coerente com a taxa real (1,08 na CPU);
  - sem rolagem lateral em 390 px.

## 2026-10-05 (13) — Avatares divertidos
**Pedido:** umas 20 imagens legais e engraçadas para perfis ("ache em qualquer lugar, só faça").
**Feito:** 20 avatares do DiceBear em estilos de licença livre (Custom Avatar/Ashley Seo CC BY, Bottts/Pablo Stanley livre, Fun Emoji/Davis Uche CC BY, Croodles/vijay verma CC BY), escolhidos numa folha de contato (os tristes ficaram de fora), guardados em `frontend/public/avatars/` com créditos. Aparecem no "Quem é você?", na criação de perfis e convidados e em todo lugar que mostra avatar.
**Bug achado e corrigido:** montar o site de novo com o servidor ligado deixava a página em branco (o servidor só conhecia os arquivos do momento em que ligou) → `plugins/web.ts` agora procura os arquivos na hora (`wildcard: true`, `index.html` na raiz).
**Verificado:** 844 testes frontend, 415 backend; no modo festa, 0 imagens quebradas, sem rolagem no celular.

## 2026-10-05 (12) — Fase 7E concluída: saúde do sistema e reiniciar
**Feito (ADR-011):**
- F7E-02: relatório de saúde (`/api/system/health-report`: banco, worker, internet, LRCLIB, YouTube, disco, falhas recentes, cada um com dica do que fazer; 60 s de cache; uma segunda tentativa antes de acusar site fora do ar) e motivo da falta de letra (`lyricsNotice` NOT_FOUND/SITE_UNREACHABLE no worker e na música).
- F7E-03: vigia `scripts/supervisor.mjs` no `npm run festa` (religa quem cair em 3 s; código 75 = reiniciar tudo) e `POST /api/system/restart`.
- F7E-04: página `/saude`, ícone ⚠ na barra quando algo não está ok, seção Sistema nas configurações, tela "Reiniciando…" em todas as telas, motivo da letra na página da música.
**Verificado (F7E-05):** 413 testes backend, 840 frontend, 24 shared, 205 worker; no modo festa de verdade, 9/9: página com as 7 verificações, worker derrubado e religado pelo vigia, botão Reiniciar com TV e celular mostrando "Reiniciando…" e voltando sozinhos (servidor novo, celular ainda identificado, worker de volta).
**Achado real:** logo depois de ligar, o LRCLIB não respondeu em 6 s uma vez (depois ~1 s) → a verificação agora tenta duas vezes antes de avisar.
**Pendente:** pacote de imagens (aguardando as imagens e as respostas do Michael); botão "Buscar a letra de novo" no backlog.

## 2026-10-05 (11) — Modo festa
**Anotado para conversar:** pacote de imagens do app, botão "Reiniciar o sistema" nas configurações, mensagens de diagnóstico/painel de saúde (letras/LRCLIB, YouTube, worker, internet, disco) — em `contexto.md`.
**Feito:** `npm run festa` monta o site e sobe servidor + worker; o servidor entrega o site comprimido (brotli/gzip, `@fastify/compress`, dependência nova registrada no T-04) com cache longo para os arquivos com hash e fallback SPA; QR na porta 3333.
**Medido:** celular baixa 0,3 MB em 19 arquivos e abre em ~1–2 s (antes: 15,4 MB, 212 arquivos). Roteiros 7B (18/18) e 7C (19/19) passaram no modo festa; 397 testes backend.
**Mudança para o Michael:** a janela "Karaoke - sistema" agora roda `npm run festa`; a TV abre **http://localhost:3333**; escanear o QR de novo. Para eu programar, volto para `npm run dev`.

## 2026-10-05 (10) — Fase 7C concluída: disputas
**Antes da fase:** letra no celular ganhou botão de efeito e ajuste fino (±0,1 s) por celular, e o relógio passou a ser medido com 8 amostras e refeito a cada minuto (o Michael notou ~0,3 s de atraso). O "modo festa" (app empacotado, ~0,5 MB em vez de 15 MB no celular) ficou para depois, a pedido dele.
**Feito:**
- F7C-01/02: tabelas `competitions`, `competition_participants`, `competition_songs`; `competitionId` em pedidos e apresentações; único dos pedidos passou a incluir a disputa (migration escrita à mão, porque o Prisma pedia confirmação interativa).
- API completa, com imagem por foto ou capa de música.
- Iniciar põe os pedidos na fila por rodadas e guarda os pedidos normais; a fila e a votação usam as regras da disputa.
- Placar por média (desempate pela melhor nota) e encerramento automático quando acabam os pedidos.
- F7C-03/04: páginas `/disputas` e `/disputas/:id` (rascunho com perfis arrastados, convidado na hora, músicas por pessoa, regras salvas na hora; placar ao vivo; campeão com confete), faixa da disputa na página Próximos.
**Verificado (F7C-05):** 391 testes backend, 831 frontend, 24 shared, 205 worker; disputa-teste no navegador com 3 participantes, 19/19 (criar, foto, arrastar, convidados, regras, rodadas, chamar o próximo sozinho, notas 100/80/60, encerramento automático, pedido normal de volta, sem rolagem de 360 a 1920 px).
**Bug achado no navegador (corrigido):** com o item "Disputas", a barra superior quebrava em duas linhas em 1280/1366 px → abaixo de 1536 px a busca vira só o ícone de lupa.
**Próximos passos:** modo festa (pendente a pedido do Michael); F6-02 pausada; Fase 8 no futuro.

## 2026-10-03 (9) — Fase 7B concluída: fila v2 e letra no celular
**Antes da fase:** o player passou a ter só o botão "Efeito: ligado/desligado"; o modelo de pintar a letra foi para Configurações → Letra (o tempo continua por música, na página de sincronizar).
**Decisões (conversa com o Michael):** ADR-009 (fila v2 + letra no celular) e ADR-010 (disputas, Fase 7C). Limite de pedidos configurável; HTTPS do futuro servidor Linux via domínio próprio + Caddy/Let's Encrypt anotado na Fase 8.
**Feito:**
- F7B-02: "+ Convidado" no "Quem vai cantar esta?" e "Gerenciar perfis" no menu.
- F7B-03: settings `queue.*` (limite, TV passa do limite, aleatório, tempo para chamar) e fila `{ items, nextId }` com sorteio no servidor que evita repetir quem acabou de cantar.
- F7B-04: Adicionar pela TV (com + Convidado), "Pôr na fila" na página da música, arrastar com dnd-kit, botão Aleatório, seção Fila nas configurações.
- F7B-05: contagem "Chamando em N s" depois da nota, com Ir agora e Esperar; abre "Vez de…" sem tocar sozinho.
- F7B-06: relógio da TV (`/api/player/state`, `player:state`, `/api/system/time`), letra liberada para o celular, aba Letra sincronizada, tela acesa (Wake Lock ou vídeo mudo).
**Verificado (F7B-07):** 369 testes backend, 818 frontend, 24 shared, 205 worker; roteiro com TV + 2 celulares, 18/18 (adicionar com convidado novo, TV passando do limite, celular respeitando o limite 1, arrastar para o topo, sorteio igual em todas as telas, letra no celular igual à da TV, pausa refletida, ir votar no fim, contagem abrindo o próximo, + Convidado no player, sem rolagem de 360 a 1920 px).
**Observações:** o sistema foi reiniciado (dependência nova e pasta `public` criada); os testes tocaram músicas da biblioteca e apagaram os perfis de teste no fim.
**Próximos passos:** Fase 7C (disputas).

## 2026-10-02 (8) — Fase 7 concluída: pontuação, votação e ranking
**Pedido do Michael:** fazer a Fase 7, sem testar a pontuação com microfone de verdade.
**Feito:**
- F7-01: etapa MELODY no worker (parselmouth, ~0,3–1 s por música) e `npm run worker:melody` para as músicas antigas; as 17 ganharam melodia.
- F7-02: `PitchScorer`, detecção com pitchy e captura do microfone.
- F7-03: seção Pontuação nas configurações (modo, peso, tempo de voto, microfone, medidor, atraso com calibração por bipes).
- F7-04: votação no backend (uma por vez, timer, um voto por celular, sem voto em si mesmo, encerrar pela TV, nota final por modo e peso).
- F7-05: palco com medidor ao vivo, tela de votação e nota animada com confete.
- F7-06: `/m/votar` abre sozinha, quem cantou vê "É a sua vez!", volta para a aba anterior depois da nota.
- F7-07: API e tela de ranking (pódio, quem mais cantou, músicas mais cantadas, "Estrela do karaokê do mês", filtro "Só a família").
**Verificado (F7-08):** 350 testes backend, 798 frontend, 24 shared, 205 worker, typecheck ok; festa-teste no navegador com TV + 3 celulares, 29/29 (votação abre sozinha, contagem ao vivo, encerrar → 90, tempo esgotado → 60, nota no histórico, ranking e filtro, sem rolagem de 360 a 1920 px). O medidor foi conferido com o microfone falso do Chromium; **sem teste com microfone de verdade** (decisão do Michael).
**Bugs achados no navegador (corrigidos):** ranking com rolagem em 360 px (seções do grid sem `min-w-0`); a afinação não ligava se o "Começar" fosse clicado antes das configurações carregarem (agora o player garante as configurações antes de abrir o microfone).
**Decisões/desvios:** o microfone usa um `AudioContext` próprio (não o do motor); um semitom inteiro fora dá 95 com a fórmula do documento (a expectativa escrita era 75–85): calibrar quando houver teste com microfone; "Rei/Rainha do mês" virou "Estrela do karaokê do mês" (nome neutro); rota nova `POST /performances/:id/voting/close`.
**Observação:** os roteiros tocaram músicas de teste (soma no `playCount`); perfis de teste apagados e configurações restauradas no final.
**Próximos passos:** testar com microfone de verdade quando der (calibrar a curva); F6-02 continua pausada; Fase 8 é para o futuro.

## 2026-10-02 (7) — Fase 5B concluída: convidados no celular e fila de cantores
**Pedido do Michael:** o convidado escolher pelo celular o nome dele e as músicas que vai cantar; a TV com uma fila de cantores. Respostas padrão adotadas (ele pediu "se organize da melhor forma"): o celular cria convidado; ranking com família e convidados juntos e filtro "Só a família"; ninguém vota em si mesmo (as duas últimas valem para a Fase 7).
**Feito:** ADR-008 e documento técnico (F5B-01); backend: celular lista perfis e cria convidado (sempre convidado, tema padrão), importação grava quem pediu (F5B-02); tabela `sing_requests`, `/api/sing-queue`, limite de 3 pedidos por pessoa, `singQueue:changed`, `requestId` em `POST /performances` (F5B-03); celular: "Quem é você?", aba Músicas com "Cantar", "Quero cantar esta" na importação, aba Fila com Próximos + Preparando (F5B-04); palco: página Próximos (chamar, subir, descer, tirar), contador na barra, faixa "Vez de…" no início, player "Vez de Ana! 🎤" e "Chamar o próximo" no fim (F5B-05).
**Verificado (F5B-06):** 322 testes backend, 749 frontend, 24 shared, 196 worker, typecheck ok; roteiro no navegador com palco + 2 celulares, 37/37 (identidade, limite, ordem ao vivo, reordenar, tirar só o próprio pedido, chamar, pedido sai ao começar, fim → próximo, perfil apagado → "Quem é você?", sem rolagem horizontal de 360 a 1920 px).
**Bugs achados só no navegador (corrigidos):** a TV não via o convidado recém-criado no celular (lista de perfis em cache) → novo evento `profiles:changed`; o botão "Quero cantar" cortava os títulos no celular → botão compacto "Cantar" e título em até 2 linhas; títulos iguais de artistas diferentes deixavam o botão ambíguo → o nome acessível inclui o artista.
**Observação:** o roteiro tocou uma música de teste até o fim (soma 1 no `playCount` dela) e apagou os perfis de teste ao final.
**Próximos passos:** Fase 7 (pontuação, votação pelo celular usando a identidade, ranking).

## 2026-10-02 (6) — Fase 5 concluída
**Teste com celular real (Michael):** entrou pelo QR, buscou, a prévia tocou (endereço `nip.io`) e importou. Antes, o Vite tinha ficado com a configuração antiga (sem `allowedHosts`) porque o arquivo mudou durante a troca de branch do merge; resolvido fazendo o Vite reler o `vite.config.ts`.
**Sobre a demora (medido):** cada busca nova no YouTube leva 3,5–4,5 s (consulta via yt-dlp; repetida fica em cache e sai em 0,03 s); o "Importar" só registra (milissegundos); o tempo longo é o processamento (separar a voz na CPU ≈ 1,5× a duração + letra/palavras ~1 min); o modo de desenvolvimento deixa a 1ª abertura do celular mais lenta (a versão final, Fase 8, empacota tudo).
**Próximos passos:** Fase 7 (pontuação e ranking, inclusive a votação pelo celular). Ideia anotada: mostrar na fila uma estimativa de tempo restante.

## 2026-10-02 (5) — Teste com celular real: prévia do YouTube e tela branca
**Relato do Michael:** na 1ª tentativa a busca ficou carregando e a tela ficou branca; na 2ª, buscou e importou, mas a prévia mostrou só "assistir no YouTube".
**Diagnóstico:** a API de busca responde normalmente pela rede (2,3 s) e o fluxo funciona também no motor do Safari (WebKit). A prévia: o YouTube recusa o player embutido quando a página vem de um endereço IP (`http://192.168...`) e aceita nomes (`localhost`, `*.nip.io`); nenhuma variação do iframe contorna (sem referrer dá "Erro 153"). A tela branca não se repetiu; não deu para ver o erro no aparelho.
**Feito:** o QR passa a usar `http://<ip>.nip.io:5173/m?c=...` (o IP puro fica como "Outro endereço"); Vite libera `.nip.io` e `.sslip.io` em `allowedHosts`; a prévia ganhou o link "Abrir no YouTube" no mesmo trecho; o app ganhou um "para-raios" de erros (ErrorBoundary) que mostra "Algo deu errado", a mensagem e "Recarregar" em vez de tela branca.
**Verificado:** testes (backend 302, frontend 707, shared 24); pelo endereço novo, num celular emulado, a prévia toca e não há erros.
**Atenção:** o nome `nip.io` depende de DNS da internet; sem internet ou com roteador que bloqueia respostas com IP privado, use o endereço por IP (a prévia não toca, mas o resto funciona e há o link "Abrir no YouTube").

## 2026-10-02 (4) — Fase 5: celular e QR code (falta o teste com celular real)
**Feito:** F5-01 API do código de acesso (`GET /system/access` com os endereços da rede, `POST /system/access/regenerate` que avisa e desconecta os celulares, `GET /system/access/check`) e autenticação do Socket.IO pelo código; F5-02 modal do QR code na TV (fundo branco, endereço, código, outra rede, código novo com confirmação); F5-03 página `/m` que valida o código, layout com abas e código em todas as requisições (API, upload e socket); F5-04 abas Buscar (YouTube), Enviar e Fila (somente leitura, ao vivo). A aba Buscar lembra a última pesquisa.
**Segurança:** pelo proxy do Vite o endereço confiável é o **último** do `X-Forwarded-For` (o celular não consegue se passar pelo PC). Capas liberadas ao celular só com o código no endereço (`?c=`), porque `<img>` não manda cabeçalho; áudio e letra continuam bloqueados.
**Desvios do documento:** detecção do modo celular por `/m` exato ou `/m/...` (o `startsWith('/m')` do documento pegaria `/musica`); o código novo também desconecta os sockets dos celulares; `NODE_ENV` entrou no `.env` (define a porta do endereço do QR); `socket.io-client` virou dependência de desenvolvimento do backend (testes do socket).
**Verificado:** backend 302, frontend 704, shared 24, worker 196; typecheck e build. No sistema real pelo IP da rede: celular sem código 401, com código 200, forjando 127.0.0.1 401; socket idem. Ponta a ponta com a TV e um iPhone 13 emulado entrando pelo IP: 26 de 26 (QR, entrada, busca, importar sem perfil, fila ao vivo, capas, bloqueios, 360/390/430 px, código novo pedindo para escanear de novo, endereço antigo inválido, QR novo funcionando). Firewall do Windows: Node.js liberado no perfil "Pública" (o da rede atual).
**Bug achado só no navegador (corrigido):** voltar para a aba Buscar perdia a pesquisa.
**Atenção:** um commit da F5-04 saiu com um teste antigo de mídia falhando (a regra das capas mudou); corrigido no commit seguinte.
**Pendências:** F5-05 com um celular de verdade (o Michael); votação pelo celular é da Fase 7 (o Michael perguntou; pode ser antecipada).

## 2026-10-02 (3) — Fase 6 encerrada; pronto para a Fase 5
**Feito:** sistema reiniciado (havia 5 cópias antigas do `npm run dev` rodando ao mesmo tempo; agora roda uma só, numa janela do PowerShell chamada "Karaoke - sistema"). O Michael baixou músicas novas e aprovou a sincronia: "Ela É Demais" 39/39 linhas com palavras, "Flores" 27/37 (editada à mão). F6-06 marcada como verificada; Fase 6 dada como concluída (só a F6-02, transcrever músicas sem letra com o Whisper, ficou pausada).
**Atenções:** o worker não recarrega o código sozinho (reiniciar o `npm run dev` depois de mexer no worker); "Anna Júlia" ficou sem palavras por ter sido baixada antes do reinício; as músicas atuais são de teste e o Michael vai apagar tudo e recriar ao final.
**Próximos passos:** Fase 5 (celular e QR code), começando pela F5-01, em uma branch nova a partir de `develop`. O Michael vai trocar de modelo para seguir o roadmap.

## 2026-10-02 (2) — Tempos reais por palavra (Opus)
**Pedido do Michael:** resolver de vez o tempo de pintar a letra (a música entra no momento certo, mas o amarelo não acompanha o canto), usando "À Sua Maneira" como referência; as outras músicas são só de teste e serão apagadas depois, então não é preciso realinhar a biblioteca.
**Solução:** duas camadas — marcos (começo de cada linha pela voz, já existia) e, dentro de cada linha, **alinhamento forçado** do texto com a voz isolada (MMS do `torchaudio`, mesmo método do WhisperX, sem reconhecer fala), só na janela da linha. A vogal segurada fica dentro da palavra; o fim de cada palavra é cortado onde a voz para. Descartado: ancorar no BPM (a voz isolada é prova direta e o cantor não segue o compasso à risca) e o Whisper para letras com texto (lento e erra muito fora da janela).
**Feito (F6-05):** `worker/caraoke_worker/word_alignment.py` + integração no passo da letra (respeita `processing.autoAlign`), comando `python -m caraoke_worker.realign <pasta>`, página de sincronizar preservando as palavras ao mover/esticar linhas (`lib/lyrics/wordTiming.ts`) e marcas das palavras na linha do tempo. Detalhes em `docs/memory/sincronizacao-da-letra.md` §14.
**Verificado:** pytest 196, frontend 666, typecheck e build. Música real: 16 de 16 linhas com palavras em 71 s de CPU; as pausas internas batem com a voz (diferença ≤ 0,15 s); no Chromium cada palavra começa a pintar no seu tempo com erro ≤ 0,05 s (10 de 10 checagens).
**Bug achado no caminho:** a palavra segurada antes de uma pausa ia até a borda da janela porque a voz da linha seguinte entrava nela; o corte agora para no primeiro silêncio ≥ 0,25 s.
**Estado:** "À Sua Maneira" ficou com palavras alinhadas e salva. Na primeira importação depois disso, o worker baixa o modelo MMS (~1,2 GB, ~30 s).
**Próximos passos:** o Michael ouvir e dizer se ficou perfeito; Whisper só para transcrever músicas sem letra (F6-02, pausado); Fase 5.

## 2026-10-02 — Efeito da letra no player (modelos, liga/desliga e tempo de preenchimento)
**Pedido do Michael:** a música ficou sincronizada e começa no momento certo, mas o tempo que a letra leva para ir ficando amarela não bate. Quer ligar/desligar o efeito no player, escolher o modelo (gravado para sempre), ter um modelo que pinta palavras inteiras e controlar quando termina de pintar (o começo não muda), no player e na página de sincronizar; a pré-visualização "Como vai aparecer no karaokê" deve ficar logo abaixo da linha do tempo; novos modelos poderão ser pedidos depois.
**Feito (F6-07):**
- Registro de modelos (`LYRICS_EFFECTS`): `smooth` "Preencher aos poucos" (o de antes, padrão) e `words` "Palavra por palavra" (cada palavra inteira na vez dela, a primeira ao começar a linha). Para criar outro: id em `shared/src/lyricsEffects.ts` + função no registro.
- Player: linha de controles com botão "Efeito: ligado/desligado" (tecla E; desligado = a linha inteira colorida ao começar), combo do modelo e "Tempo" (−/+ de 5 em 5, controle deslizante 20–150%, voltar a 100%). O modelo e o liga/desliga ficam nas configurações do app (valem sempre); o tempo é **por música** (coluna nova `songs.fillPercent`, padrão 100, migration `song_fill_percent`) e salva sozinho.
- Página de sincronizar: pré-visualização logo abaixo da linha do tempo, com os mesmos controles (e o aviso de salvando).
- Letra do player passou a ser dividida em palavras (cada uma com o seu preenchimento).
**Verificado:** typecheck, build e testes (shared 24, backend 271, frontend 656). No Chromium com a música real: 43 de 44 checagens na 1ª rodada completa (a restante era um estouro de 14 px no celular do controle de Tempo, corrigido e conferido). Medido tocando: "aos poucos" termina em 5,84 s para uma linha de 5,89 s; com 50% termina em 2,88 s (metade); "palavra por palavra" só tem 0 e 1, em ordem (1→2→…→9 palavras) e termina antes do fim da linha; efeito desligado pinta tudo ao começar; tecla E; modelo e tempo continuam depois de recarregar.
**Bugs achados só no navegador (corrigidos):** controle de Tempo largo demais em 375 px na página de sincronizar. Também: o elemento `<output>` tem papel "status" e confundia com o indicador de carregamento (trocado por texto comum; o valor é anunciado pelo próprio controle deslizante).
**Decisões:** o tempo é por música porque o erro vem do fim das linhas, que varia de música para música (a escolha de modelo e liga/desliga é global); a coluna nova foi criada sem perguntar por ser aditiva e ter padrão 100; os valores iniciais ficaram: efeito ligado, "Preencher aos poucos", 100%.
**Pendências:** F6-02 (Whisper, precisa de coluna de tipo de job), F6-05 (palavra a palavra com tempos reais, depende do Whisper), Fase 5.

## 2026-10-01 (noite, 7) — Fase 6 (parte 1): sincronia das letras com a voz
**Pedido do Michael:** inverter as fases (6 antes da 5) porque a sincronia das músicas decide o sucesso do app.
**Experimento (Whisper `small` na CPU, voz de "À Sua Maneira"):** alinha bem a maioria das linhas (primeira linha em 34,75 s, igual ao início da voz), mas leva ≈ 9 min 40 s para 4:18 de música (≈ 2,3× a duração) e erra onde o texto não bate com o canto (uma linha ficou 44 s fora). Já o método por voz abaixo roda em segundos e coincidiu com o Whisper em 12 de 16 linhas (nas outras o Whisper é que errava).
**Feito (F6-01, F6-03, F6-04):**
- Worker: atraso global ajustado com **todas** as linhas (busca ±60 s, distância truncada) + cada linha imantada ao início de frase da voz mais próximo (tolerância 1,8 s, sem cruzar linhas); guarda `letra.original.json`; fonte `ALIGNED`.
- API: `PUT /songs/:id/lyrics` (guarda a original na 1ª edição, zera o atraso, fonte MANUAL), `GET .../lyrics/original`, `POST .../lyrics/restore`.
- Front: nova página `/musica/:id/sincronizar` com linha do tempo (voz, inícios de frase, faixas arrastáveis pelo corpo e pelas bordas), "Alinhar tudo com a voz" no navegador (mesmo algoritmo do worker, diferença ≤ 0,05 s), marcar tocando (desconta 0,15 s), ímã por linha, editar texto, inserir/apagar linha, mover tudo, desfazer/refazer (Ctrl+Z/Y), voltar ao original, auto-save; letra sem tempos pode ser distribuída pela música ou marcada tocando.
**Verificado:** pytest 159, backend 268, frontend 599, typecheck e build; no Chromium com a música real, 37 de 38 checagens (a restante é o 404 esperado da consulta do original, que o navegador conta como erro). Os tempos salvos pelo navegador batem com os do worker; no player a 4ª linha entra logo depois de 60,7 s. 375/768/1366/1920 px sem rolagem horizontal.
**Estado da música de teste:** "À Sua Maneira" ficou alinhada e salva (fonte MANUAL, atraso 0), com a letra original do LRCLIB guardada para "Voltar ao original".
**Decisões:** o alinhamento por voz roda no navegador (resultado na hora, desfazível, sem fila) e no worker na importação; arrastar não leva as linhas seguintes por padrão (caixa "Mover leva as linhas seguintes"); a API de restaurar existe mas a tela usa o original como passo desfazível; roadmap da Fase 6 reescrito.
**Pendências (dependem de decisão do Michael):** F6-02 Whisper (alinhar texto sem tempos e transcrever) exige um job "só de letra" e portanto uma coluna nova no banco (tipo do job); ≈ 10 min de CPU por música; F6-05 exibição palavra a palavra (precisa das palavras do Whisper).
**Próximos passos:** decidir F6-02/F6-05; depois Fase 5 (celular e QR code).

## 2026-10-01 (noite, 6) — Fase 4 concluída (playlists, favoritas e histórico)
**Feito:** F4-01 a F4-06 — API de playlists (CRUD, itens, reordenar, `containsSong`, nome único por perfil), favoritos por perfil, histórico paginado; seletor de playlists (modal), botões de coração e de playlist nos cards, no destaque e no detalhe; `/playlists` e `/playlists/:id` (renomear com auto-save, reordenar por arrastar ou setas, tirar música e excluir com confirmação, cantar tudo e aleatório); player em sequência (fim da música → "Próxima música", mesma pessoa já escolhida, pula músicas não prontas, embaralhar com semente repetível na URL); `/favoritas` e `/historico`. Também: pedido da página avançada de sincronização registrado (SPEC-001, F6-06) e música "À Sua Maneira" reajustada para +15,75 s (melhor atraso fixo: 13 de 16 linhas a menos de 0,5 s da voz; 3 linhas ficam ~1,2 s fora porque os tempos da letra vêm de outra gravação).
**Verificado:** typecheck, testes (shared 24, backend 245, frontend 523, worker 141), build. No Chromium com dados reais: 47 checagens (♥, seletor criando e marcando, nome repetido, renomear, reordenar, tirar com confirmação, cantar tudo/aleatório com áudio real, próxima música, histórico, excluir, 375/768/1366/1920 px sem rolagem horizontal). Dados de teste apagados depois (playlists, favoritas, apresentações, contadores).
**Bugs achados só no navegador (corrigidos):** (a) o link do título do card (`after:inset-0`) cobria os botões de ♥, playlist e cantar do card, então clicar neles abria o detalhe; os botões saíram de dentro da capa (que tem transform e cria outro nível de empilhamento); (b) botões de ícone da fila e da playlist ficavam com o ícone minúsculo porque `px-0` perdia para o `px-5` do Button: criado `size="icon"`.
**Decisões/desvios:** nome de playlist único por perfil, sem diferenciar maiúsculas (409 `PLAYLIST_NAME_TAKEN`); criar playlist pelo seletor já adiciona a música; remover música da playlist pede confirmação (como na fila); a API de histórico (`GET /profiles/:id/history`) ficou na F4-05.
**Pendências/atenções:** o celular ainda não acessa playlists/favoritas (rotas liberadas só na Fase 5, se fizer sentido); o 409 do teste de nome repetido aparece como "erro" no console do navegador (esperado).
**Próximos passos:** Fase 5 (celular e QR code).

## 2026-10-01 (noite, 5) — Sincronização da letra com a voz
**Problema:** a letra do LRCLIB entrava ~15,5 s antes da voz em "À Sua Maneira" (o vídeo do YouTube tem introdução maior que a gravação da letra), e o ajuste manual era limitado a ±5 s.
**Feito (F3-12 a F3-15):** (1) o worker mede onde a voz começa na faixa separada (numpy + FFmpeg) e grava o atraso da letra ao concluir o job (só aplica diferenças entre 1 s e 60 s); (2) limite do atraso subiu para ±60 s; (3) nova tela `/musica/:id/sincronizar`: linha do tempo com a onda da voz e as linhas da letra arrastáveis, "Alinhar com a voz", "Ouvir e marcar" (descontando 0,15 s de reação), passos de 5 s a 0,01 s, zoom, prévia de como aparece no karaokê, atalhos e auto-save; (4) link "Sincronizar a letra" no detalhe da música.
**Verificado:** pytest 141, backend 203, frontend com testes novos; no Chromium com a música real: a análise achou a voz em 34,8 s (letra em 19,2 s), o alinhamento aplicou +15,51 s, o arraste, os passos, o recarregar e o player (antes da voz a letra não entra; com a voz cantando aparece a 1ª linha) funcionaram; 375/768/1366/1920 px sem rolagem horizontal.
**Bugs achados só no navegador (corrigidos):** (a) a URL da letra muda a cada salvamento (`?v=updatedAt`), o que fazia a tela de sincronizar remontar e recarregar o áudio a cada auto-save (e o player piscar a letra): a consulta da letra agora mantém o dado anterior; (b) lista "Linha para marcar" esmagada em 375 px; (c) detecção da voz começava até 2 passos antes (corrigido no worker e no front).
**Decisões:** a música de teste ficou alinhada com +15,51 s (era o objetivo). O alinhamento só olha o começo da voz: vale para deslocamento fixo; versões com cortes no meio dependem do alinhamento por IA da Fase 6.
**Pendência:** o job completo (baixar, separar, buscar letra e alinhar) com uma música nova não foi rodado de ponta a ponta (a separação leva ~6 min na CPU); as partes foram testadas por unidade e a detecção foi conferida no arquivo real.
**Próximos passos:** Fase 4 (playlists, favoritas e histórico).

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
