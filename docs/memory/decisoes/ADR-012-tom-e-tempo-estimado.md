# ADR-012 — Mudar o tom da música e tempo estimado na fila

- **Status:** aceita
- **Data:** 2026-10-06

## Contexto
O Michael pediu duas coisas das ideias guardadas: mudar o tom da música (para quem canta mais grave ou mais agudo) e mostrar quanto tempo falta para cada música da fila de processamento ficar pronta.

## Decisão

**Mudar o tom (sem mudar a velocidade)**
- **Opções:**
  - processar no worker com rubberband ou librosa: boa qualidade, mas leva minutos por tom e ocupa disco;
  - pitch shift em tempo real numa AudioWorklet: tem atraso e complica a sincronia da letra;
  - **processar o áudio já carregado no navegador com o SoundTouch**: escolhida.
- **Biblioteca:** `soundtouchjs` (LGPL-2.1, a mesma técnica dos programas de karaokê). Medido: 4 min estéreo em ~0,8 s, tom exato (+2 semitons: 220 → 246,9 Hz) e deslocamento ≤ 0,02 s (não afeta a letra). O final que o algoritmo come (~0,3 s) é completado com silêncio.
- **Funcionamento:**
  - O motor guarda o instrumental e a voz originais.
  - Ao mudar o tom, processa os dois num **Web Worker** (a tela não trava), guarda o resultado dos 2 últimos tons usados e troca as faixas no **mesmo ponto** da música.
  - Enquanto processa, mostra "Mudando o tom…".
- **Faixa:** de −6 a +6 semitons. Controle "Tom" no player (− / valor / + / voltar ao original), com as teclas `-` e `=`.
- ~~Fica salvo por música~~ → **atualizado em 2026-10-09: fica salvo por pessoa e por música.** Salvar só por música não fazia sentido, porque outra pessoa cantando começaria no tom de quem cantou antes.
  - Tabela `singer_song_keys` (`profileId`, `songId`, `keyShift`); a coluna `songs.keyShift` saiu (estava zerada em todas).
  - O player busca o tom de quem foi escolhido em "Quem vai cantar esta?" e salva quando essa pessoa muda.
  - Voltar ao original apaga o registro. Vale para convidados também.
- **Pontuação:** a nota alvo da melodia é deslocada pelo mesmo número de semitons.

**Tempo estimado na fila de processamento**
- **Modelo:** tempo de um job ≈ `duração × segundos de processamento por segundo de música`. A taxa é a **mediana dos últimos 15 jobs concluídos** no mesmo tipo de aparelho do worker (CPU × placa de vídeo).
  - No histórico real, a taxa é ~1,08 na CPU. A parte fixa (letra, capa, melodia) é pequena e já entra na taxa, então não há termo fixo separado.
  - Com menos de 3 jobs no histórico, usa o padrão do aparelho: CPU 1,2 e GPU 0,4.
  - Música sem duração conhecida (upload ainda não processado): 4 min.
- **Endpoint:** `GET /api/jobs/estimate` devolve o modelo. O front calcula para cada job da fila:
  - o que está rodando: "faltam ~X min" (estimado menos o já decorrido, mínimo de 30 s);
  - os que esperam: "começa em ~X · pronta em ~Y", somando os que estão à frente.
- O cálculo é refeito a cada 15 s e a cada evento da fila. No topo da fila aparece "Tudo pronto em ~Z min". É sempre apresentado como **estimativa**.
- O `JobDTO.song` passa a levar a `durationSec`.

## Consequências
- Nova dependência `soundtouchjs` (registrada no T-06).
- Nova coluna `songs.keyShift`, nova rota `/api/jobs/estimate` e um Web Worker no front.
- Mudar o tom ocupa mais memória: até dois pares de faixas a mais (≈ 90 MB cada par numa música de 4 min). As faixas são liberadas ao sair do player.
