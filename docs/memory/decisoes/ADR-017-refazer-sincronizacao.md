# ADR-017 — Botão "Refazer a sincronização automática"

- **Status:** aceita
- **Data:** 2026-10-07

## Contexto
Quando uma letra fica fora, o Michael me pede para ressincronizar. Eu rodo à mão o mesmo caminho da importação, partindo da letra original guardada:
1. alinho as linhas pela voz;
2. acho o tempo de cada palavra (alinhamento forçado MMS).

Ele pediu um botão para fazer isso sozinho. O alinhamento por palavra só existe no worker (Python e `torchaudio`, ~1 min na CPU), então precisa ir para a fila. O guia da sincronização já previa um "job só de letra", que exige saber o **tipo** do job.

## Decisão
- **Nova coluna `jobs.kind`** (`PROCESS` = importação normal, padrão; `RESYNC` = refazer a sincronização) e novo passo `RESYNC` no enum `JobStep`.
- **`POST /api/songs/:id/lyrics/resync`** (só o palco) cria o job:
  - fica no fim da fila de processamento, com `targetWorkerId = "local"` (o worker local já tem a voz e a letra no disco; uma máquina remota precisaria baixar os arquivos, o que fica para depois);
  - responde 409 se a música já tem um job ativo ou se não tem voz separada ou letra com tempos.
- **No worker** (`steps/lyrics.py`, passo `RESYNC`):
  - parte do `letra.original.json` (ou da `letra.json` atual, se não houver original), sem buscar no LRCLIB;
  - alinha as linhas pela voz e depois as palavras;
  - grava `letra.json` e `letra.lrc`.
- **A música continua pronta para cantar** durante o job: o claim não muda o status. Concluir só atualiza os campos da letra (`lyricsSource = ALIGNED`, `lyricsOffsetMs = 0`, `lyricsNeedsReview`), e o `?v=` da letra muda. Falhar ou cancelar **não** marca a música como "com erro", e a recuperação de jobs interrompidos não a põe em "na fila".
- **Na tela** (página de sincronizar):
  - botão "Refazer a sincronização automática", com confirmação: "substitui as mudanças feitas à mão; a letra original continua guardada";
  - enquanto roda, mostra "Ressincronizando… (posição na fila / passo)";
  - quando termina, a página recarrega a letra nova.
  - Na fila de processamento, o job aparece como "Refazendo a sincronização".

## Melhoria no alinhamento (mesma entrega)
Na "Flores", o ímã puxava a linha para uma respiração no meio do verso anterior (~1,7 s antes). O alinhamento por palavra encontrava o começo certo, mas só podia **adiantar** a linha.
- Agora, quando a linha tem palavras, ela começa na primeira palavra, para frente ou para trás (respeitando 0,3 s depois da linha anterior).
- A janela de busca das palavras começa no menor entre a posição com ímã e a sem ímã (`anchor`), conforme o experimento registrado no guia (seção 16).

## Consequências
- Migração: coluna `kind` e valor `RESYNC` no enum do passo.
- `completeJob`, `failJob`, `cancelJob`, `retryJob` e a recuperação passam a olhar o `kind`.
- O mesmo botão serve para músicas antigas que ficaram fora (ex.: "Evidências", importadas antes das correções).
