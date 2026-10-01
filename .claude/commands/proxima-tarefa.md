---
description: Pega a próxima tarefa do roadmap e executa seguindo o protocolo
argument-hint: [ID da tarefa opcional, ex. F0-06]
---
Execute uma tarefa do roadmap seguindo o protocolo do CLAUDE.md.

1. Tarefa: **$ARGUMENTS** (se vazio, use a primeira ⬜ da fase atual em `docs/roadmap/ROADMAP.md` cujas dependências estejam ✅).
2. Diga qual tarefa vai fazer e quais seções do documento técnico vai ler. Se ela for 🔴 e você for um modelo mais simples (não Opus), avise e pergunte se deve continuar.
3. Leia as seções referenciadas em `docs/tecnico/` e o `docs/tecnico/09-convencoes.md`.
4. Marque a tarefa como 🟨 no roadmap.
5. Implemente apenas o escopo da tarefa.
6. Rode typecheck e testes; teste de verdade quando aplicável.
7. Marque como ✅ com a data de hoje e resuma: o que foi feito, como testou, desvios do documento técnico (se houver) e qual é a próxima tarefa.
