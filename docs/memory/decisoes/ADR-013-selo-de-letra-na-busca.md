# ADR-013 — Selo "tem letra" na busca do YouTube

- **Status:** aceita
- **Data:** 2026-10-06

## Contexto
Primeiro item da "ordem sugerida" (Fase 7G). Antes de importar, o Michael quer saber se a música vai ter letra. A mesma verificação será usada pelo MCP (F7G-02).

## Decisão
- **Endpoint:** `GET /api/lyrics/check?artist=&title=&duration=` responde `{ status }`.
  - `SYNCED`: letra sincronizada.
  - `PLAIN`: só o texto.
  - `INSTRUMENTAL`: música sem voz.
  - `NONE`: não encontrada.
  - `UNKNOWN`: o LRCLIB não respondeu.
  - Liberado para o celular (a busca do YouTube também existe em `/m/buscar`).
- **Regras iguais às do worker** (`worker/caraoke_worker/steps/lyrics.py`), escritas de novo em TypeScript no backend (`modules/lyricsCheck`):
  - a ordem das tentativas é `/get` exato, depois `/search` por título e artista, depois `/search` livre e, por fim, artista e título invertidos;
  - aceita durações com diferença de até 5 s;
  - a sincronizada tem prioridade.
  - **Por quê:** o worker não é um servidor HTTP (ele só pede trabalho), e chamá-lo para isso exigiria uma fila nova. A lógica é pequena; os testes dos dois lados cobrem os mesmos casos.
- **Custo e educação com o LRCLIB:**
  - cache em memória de 6 h (até 1.000 entradas; `UNKNOWN` não entra no cache);
  - no máximo 4 verificações ao mesmo tempo; cada chamada ao LRCLIB tenta até 4 vezes (o site falha ~30% das vezes de forma aleatória, medido em 2026-10-06);
  - User-Agent do projeto.
- **Na tela:** cada resultado mostra um selo:
  - "Verificando a letra…";
  - "Letra sincronizada" (cor de destaque do tema);
  - "Só o texto da letra" (neutro);
  - "Sem letra" (vermelho);
  - "Instrumental".
  - Usa `suggested.artist` e `suggested.title` (já limpos pelo `parseYoutubeTitle`) e a duração do vídeo. Com `UNKNOWN`, não mostra selo.

## Consequências
- Se a regra do worker mudar, mudar também `modules/lyricsCheck` (anotado no documento técnico).
- O worker também passou a tentar de novo nas falhas passageiras do LRCLIB (antes, ~30% das importações podiam ficar "sem letra: o site não respondeu" à toa).
- Uma busca gera até 12 verificações (com cache, a segunda busca igual é instantânea).
