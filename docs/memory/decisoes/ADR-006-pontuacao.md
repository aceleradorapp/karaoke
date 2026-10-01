# ADR-006 — Pontuação: afinação + bônus da plateia

- **Status:** aceita
- **Data:** 2026-10-01

## Contexto
O Michael quer uma nota ao final de cada música. Opções: votação da plateia (celulares), afinação (microfone no PC) ou as duas. Nem sempre será possível ligar o microfone no PC.

## Decisão
- **Modo padrão: afinação + plateia.** Nota final = `afinação × 0,8 + plateia × 0,2` (peso configurável).
- **Configurável** em `scoring.mode`: `pitch+audience` · `pitch` · `audience` · `off`.
- Faltando uma das partes (sem microfone ou sem votos), a nota final é a parte que existe.
- Afinação: compara a melodia da voz original (extraída pelo worker) com o microfone, **ignorando a oitava**, com uma curva generosa para amadores.
- Plateia: 1–5 estrelas pelo celular, durante 20 s após a música; 1 voto por celular.
- Usar a voz guia **não** penaliza a nota (por enquanto).

## Consequências
- O microfone precisa estar ligado ao PC e o palco precisa rodar em `localhost` (exigência do navegador).
- O worker precisa da etapa MELODY (Fase 7) e as músicas antigas precisam ser reprocessadas.
- Detalhes em `docs/tecnico/07-player-letras-pontuacao.md`.
