# Sincronização da letra — guia de passagem

> Escrito em 2026-10-02 para quem for continuar este assunto (por exemplo, o Opus). Leia este arquivo inteiro antes de mexer em qualquer coisa de letra, alinhamento ou efeito de pintar a letra. É o contexto que não está no código.

## 1. Por que isso importa

O Michael decidiu que **a sincronia da letra com a voz é o que decide o sucesso do app** ("estou mais preocupado com a sincronia das músicas, depois disso o sucesso do meu app"). Por isso a **Fase 6 passou na frente da Fase 5** (celular e QR code). Tudo aqui foi feito testando com **uma música real**: "À Sua Maneira (De Música Ligeira)", Capital Inicial, id `cmupw7a4q0001u0v0facactnd` (4:18, YouTube, letra do LRCLIB).

## 2. O problema que começou tudo

A letra do LRCLIB vem sincronizada com **outra gravação**. No vídeo do YouTube a introdução era ~15,5 s mais longa, então a letra entrava ~15,5 s antes da voz. O ajuste manual (`lyricsOffsetMs`) ficava limitado a ±5 s. Mesmo depois de corrigir o atraso fixo, algumas linhas continuavam ~1,2 s fora (os tempos entre linhas também diferem entre gravações).

**Resolvido em 2026-10-02 (seção 14):** a música já entrava no momento certo, mas o tempo de pintar não batia porque o fim de cada linha vinha do LRC e as palavras eram repartidas por número de letras (uma vogal segurada quebrava tudo). Agora cada palavra tem o seu tempo real, medido na voz isolada por **alinhamento forçado** (MMS do `torchaudio`) dentro da janela de cada linha.

## 3. O que está pronto (tudo verificado e mesclado em `develop` e `main`)

| Parte | Onde | O que faz |
|---|---|---|
| Análise da voz (Python) | `worker/caraoke_worker/vocal_onset.py` | Decodifica `voz.mp3` com FFmpeg (8 kHz mono), calcula o envelope (RMS a cada 50 ms), acha o primeiro som da voz e os **inícios de frase** (pausa ≥ 0,5 s). Referência de volume = percentil 90 dos quadros audíveis; limite = 15% disso |
| Alinhamento (Python) | `worker/caraoke_worker/lyric_alignment.py` | `fit_shift`: acha o melhor atraso global (busca ±60 s, passo 0,05 s) usando **todas** as linhas e distância truncada em 2 s; `snap_starts`: cada linha vai para o início de frase mais próximo (tolerância 1,8 s, sem cruzar linhas nem repetir frase). Fallback: primeiro som da voz (só se a diferença estiver entre 1 e 60 s) |
| Passo da letra no worker | `worker/caraoke_worker/steps/lyrics.py` | Busca no LRCLIB, alinha com a voz, grava `letra.json` (fonte `ALIGNED`) e guarda o original em `letra.original.json`; `lyricsOffsetMs` volta a 0 |
| Alinhamento (navegador) | `frontend/src/lib/lyrics/alignment.ts` + `vocalAnalysis.ts` | **Porte idêntico** do algoritmo do worker. Diferença máxima medida contra o worker: 0,05 s. Usado pelo botão "Alinhar tudo com a voz" |
| API da letra | `backend/src/modules/songs/lyrics.ts` (+ rotas em `routes.ts`) | `PUT /api/songs/:id/lyrics` (guarda o original na 1ª edição, zera o atraso, fonte `MANUAL`), `GET .../lyrics/original`, `POST .../lyrics/restore` |
| Página de sincronizar | `frontend/src/features/sync/*` | Rota `/musica/:id/sincronizar`. Ver seção 5 |
| Efeito de pintar a letra | `frontend/src/lib/lyrics/effects.ts`, `features/player/{LyricsView,LyricsEffectControls,useLyricsEffect}` | Ver seção 6 |

Testes ao final do trabalho: shared 24, backend 271, frontend 656, worker 159 (todos passando), typecheck e build limpos.

## 4. Como os dados ficam guardados

Em `storage/biblioteca/<songId>/`:
- `letra.json` — `LyricsDoc` (`shared/src/lyrics.ts`): `{version, source, synced, language?, lines:[{start,end,text,words?}]}` em segundos.
- `letra.lrc` — gerado a partir de `letra.json` quando `synced`.
- `letra.original.json` — a letra **como veio** (LRCLIB), criada na primeira alteração ou no alinhamento do worker. Nunca é sobrescrita. Serve ao "Voltar ao original".
- `voz.mp3` / `instrumental.mp3` — saída do Demucs.

No banco (`songs`): `lyricsSource` (`NONE|LRCLIB|PLAIN|ALIGNED|TRANSCRIBED|MANUAL`), `lyricsOffsetMs` (atraso global, ±60 s; o player ainda o usa nos botões de atraso), `lyricsNeedsReview`, `fillPercent` (seção 6).

**Regra importante:** quando o editor grava, os tempos já saem com o atraso antigo **embutido** nas linhas e `lyricsOffsetMs` vira 0. Ao abrir a página, as linhas aparecem já deslocadas pelo atraso que a música tinha, e **nada é gravado só por abrir**.

O endereço da letra (`lyricsUrl`) leva `?v=<updatedAt>` e **muda a cada gravação** da música. Por isso `useLyricsQuery` usa `placeholderData: keepPreviousData`; sem isso a tela de sincronizar remontava (e recarregava o áudio) a cada salvamento. Há teste de regressão.

## 5. A página de sincronizar (`features/sync`)

- `LyricsSyncPage.tsx` monta tudo; `useLyricsEditor.ts` guarda as linhas com **histórico** (`lib/useHistory.ts`, 100 passos, um arraste = um passo) e **auto-save** (`lib/useAutoSave.ts`, 800 ms, só grava com tempos válidos e texto em todas as linhas).
- `lineEditing.ts`: operações puras (mover linha, mudar começo/fim, marcar começo empurrando as seguintes, mover tudo, inserir/apagar, distribuir uniformemente, validar para salvar). Invariantes: ordem crescente, distância mínima de 0,3 s entre linhas, `end` entre o `start` e o próximo `start`, centésimos de segundo.
- `SyncTimeline.tsx`: canvas (onda da voz amarela, triângulos brancos = inícios de frase, faixas = linhas). Arrastar o corpo move a linha; as bordas mudam começo/fim; tocar na onda posiciona; zoom 10/20/40/80 s.
- Ferramentas: "Alinhar tudo com a voz", ímã por linha, "Voltar ao original", caixa "Mover leva as linhas seguintes", "Marcar tocando" (desconta 0,15 s de reação; Enter marca, Backspace volta), mover a letra inteira, editar texto, inserir/apagar linha, desfazer/refazer (Ctrl+Z/Ctrl+Y).
- Atalhos: espaço toca/pausa, ← → ±5 s, ↑ ↓ trocam de linha, `[` `]` ±0,1 s na linha (Shift: 1 s), Enter/M marca.
- Letra **sem tempos** (`synced:false`): mostra "Marcar tocando a música" ou "Distribuir pela música e ajustar" (distribui entre o 1º som da voz e o fim da voz).
- O painel "Como vai aparecer no karaokê" fica **logo abaixo da linha do tempo**, com os controles do efeito.

## 6. O efeito de pintar a letra

Pedido do Michael: ligar/desligar no player; escolher o modelo (gravado para sempre); um modelo que pinte **palavras inteiras**; controlar **quando termina** de pintar sem mexer em **quando começa**; mesmos controles na página de sincronizar; poder pedir novos modelos depois.

- Registro de modelos: `frontend/src/lib/lyrics/effects.ts` (`LYRICS_EFFECTS`). Cada modelo recebe `{line, tokens, time, fillPercent}` e devolve o progresso (0..1) de cada palavra; o `LyricsView` só escreve isso em `--p` (CSS `.lyric-fill` em `styles/index.css`). **Para criar um modelo novo:** acrescentar o id em `shared/src/lyricsEffects.ts` (`LYRICS_EFFECT_IDS`) e implementar no registro (o TypeScript obriga). A lista do combo sai do registro.
- Modelos atuais: `smooth` "Preencher aos poucos" (padrão; barra contínua repartida entre as palavras pelo nº de letras) e `words` "Palavra por palavra" (cada palavra inteira quando chega a sua parte; a 1ª ao começar a linha). Se a linha tiver `words` com tempos reais (Whisper, futuro), usam-se esses tempos.
- **Tempo de preenchimento** `fillPercent` (20–150, padrão 100): tempo nominal = `start + (t − start) × 100 / fillPercent`; 100 = termina em `end`; menos = termina antes; mais = depois. É **por música** (coluna `songs.fillPercent`, migration `song_fill_percent`, PATCH `/api/songs/:id`).
- **Liga/desliga** e **modelo** são **globais**: chaves `player.lyricsEffectEnabled` e `player.lyricsEffect` em `/api/settings` (`backend/src/modules/settings/defaults.ts`, schema em `shared/src/schemas.ts`). Desligado = todas as palavras com `--p:1` assim que a linha começa. Tecla **E** no player.
- Hooks: `useLyricsEffectChoice` (global, otimista) e `useSongFillPercent` (por música, auto-save 600 ms).

## 7. Números medidos (para comparar depois)

Música de teste, voz separada:
- Voz começa em ~34,75 s; primeira linha do LRCLIB em 19,24 s → atraso global ajustado com todas as linhas: **+15,80 s** (o "primeiro som" dava +15,51 s; o melhor fixo é ~+15,75 s).
- Linhas alinhadas (s): 34.75, 43.25, 51.55, 60.70, 69.45, 78.10, 104.25, 112.85, 121.75, 130.35, 156.70, 165.35, 173.85, 182.55, 191.55, 200.15 (worker e navegador batem em ≤ 0,05 s).
- Com um atraso fixo de +15,75 s, 13 de 16 linhas ficam a ≤ 0,5 s da voz; 3 ficam ~1,2 s fora → motivo do ímã por linha.
- **Whisper `small` na CPU** (i5-4460, 8 GB, GT 1030 2 GB): alinhar o texto na voz levou **582 s para 258 s de áudio (~2,3× a duração)**. Acertou a maioria das linhas (1ª linha em 34,75 s) mas errou onde o texto não bate com o canto (uma linha ficou 44 s fora; outras ~1,5–3 s adiantadas porque o começo da palavra fica "colado" no fim da anterior). Os segmentos do Whisper **não respeitam as quebras de linha**: é preciso remontar as linhas contando as palavras (109 palavras = 109 palavras do texto, deu certo).
- Efeito medido tocando: "aos poucos" termina em 5,84 s para uma linha de 5,89 s; com 50% em 2,88 s; "palavra por palavra" pinta as 9 palavras em ordem e a última antes do fim da linha.

## 8. O que falta e caminhos sugeridos

> Atualizado em 2026-10-02: o item 1 foi resolvido com tempos por palavra (seção 14). O Whisper (item 2) deixou de ser necessário para letras que já têm texto; continua útil só para transcrever músicas sem letra nenhuma.

1. **(Resolvido — ver seção 14)** Fazer o tempo de pintar **bater com o canto**. Ideias, da mais barata à mais completa:
   - Derivar o `end` de cada linha da **atividade da voz** (fim do trecho cantado que começa no `start` da linha), em vez de herdar do LRC. Os dados já existem (envelope e inícios de frase em `vocalAnalysis.ts` / `vocal_onset.py`; falta o "fim de frase"). Pode entrar no alinhamento (worker e navegador, mantendo paridade) e/ou como botão "Ajustar o fim das linhas pela voz".
   - `fillPercent` por linha, ou arrastar o **fim** da linha na linha do tempo (já existe: borda direita) e usar esse `end` como fim do preenchimento (o modelo já usa `end`).
   - **Tempos por palavra** (F6-02 + F6-05): alinhar o texto com o Whisper para obter `words` reais; os dois modelos de efeito já usam os tempos reais quando existem.
   - Novos modelos de efeito (basta registrar).
2. **F6-02 Whisper (`steps/align.py`)** — para letras sem tempos ou casos difíceis. Exige um **job só de letra**, portanto uma **coluna nova em `jobs`** (tipo do job). Isso é mudança de banco além do previsto: o Michael ainda não respondeu se autoriza. Custo ~10 min de CPU por música, em segundo plano. Plano do documento técnico: `docs/tecnico/05-worker-processamento.md` §5.8 (stable-ts já está instalado no venv do worker). Na prática: texto → `model.align(voz.mp3, texto, language="pt")` → remontar as linhas pela contagem de palavras → ímã nos inícios de voz para corrigir o "colado no fim da anterior".
3. **F6-05** Exibição palavra a palavra com tempos reais (depende do item 2).
4. SPEC-001 (`docs/specs/001-sincronizacao-avancada.md`): RF4 (IA) e RF7 (palavra a palavra) pendentes; RF5/RF6/RF8 parciais (passos só até 0,1 s; sem dividir/juntar linha; sem histórico de versões além do original e do desfazer).
5. A API `POST /songs/:id/lyrics/restore` existe e tem teste, mas a tela usa o original como passo desfazível (`GET original` + trocar as linhas).
6. Depois da Fase 6: **Fase 5** (celular e QR code). O celular ainda não acessa playlists nem favoritas.

## 9. Decisões tomadas e o porquê

- **Alinhamento por voz no navegador *e* no worker** (porte idêntico): no navegador dá resultado imediato, desfazível e sem fila; no worker corrige já na importação.
- **Ímã por início de frase, não Whisper, como padrão:** roda em segundos e coincidiu com o Whisper onde o Whisper acerta; o Whisper fica para onde não há tempos.
- **Letra gravada com o atraso embutido** (e `lyricsOffsetMs` = 0): o editor trabalha com tempos finais; o atraso global continua existindo para os botões de atraso do player.
- **`fillPercent` por música, modelo e liga/desliga globais:** o erro do fim das linhas varia de música para música.
- **Nome de playlist único por perfil**, criado antes dessa parte (Fase 4), sem relação com a letra.

## 10. Armadilhas (aprendidas na prática)

- **Shell:** `node -e` e heredocs com crases, barras invertidas ou `${}` quebram ou são reescritos. Para código com regex ou template literals, use o Write/Edit. Nunca encadeie `git commit` depois de um typecheck que falhou (aconteceu uma vez).
- **Prisma:** `prisma generate` falha com `EPERM` se o `npm run dev` estiver rodando (o motor `.dll.node` está em uso). Os tipos e o cliente JS são gerados mesmo assim; apague o `query_engine-windows.dll.node.tmp*` que sobra em `node_modules/.prisma/client/`. O servidor de desenvolvimento recarrega sozinho.
- **Arquivos de experimento nunca devem ir para o commit** (já escapou um `align_small.json`; foi removido).
- **Verifique no navegador de verdade.** Todos os bugs relevantes desta parte só apareceram lá: a remontagem da tela a cada salvamento (URL da letra muda), botões do card cobertos pelo link do título, ícones minúsculos por `px-0` perder para `px-5`, controle largo demais em 375 px, `<output>` com papel "status".
- Controles do player somem após 3 s sem mexer o mouse; em testes automáticos mova o mouse antes de clicar.
- React Query notifica em outro instante: nos testes use `findBy…`/`waitFor` depois de uma atualização otimista.
- Os dados de teste não podem sobrar: apresentações/contadores são apagados ao final dos roteiros; a música "À Sua Maneira" ficou **alinhada e salva** (fonte `MANUAL`, `lyricsOffsetMs` 0, `fillPercent` 100, original guardado).

## 11. Como verificar

- Rodar: `npm run typecheck`, `npm test`, `npm run build`, `worker\.venv\Scripts\python -m pytest worker`.
- Roteiros de navegador (Playwright, **não** fazem parte do repositório): cópias de referência estão em `docs/memory/sincronizacao-scripts/` (veja o `README.md` de lá). Eles usam a música real, conferem paridade navegador × worker, arrastam no canvas real, medem o `--p` durante a reprodução e fazem a limpeza.
- Ao mexer em `alignment.ts`, rode também `worker/tests/test_lyric_alignment.py`: os dois lados precisam continuar com os mesmos números.

## 12. Linha do tempo dos pedidos do Michael sobre isto

1. "A música não está sincronizada, a legenda iniciou antes da voz." → diagnóstico (+15,5 s), alinhamento automático no worker, botão e tela de sincronizar, limite do atraso para ±60 s.
2. "Ainda não ficou sincronizado… quero uma página que me ajude a sincronizar com mais recursos; ajuste a música de novo." → SPEC-001, ímã/ajuste global por todas as linhas (+15,75 s) e registro da página avançada.
3. "Inverter a fase 6 com a 5, estou mais preocupado com a sincronia." → Fase 6 na frente; editor completo (arrastar, marcar tocando, ímã, desfazer, original).
4. "A música ficou sincronizada e inicia no momento correto; o problema é o tempo que leva para pintar. Quero ligar/desligar o efeito, escolher o modelo (gravado), palavras inteiras, controlar quando termina, no player e na página de sincronizar; a prévia logo abaixo." → efeito com modelos e `fillPercent`.
5. "Deixe tudo anotado; vou passar essa parte para o Opus." → este arquivo.

## 13. Commits principais (branch `main`)

`07b0d41` alinhamento no worker · `e6c51e5` API da letra · `c5ca1c5` editor de sincronização · `574e889` e `1eb5d6c` efeito da letra · (anteriores: `3387201` primeira tela de sincronizar, `c5e6759` atraso automático do worker).

## 14. Tempos por palavra (a solução do tempo de pintar) — 2026-10-02

**Ideia:** duas camadas. (1) **Marcos:** o começo de cada linha preso ao começo real da voz (seções 3 e 7). (2) **Dentro de cada linha:** alinhamento forçado do texto da linha com a voz isolada, **só na janela da linha** (0,6 s antes do começo até 0,3 s depois do começo da próxima; 12 s para a última). O alinhador atribui cada quadro do áudio a uma letra (CTC), então uma vogal segurada fica toda dentro da palavra e a palavra seguinte só começa quando é cantada. É o mesmo método do WhisperX, mas sem reconhecer a fala: só encaixa o texto que já temos. Como cada linha tem a sua janela, um erro nunca se espalha para o resto da música (foi o que derrubou o Whisper no teste: uma linha 44 s fora).

**Por que não BPM/compasso:** temos a voz isolada, que é a prova direta de quando se canta; os cantores adiantam e atrasam o compasso, então ancorar no BPM traria erro.

**Implementação (worker):** `worker/caraoke_worker/word_alignment.py`
- `MmsAligner`: `torchaudio.pipelines.MMS_FA` (multilíngue, já vem com o `torchaudio` instalado pelo `setup-worker.ps1`; o modelo, ~1,2 GB, é baixado no primeiro uso para `~/.cache/torch/hub`), com o token `*` no começo e no fim para absorver a voz de outras linhas que caia na janela.
- `normalize_word`: minúsculas, sem acentos, só `a-z` e apóstrofo (o dicionário do MMS). Palavras que viram vazio (números, travessão) ficam com duração zero logo depois da anterior.
- `trim_to_voice`: o fim de cada palavra é cortado onde termina o **primeiro trecho contínuo** de voz (silêncio ≥ 0,25 s), mais 0,1 s. Sem isso, a palavra segurada antes de uma pausa se estendia até a borda da janela.
- Linha com confiança média < 0,2 fica **sem** palavras (o efeito usa o cálculo antigo só nela).
- O fim da linha passa a ser o fim da última palavra; o começo da linha pode recuar para o começo da 1ª palavra (sem passar da linha anterior + 0,3 s).
- No passo da letra (`steps/lyrics.py`): alinhar linhas pela voz → alinhar palavras (se `processing.autoAlign`, padrão ligado) → gravar. Falhas (por exemplo, sem internet para baixar o modelo) não quebram o job: a letra fica só com as linhas.
- Comando para uma música já existente: `cd worker` e `.venv\Scripts\python -m caraoke_worker.realign ..\storage\biblioteca\<songId>` (usa o `letra.json` atual como base; guarda o original se ainda não existir). Depois, um PATCH qualquer na música muda o `?v=` do endereço da letra.

**Implementação (front):** os efeitos já usavam `words` quando existem. A página de sincronizar agora **preserva** as palavras: mover a linha desloca as palavras; mudar começo/fim estica ou encolhe proporcionalmente (`lib/lyrics/wordTiming.ts`); só editar o texto da linha descarta as palavras dela. A linha do tempo mostra as divisões das palavras.

**Números (À Sua Maneira):** 16 de 16 linhas com palavras; 71 s no total na CPU (54 s de alinhamento + carregar o modelo). As pausas internas batem com a voz: "atrás | pensei" 55,18 s (voz em 55,2), "amor | à sua maneira" 72,65 s (72,6), "tempo | a noite inteira" 81,44 s (81,3), "mandarei | cinzas" 107,72 s (107,8). O "amor" segurado da linha 14 termina em 188,8 s (a voz para em 188,7). No navegador, cada palavra começa a pintar no seu tempo com erro máximo de 0,05 s (roteiro `sincronizacao-scripts/palavras-no-player.mjs`).

**Estado da música de teste:** `letra.json` com palavras (fonte MANUAL no banco), `letra.original.json` = LRCLIB original, `fillPercent` 100, efeito "Preencher aos poucos".

**Próximos passos possíveis:** transcrever músicas sem letra (Whisper, ainda precisaria do job só de letra); arrastar palavras individualmente na linha do tempo; um modelo de efeito novo, se o Michael pedir.

**Teste com músicas novas (2026-10-02, depois de reiniciar o sistema):** "Ela É Demais" (Rick & Renner) saiu com 39/39 linhas com palavras; "Flores" (Titãs) com 27/37 (foi editada na página de sincronizar; editar o texto de uma linha descarta as palavras dela). O Michael aprovou de ouvido ("ficou muito bom"). "Anna Júlia" foi baixada antes do reinício e ficou sem palavras (pode ser corrigida com o comando `realign`). **Atenção:** o worker não recarrega o código sozinho; depois de mudar o worker é preciso reiniciar o `npm run dev`.

## 15. Correção: música com poucas pausas na voz (2026-10-07)

**Caso:** "Vou Deixar" (Skank, clipe oficial, id `cmux5x6xt0009u06o8onhfo62`). A letra do LRCLIB já estava quase certa para o vídeo (melhor atraso +0,05 s), mas ficou **3,47 s atrasada**.
- O canto é quase contínuo: só **17 inícios de frase** para **38 linhas**.
- No melhor atraso, 11 linhas batiam a ≤ 0,5 s com as pausas, mas a regra exigia 30% das **linhas** (11,4).
- Então o `fit_shift` desistiu e o plano B (primeiro som da voz, 12,2 s, porque o "Vou deixar" do começo é baixo) empurrou a letra inteira.

**Correção** (worker e navegador, mantendo a paridade): a exigência passa a ser 30% de `min(linhas, inícios de frase)`, porque não dá para casar mais linhas do que pausas existem. Testes novos dos dois lados ("accepts a fit when the voice has fewer pauses than the lyrics has lines").

**A música** foi ressincronizada a partir do `letra.original.json`: linhas pela voz e depois palavras (MMS). Ficaram 37 de 38 linhas com palavras, fonte `ALIGNED`, `lyricsOffsetMs` 0. A edição manual que o Michael tinha feito foi substituída, por pedido dele ("tentar sincronizar novamente"). No player, cada palavra pinta no tempo certo (conferido tocando).

**Varredura da biblioteca:** só mais uma música caía no plano B por esse motivo, "Evidências" (plano B −22,87 s × correto −22,25 s). A diferença é pequena e ela não foi mexida.

**Página de sincronizar:** a lista de linhas usava `scrollIntoView`, que rola **todos** os ancestrais, inclusive a página. A cada "Marcar", a página pulava e tirava o botão e a linha do tempo do lugar. Agora `keepRowVisible` (em `LineList.tsx`) rola só a própria lista. Conferido no navegador em 1366 e 390 px: a página fica parada em todos os cliques.

## 16. "Flores": o ímã puxava linhas para a respiração do verso anterior (2026-10-07)

**Sintoma:** em "Flores" (Titãs), várias linhas entravam ~1,7 s cedo e cortavam a anterior. O cantor respira no meio de cada verso ("Olhei | até ficar cansado"), e essas respirações viram "inícios de frase". O `snap_starts` (tolerância 1,8 s) puxava a linha seguinte para a respiração da anterior.
- 19,59 → 17,55: "De ver os meus olhos";
- 32,47 → 30,75: "E o resto do meu corpo";
- e outras.

O alinhamento por palavra (MMS) **achava o começo certo** (19,13 e 32,48), mas só podia **adiantar** a linha.

**Experimento** (`scratchpad`, 4 músicas: duas aprovadas pelo Michael, "À Sua Maneira" e "Ela É Demais", mais "Flores" e "Vou Deixar"):

| Variante | Músicas aprovadas | Flores e Vou Deixar | Decisão |
|---|---|---|---|
| A: a linha começa na 1ª palavra (para frente ou para trás) | mudam no máximo 0,43 s (exatamente para a 1ª palavra) | some o erro de "linha × 1ª palavra > 0,5 s" (5 e 6 casos) | entrou |
| B: janela fixa de 2 s antes | uma linha de "Ela É Demais" pulou 4,3 s | | descartada |
| C: a janela começa no menor entre a posição com ímã e a sem ímã (`anchor`) | sem regressão | "Há flores cobrindo o telhado" ganhou palavras (103,08 s, em vez dos 104,80 errados do ímã) | entrou |

**Implementado:**
- `lyric_alignment.rebuild_lines` guarda `anchor` (o começo antes do ímã) quando o ímã mexeu na linha;
- `word_alignment.add_word_timings` busca a partir de `min(start, anchor) − 0,6 s` e põe o começo da linha na 1ª palavra (no mínimo 0,3 s depois da anterior);
- `anchor` nunca vai para o arquivo: `build_document` e `write_documents` limpam, e `add_word_timings` também;
- o navegador ("Alinhar tudo com a voz") continua igual: não tem alinhamento por palavra.

## 17. Botão "Refazer a sincronização automática" (ADR-017)

Na página de sincronizar (Ferramentas):
- O botão pede confirmação e chama `POST /api/songs/:id/lyrics/resync`, que cria um job `kind = RESYNC` para "Este PC".
- O worker (passo `RESYNC`, `steps/resync.py`) parte do `letra.original.json`, alinha linhas e palavras e grava.
- A tela mostra o andamento ("Alinhando as palavras com a voz… linha 12 de 37") e reabre o editor com a letra nova quando termina.
- A música continua pronta para cantar o tempo todo; se der errado, ela não vira "com erro".

**Medido:**
- "Flores": 72 s na CPU, 28 de 37 linhas com palavras. Conferida tocando: aos 17,5 s ainda está "Olhei até ficar cansado" toda pintada; aos 19,6 s, "De ver os…".
- "Vou Deixar" também foi refeita pelo botão, com as regras novas.
- A letra antiga da "Flores" (com as edições de 10-02) ficou guardada no scratchpad desta sessão (`flores-letra-antes.json`), caso o Michael queira comparar.
