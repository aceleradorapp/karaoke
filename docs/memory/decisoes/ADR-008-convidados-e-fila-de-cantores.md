# ADR-008 — Convidados pelo celular e fila de cantores

- **Status:** aceita
- **Data:** 2026-10-02

## Contexto
Na Fase 5 o celular ficou só como controle de importação: busca no YouTube, envio de arquivos e a fila de processamento. Os convidados eram criados na TV, e a escolha de quem canta acontecia no player ("Quem vai cantar esta?").
Antes da pontuação (Fase 7), o Michael quer que cada convidado tenha seu nome e sua nota e que possa escolher pelo celular as músicas que vai cantar. O ADR-003 já previa "temporários (convidados, criados pelo celular)", mas o `contexto.md` tinha simplificado para "o celular não cria perfil no MVP".

## Opções consideradas
1. **Manter tudo na TV.** É simples, mas a TV vira gargalo: alguém precisa ficar operando para cada convidado.
2. **Celular com identidade e pedidos, numa fila de cantores na TV.** Cada pessoa se identifica uma vez e pede músicas, e a TV toca na ordem. A TV continua no controle e pode reordenar ou remover.
3. **Celular com login real (senha ou token por perfil).** Exagero para a rede da casa; fica para a Fase 8 (ADR-003).

## Decisão
Opção 2, com estas regras:

**Identidade no celular ("Quem é você?")**
- Depois do código de acesso, o celular pede a identidade uma única vez. A pessoa escolhe um perfil que já existe (da família ou um convidado antigo, para recuperar o histórico) ou cria um convidado com nome e avatar.
- O celular guarda o `profileId` (`localStorage`) e mostra "🎤 Ana · trocar" no topo.
- Um perfil criado pelo celular é **sempre convidado** (`isGuest = true`, tema padrão), e o celular não edita nem apaga perfis.
- A identidade é de confiança, como no resto da rede da casa: não há senha. Se o perfil for apagado na TV, o celular pede a identidade de novo.

**Biblioteca no celular**
- Nova aba **Músicas**: busca na biblioteca e botão **"Quero cantar"** em cada música. Não há player, playlists nem configurações no celular.
- Importar pelo YouTube ou enviar arquivos registra quem pediu (`addedBy` = perfil do celular). A confirmação da importação tem "Quero cantar esta" (marcado por padrão), que já cria o pedido.

**Fila de cantores (`sing_requests`)**
- Cada pedido é uma linha com perfil, música, posição e data.
- Pode pedir uma música que ainda está processando: o pedido aparece como "preparando", e a TV pula para o próximo pronto.
- Limites:
  - até **3 pedidos esperando por pessoa**;
  - a mesma pessoa não pede a mesma música duas vezes;
  - música com erro não pode ser pedida.
- O celular só remove os próprios pedidos. A TV reordena e remove qualquer um.
- O pedido **sai da fila quando a apresentação começa**: `POST /performances` com `requestId` apaga o pedido na mesma transação.
- Tempo real: o evento `singQueue:changed` leva a fila inteira para o palco e os celulares.

**Na TV**
- Página **Próximos** (`/proximos`), com o contador na barra superior: lista, subir e descer, remover e **"Chamar o próximo"**.
- O início mostra uma faixa "Vez de Ana" quando há pedidos.
- O player aberto por um pedido mostra "Vez de Ana! 🎤" com Ana pré-selecionada, para começar com um Enter.
- No fim da música, se não estiver numa playlist, oferece "Chamar o próximo: João – Azul da Cor do Mar".

**Pontuação (a aplicar na Fase 7)**
- O voto leva o `voterProfileId` do celular, e quem está cantando **não vota na própria apresentação** (409 `CANNOT_VOTE_FOR_SELF`). Continua valendo um voto por celular (`voterToken`).
- O ranking mostra família e convidados juntos, com o filtro **"Só a família"** (`?scope=family`).

## Consequências
- Nova tabela `sing_requests`, nova rota `/api/sing-queue` e o evento `singQueue:changed`.
- A lista de rotas liberadas para o celular cresce: perfis (listar e criar convidado) e a fila de cantores.
- O documento do celular (T-08) deixa de dizer "sem biblioteca e sem perfis no celular".
- Fila de processamento e fila de cantores são coisas diferentes. Na UI: "Preparando" para o processamento e "Próximos" para a fila de cantores.
- Risco: sem senha, alguém pode se passar por outra pessoa no celular. Aceito para a rede da casa; a Fase 8 resolve com autenticação.
