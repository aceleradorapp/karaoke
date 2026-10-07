# ADR-016 — Perfis da casa × convidados

- **Status:** aceita
- **Data:** 2026-10-07
- **Atualiza:** ADR-008 (convidados e fila)

## Contexto
Numa festa com muitos convidados, entrar e sair do perfil de cada um para escolher músicas não funciona, e a tela "Quem vai cantar esta?" fica poluída com dezenas de avatares. O Michael definiu:
- o **perfil** (com tema, playlists e favoritas) é só para as **pessoas da casa**;
- **convidado** só canta: é escolhido na hora, pede pela fila (pela TV ou pelo próprio celular), tem nota, ranking e disputas;
- com o tempo acumulam convidados, então é preciso uma área para gerenciá-los.

## Decisão
- **"Quem está usando?" (TV, `/perfis`)** mostra **só os perfis da casa**. Convidados não entram mais no sistema pela TV. "Gerenciar perfis" também só trata os da casa e tem um link para "Gerenciar convidados".
- **Escolher quem canta** (player "Quem vai cantar esta?" e "Pôr na fila"):
  - aparece só o **perfil da casa que está na TV** e o botão **"Convidado ▾"**;
  - o botão abre o **seletor de cantor** (`SingerChooser`):
    - busca;
    - seção "Da casa" com os outros perfis da casa;
    - seção "Convidados", com quem cantou mais recentemente primeiro;
    - "+ Novo convidado".
  - Ao escolher alguém, essa pessoa **toma o lugar** do cartão do perfil como quem vai cantar. Se a música veio da fila de cantores ("Vez de Ana! 🎤"), aparece quem pediu.
- **Gerenciar convidados (`/convidados`)**:
  - lista com busca, avatar, "cantou pela última vez" e número de vezes que cantou;
  - editar nome e avatar com salvamento automático;
  - excluir um ou vários (modo "Selecionar", igual ao da biblioteca);
  - **"Limpar convidados antigos"**: exclui os que não cantam há mais de **30 dias** (os que nunca cantaram contam pela data de criação), com confirmação que mostra quantos e quais;
  - **excluir apaga tudo do convidado** (notas, pedidos, histórico; sai do ranking). O banco já faz isso em cascata.
- **Backend:**
  - `GET /api/profiles/guests` traz `{ items: [{ ...ProfileDTO, lastSungAt, timesSung }] }`;
  - `POST /api/profiles/guests/delete-many { ids }` exclui só convidados (perfis da casa são ignorados);
  - `GET /api/profiles/guests/stale?days=30` traz a prévia da limpeza;
  - continua `PATCH/DELETE /api/profiles/:id`.
- **Celular:** continua como hoje: "Quem é você?" com "Da casa" e "Convidados" e criar o próprio convidado. A lista de convidados ganha **busca** quando passa de 8. As playlists no celular ficam para depois.

## Consequências
- Quem quiser playlists precisa de um perfil da casa. Um convidado frequente pode ser "promovido": no Gerenciar convidados, a opção "Tornar da casa" muda o `isGuest`.
- Telas e testes que listavam todos os perfis juntos passam a separar casa e convidados.
