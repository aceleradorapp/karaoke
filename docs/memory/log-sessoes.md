# Log de sessões

> Entradas mais recentes no topo. Use `/fim-sessao` para registrar.

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
