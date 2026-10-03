# ADR-010 — Disputas

- **Status:** aceita
- **Data:** 2026-10-03

## Contexto
O Michael quer criar "disputas de brincadeira":
- com nome e imagem, escolhendo os participantes e quantas músicas cada um canta;
- usando a fila de cantores, a votação e a nota que já existem;
- com um ranking só da disputa.

Nas palavras dele: "apenas usamos a página para selecionar e configurar, o resto é recurso do próprio sistema".

## Decisão
- **Página `/disputas`:** lista de disputas (rascunho, em andamento, encerrada) e "+ Nova disputa".
- **Criar ou editar** (rascunho, com salvamento automático):
  - nome;
  - imagem (foto enviada pelo PC ou celular, ou uma da galeria de capas da biblioteca);
  - participantes, arrastando os perfis da lista "Perfis" para "Na disputa" ou criando um convidado ali;
  - **músicas por participante**;
  - regras da disputa: modo da nota, tempo de votação, tempo para chamar o próximo e aleatório.
- **Escolha das músicas:** feita na TV. Seleciona a pessoa e adiciona da biblioteca as músicas que ela pediu, até o limite da disputa.
- **Iniciar:**
  - as músicas viram pedidos na mesma fila de cantores, marcados com a disputa;
  - a ordem padrão é por rodadas (todos cantam a 1ª, depois todos a 2ª, …), e dá para arrastar ou usar o aleatório;
  - enquanto a disputa está em andamento, **os pedidos normais ficam guardados e fora da fila**, e voltam quando ela termina;
  - vale **uma disputa em andamento por vez**;
  - durante a disputa, as regras dela substituem as configurações gerais de nota, votação, próximo e aleatório.
- **Pontuação:**
  - **apenas a nota** de cada apresentação: ganha a maior média;
  - quem não cantou não tem média (fica no fim);
  - sem regras extras, de propósito: se alguém sai no meio ou não está quando é chamado, perde a pontuação daquela música (a TV pula ou tira o pedido);
  - as apresentações da disputa também contam no ranking geral.
- **Placar da disputa:** ao vivo na página da disputa (média, quantas cantou de quantas). No fim, pódio com a imagem e o campeão. **Encerrar** pode ser automático, quando acabam os pedidos da disputa, ou feito pelo botão.

## Consequências
- Novas tabelas `competitions` e `competition_participants`.
- `competitionId` em `sing_requests` e `performances`.
- Imagem em `storage/disputas/<id>.jpg`.
- O "modo disputa" troca as regras usadas pela fila e pela votação enquanto ela estiver em andamento.
