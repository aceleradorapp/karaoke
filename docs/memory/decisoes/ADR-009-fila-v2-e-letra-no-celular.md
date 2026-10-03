# ADR-009 — Fila de cantores v2 e letra no celular

- **Status:** aceita
- **Data:** 2026-10-03

## Contexto
Com a fila de cantores (ADR-008) e a pontuação (Fase 7) prontas, o Michael pediu para a festa andar quase sozinha:
- criar convidado sem sair da música;
- a TV também pôr gente na fila;
- seguir para o próximo cantor depois da nota;
- reorganizar a fila arrastando;
- um modo aleatório;
- um limite de pedidos configurável;
- e quem não canta poder acompanhar a letra pelo celular.

## Decisão

**Perfis**
- O "Quem vai cantar esta?" do player ganha **"+ Convidado"** (nome e avatar). O convidado é criado e já fica selecionado. A lista continua mostrando todos os perfis que existem.
- O menu do perfil ganha **"Gerenciar perfis"**.

**Fila de cantores**
- **A TV adiciona pedidos:** a página Próximos tem **"+ Adicionar"** (escolhe a pessoa, existente ou "+ Convidado", e a música da biblioteca), e a página da música tem **"Pôr na fila"**.
- **Limite configurável** (`queue.maxRequestsPerPerson`: 1–10, ou 0 = sem limite; padrão 3), mais o interruptor **"A TV pode passar do limite"** (`queue.stageBypassesLimit`, padrão ligado).
- **Arrastar para reordenar** na página Próximos (com mouse ou dedo), usando **dnd-kit** (`@dnd-kit/core` e `@dnd-kit/sortable`). É leve, acessível (teclado) e funciona no toque, o que o arrastar nativo do HTML não faz. As setas ↑↓ continuam.
- **Modo aleatório** (`queue.shuffle`, botão "🔀 Aleatório" na página Próximos, fica salvo):
  - "Chamar o próximo" sorteia entre os pedidos com música pronta, evitando a mesma pessoa da última apresentação quando houver outra opção.
  - O sorteio é feito **no servidor** e enviado junto com a fila (`nextId`), para todas as telas mostrarem o mesmo "Próximo". Ele é refeito quando a fila muda ou uma apresentação começa.
  - Sem o aleatório, `nextId` é o primeiro pedido pronto.
- **Seguir para o próximo sozinho** (`queue.autoAdvanceSeconds`: 0 = desligado, 5–60, padrão 15):
  - Na tela da nota (ou no fim da música sem nota), aparece **"Próximo: Ana — Evidências · em 15 s"**, com "Ir agora" e "Esperar".
  - Quando a contagem acaba, abre o player com **"Vez de Ana! 🎤"** e o botão **Começar**.
  - **Nunca começa a tocar sozinho:** a pessoa precisa chegar até a TV, e o navegador exige um clique para tocar som.
- **Pular quem não está:** "Chamar o próximo" e o ✕ da lista resolvem; não há regra nova.

**Letra no celular**
- Nova aba **"Letra"** no celular, visível enquanto a TV toca uma música. Mostra quem canta, a música, a linha atual pintando (com o efeito das configurações) e a próxima linha. O celular não toca som.
- **Relógio da TV:** o player avisa o servidor quando dá play, pausa, muda de posição, ajusta o atraso da letra e quando termina, e a cada 5 s manda uma correção:
  - `POST /api/player/state` (só o palco) com `{ songId, singer, position, playing, offsetMs }`;
  - o servidor carimba a hora (`at`) e emite `player:state` para os celulares;
  - `GET /api/player/state` atende quem chega depois.
- O celular calcula `posição = position + (agora − at)` quando está tocando, com a diferença de relógio medida contra `GET /api/system/time`.
- A letra (`/media/<id>/letra.json`) passa a ser liberada para o celular com o código no endereço (`?c=`), como as capas. O áudio continua bloqueado.
- **Tela acesa:** usa a Wake Lock API quando existe (só em HTTPS). Senão, usa um vídeo mudo, minúsculo e invisível, em repetição. Se nada funcionar, mostra a dica de aumentar o tempo de tela.

## Consequências
- Nova dependência: dnd-kit.
- Novos settings `queue.*`.
- A fila passa a responder `{ items, nextId }`.
- Novas rotas `/api/player/state` e `/api/system/time`.
- Novo evento `player:state`.
- Mais uma rota de mídia liberada ao celular (só a letra).
- HTTPS de verdade fica para a Fase 8 (domínio próprio + Caddy com Let's Encrypt via DNS, apontando para o IP da casa).
