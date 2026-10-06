# 06 — Front-end (React)

## 6.1 Dependências
```
react@^19 react-dom@^19 react-router@^7 (modo biblioteca: import { ... } from "react-router")
@tanstack/react-query@^5  zustand@^5  socket.io-client@^4
qrcode.react  pitchy@^4  clsx  lucide-react (ícones)  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities (arrastar a fila, ADR-009)  soundtouchjs@^0.3 (mudar o tom no navegador, LGPL-2.1, ADR-012)
devDeps: vite  @vitejs/plugin-react  typescript  tailwindcss@^4  @tailwindcss/vite  vitest  @testing-library/react  jsdom
```

`vite.config.ts`:
```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, port: 5173,
    proxy: {
      '/api':       { target: 'http://127.0.0.1:3333', xfwd: true },
      '/media':     { target: 'http://127.0.0.1:3333', xfwd: true },
      '/socket.io': { target: 'http://127.0.0.1:3333', ws: true, xfwd: true },
    },
  },
});
```
> `xfwd: true` é **obrigatório**: o backend usa o `X-Forwarded-For` para saber se a requisição veio do celular.

## 6.2 Dois "apps" no mesmo projeto

| | **Palco** | **Celular** |
|---|---|---|
| Rotas | `/*` | `/m/*` |
| Layout | `StageLayout` (barra superior + conteúdo) | `MobileLayout` (cabeçalho + abas inferiores) |
| Acesso | `localhost` (sem código) | Código no `localStorage` (`caraoke.accessCode`), enviado em `X-Access-Code` e no `auth` do socket |
| Perfil | Precisa de perfil selecionado (Zustand + `localStorage`) | Não usa perfil no MVP |

Detecção: `isMobilePath(pathname)` em `lib/mobileApp.ts` = `/m` exato ou começando com `/m/` (não use `startsWith('/m')`, que pegaria `/musica/...`). O client de API (`api/client.ts`) e o upload (`api/uploads.ts`) adicionam `X-Access-Code` quando a página é do celular; um 401 `ACCESS_DENIED` no celular marca o acesso como recusado (tela "escaneie de novo"). O socket envia `{ client: 'mobile', code }` e reconecta depois que o código é validado. No celular o `ThemeSync` usa o tema padrão sem chamar `/api/settings` (rota proibida ao celular).

## 6.3 Rotas

```
/perfis                    Quem vai cantar?           (sem perfil → redireciona para cá)
/perfis/gerenciar          Criar/editar/excluir perfis (dentro do layout com a barra superior; link na tela de perfis só com um perfil em uso)
/                          Início (estilo Netflix)
/biblioteca                Todas as músicas + busca + filtros
/musica/:id                Detalhe da música
/youtube                   Buscar no YouTube + prévia + importar
/enviar                    Upload de arquivos
/fila                      Fila de processamento
/proximos                  Fila de cantores: quem canta a seguir (ADR-008)
/disputas                  Disputas: lista e "Nova disputa" (ADR-010)
/saude                     Saúde do sistema: verificações com dica do que fazer + Reiniciar (ADR-011)
/disputas/:id              Disputa: rascunho (nome, imagem, participantes arrastados, músicas, regras), placar ao vivo, campeão
/playlists                 Minhas playlists
/playlists/:id             Playlist (tocar em sequência, reordenar)
/favoritas                 Favoritas do perfil
/historico                 Histórico do perfil
/ranking                   Ranking da família
/configuracoes             Configurações
/player/:songId            Player em tela cheia (?playlist=<id>&shuffle=<seed> ou ?pedido=<requestId>)
/musica/:id/letra          Editor de letra (Fase 6)

/m                         Celular: valida ?c=CODE, salva; sem identidade → /m/quem-sou; senão → /m/musicas
/m/quem-sou                "Quem é você?": escolher perfil ou criar convidado (ADR-008)
/m/musicas                 Biblioteca + "Quero cantar"
/m/buscar                  Buscar no YouTube + prévia + importar
/m/enviar                  Upload
/m/fila                    Próximos a cantar (fila de cantores) + Preparando (processamento)
/m/votar                   Votação (abre sozinha no vote:open)
```

## 6.4 Temas

Implementados com **variáveis CSS** em `[data-theme="..."]` no `<html>`, mapeadas no Tailwind 4 via `@theme`:

```css
/* styles/index.css */
@import "tailwindcss";

@theme {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-text: var(--text);
  --color-muted: var(--text-muted);
  --color-primary: var(--primary);
  --color-primary-contrast: var(--primary-contrast);
  --color-accent: var(--accent);
  --color-lyric-sung: var(--lyric-sung);
  --color-lyric-unsung: var(--lyric-unsung);
  --font-display: var(--font-display-family);
}
/* uso: bg-bg, text-text, bg-primary, text-lyric-sung ... */
```

| Token | **cinema** (padrão) | **neon** | **light** (Claro) | **retro** |
|---|---|---|---|---|
| `--bg` | `#0b0b0f` | `#0d0221` | `#f6f6f8` | `#1a1033` |
| `--surface` | `#16161d` | `#1a0b3a` | `#ffffff` | `#2b1b4f` |
| `--surface-2` | `#22222c` | `#2a1257` | `#ececf1` | `#3d2766` |
| `--text` | `#f5f5f7` | `#f8f0ff` | `#14141a` | `#fff4e6` |
| `--text-muted` | `#a0a0ab` | `#b9a6d9` | `#5c5c6b` | `#c9b8e0` |
| `--primary` | `#e50914` | `#ff2bd6` | `#4f46e5` | `#ff7a18` |
| `--primary-contrast` | `#ffffff` | `#ffffff` | `#ffffff` | `#1a1033` |
| `--accent` | `#f5c518` | `#21f0ff` | `#16a34a` | `#16e0bd` |
| `--lyric-sung` | `#f5c518` | `#21f0ff` | `#4f46e5` | `#ff7a18` |
| `--lyric-unsung` | `#ffffff` | `#ffffff` | `#14141a` | `#fff4e6` |
| `--font-display-family` | `"Bebas Neue"` | `"Monoton"` | `"Inter"` | `"Press Start 2P"` |

- Fontes do Google Fonts carregadas no `index.html`. Corpo do texto: `Inter` em todos os temas.
- O tema ativo = tema do perfil selecionado; na tela de perfis, `ui.defaultTheme`.
- `shared/src/themes.ts` exporta `THEMES = [{ id: 'cinema', name: 'Cinema' }, { id: 'light', name: 'Claro' }, ...]`.

## 6.5 Avatares
`shared/src/avatars.ts`: emoji + cor de fundo (sem imagens externas). Renderizar com o emoji grande, centralizado, num quadrado arredondado.

```ts
export const AVATARS = [
  { id: 'mic-red',    emoji: '🎤', bg: '#e50914' },
  { id: 'guitar',     emoji: '🎸', bg: '#f97316' },
  { id: 'star',       emoji: '⭐', bg: '#eab308' },
  { id: 'crown',      emoji: '👑', bg: '#a16207' },
  { id: 'headphones', emoji: '🎧', bg: '#16a34a' },
  { id: 'lion',       emoji: '🦁', bg: '#d97706' },
  { id: 'cat',        emoji: '🐱', bg: '#0ea5e9' },
  { id: 'dog',        emoji: '🐶', bg: '#8b5cf6' },
  { id: 'fox',        emoji: '🦊', bg: '#ea580c' },
  { id: 'panda',      emoji: '🐼', bg: '#475569' },
  { id: 'frog',       emoji: '🐸', bg: '#22c55e' },
  { id: 'unicorn',    emoji: '🦄', bg: '#ec4899' },
  { id: 'rocket',     emoji: '🚀', bg: '#2563eb' },
  { id: 'robot',      emoji: '🤖', bg: '#64748b' },
  { id: 'alien',      emoji: '👽', bg: '#10b981' },
  { id: 'disco',      emoji: '🪩', bg: '#7c3aed' },
] as const;
```
**Avatares divertidos (2026-10-05):** mais 20 avatares com imagem (`image: '/avatars/<id>.svg'`), guardados em `frontend/public/avatars/` (148 KB no total, funcionam sem internet): 8 carinhas sorridentes (`sorriso-*`), 6 robôs (`robo-*`), 5 emojis (`emoji-*`) e 1 pirata desenhado (`rabisco-pirata`). Gerados pelo DiceBear com estilos de licença livre; créditos em `frontend/public/avatars/CREDITOS.txt` e `docs/creditos/avatares.txt` (CC BY pede o crédito). O `Avatar` mostra a imagem quando o avatar tem `image`, senão o emoji; o `emoji` continua no registro como reserva.
(Backlog: permitir enviar foto própria.)

## 6.6 Telas do palco

### `/perfis` — Quem vai cantar?
```
┌──────────────────────────────────────────────────────────┐
│                    Quem vai cantar?                      │
│                                                          │
│     [🎤]      [🦁]      [🦄]      [🐶]      [ + ]       │
│    Michael    Ana      Júlia     Pedro    Adicionar      │
│                                                          │
│   Convidados ─────────────────────────────────────────   │
│     [🤖] Tio Beto   [🐸] Carla   [+ Convidado]           │
│                                                          │
│              [ Gerenciar perfis ]   [📱 QR code]         │
└──────────────────────────────────────────────────────────┘
```
- Avatar de 140 px; ao passar o mouse, borda branca e leve aumento (scale 1.05).
- Clicar → `POST /profiles/:id/touch` → define o perfil atual → aplica o tema → `/`.
- "Adicionar" / "+ Convidado" → modal: nome, grade de avatares, tema (o convidado só escolhe nome e avatar).

### Barra superior (StageLayout, em todas as telas exceto perfis e player)
```
[LOGO]  Início  Biblioteca  Próximos(3)  YouTube  Playlists  Ranking   [🔍 buscar...] [⚙ 2 processando] [📱] [🎤 Michael ▾]
```
- O indicador "⚙ N processando" leva a `/fila` e mostra o progresso do job atual (anel).
- 📱 abre o **modal do QR code** (08).
- Abaixo de 1536 px (2xl) a busca vira só o ícone de lupa, para os 8 itens caberem numa linha em 1280/1366 px.
- Menu do perfil: trocar perfil, favoritas, histórico, tema, configurações.

### `/` — Início (estilo Netflix)
```
┌─────────────────────────────────────────────────────────────┐
│  DESTAQUE (hero, 55vh): capa em tela cheia com degradê      │
│  ARTISTA • Título                                           │
│  [▶ Cantar]  [+ Playlist]  [♥]                              │
├─────────────────────────────────────────────────────────────┤
│ Suas favoritas          ◀ [card][card][card][card][card] ▶  │
│ Mais cantadas da família  [card][card][card][card]...        │
│ Adicionadas recentemente  [card][card]...                    │
│ Cantadas por você         ...                                │
│ Suas playlists            [capa 2x2][capa 2x2]...            │
│ <Artista com ≥3 músicas>  ...  (até 3 fileiras de artista)  │
└─────────────────────────────────────────────────────────────┘
```
- Fileiras vindas de `GET /api/songs/home`; fileiras vazias não aparecem. Hero = a música mais recente pronta (ou aleatória entre as 10 mais cantadas).
- Rolagem horizontal com setas aparecendo no hover; `scroll-snap`.
- **Fila de cantores com pedidos:** faixa acima das fileiras: avatar + "Vez de Ana — Evidências" + [▶ Chamar] + "e mais 2 na fila" (link para `/proximos`). Mostra o primeiro pedido **pronto**.
- **Biblioteca vazia:** estado de boas-vindas com os botões "Buscar no YouTube" e "Enviar arquivos".

### `SongCard` (componente central)
- Proporção **16:9**, cantos arredondados, capa `object-cover`. Sem capa → gradiente determinístico (hash do id → 2 cores) + título e artista em destaque.
- Hover (desktop): `scale(1.08)`, sombra, painel inferior com título, artista e botões **▶ cantar**, **➕ playlist** (abre o `PlaylistPicker`), **♥ favoritar**.
- Status: `QUEUED`/`PROCESSING` → capa esmaecida + anel de progresso + texto da etapa; **sem botão de play** (decisão: bloquear até ficar pronta). `ERROR` → selo vermelho "Falhou" (clique leva à fila).
- Selo pequeno "Letra para revisar" quando `lyricsNeedsReview`.

### `PlaylistPicker` (modal)
```
Adicionar "Evidências" a…
 [✓] Sertanejo raiz
 [ ] Festa de sábado
 [ ] Para treinar
 ──────────────
 [+ Nova playlist ____________ ] [Criar]
```
- Lista via `GET /profiles/:pid/playlists?songId=` (`containsSong` marca o check).
- Marcar/desmarcar adiciona/remove na hora (atualização otimista + toast "Adicionada a X").

### `/biblioteca`
Campo de busca grande (debounce de 300 ms), filtros: artista, status (prontas, processando, com erro), ordenação. Grade de `SongCard`s com rolagem infinita.

### `/musica/:id` — Detalhe
Capa grande, título, artista, duração, origem, quem adicionou, quantas vezes foi cantada, melhor nota da família. Ações: Cantar, Playlist, Favoritar, Editar título/artista, Ajustar letra (Fase 6), Reprocessar (YouTube), Excluir. Prévia da letra (rolável).

### `/youtube` — Buscar no YouTube
```
[🔍 Buscar música ou artista no YouTube______________] [Buscar]

┌──────────┐ Título do vídeo                         [▶ Prévia] [⬇ Importar]
│ thumb    │ Canal • 3:45                             (ou: ✓ Já na biblioteca)
└──────────┘
...
┌ Prévia ────────────────────────┐
│ <iframe YouTube embed>          │  ← painel fixo à direita (desktop) / modal (celular)
└─────────────────────────────────┘
```
- Prévia: `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&start=<30% da duração>`.
- **Importar** → modal "Confirmar música" com os campos **Artista** e **Título** pré-preenchidos por `suggested` (editáveis) → `POST /youtube/import` → toast "Adicionada à fila de processamento".
- Componente compartilhado com `/m/buscar` (`features/youtube/YoutubeSearch.tsx`, prop `compact`).

### `/enviar` — Upload
Área de arrastar e soltar + botão "Escolher arquivos". Lista com barra de progresso (XHR `upload.onprogress`). Texto de ajuda: "Você também pode copiar arquivos para a pasta `storage/entrada/upload` no PC." Compartilhado com `/m/enviar`.

### `/fila` — Fila de processamento
```
Processando agora
 [capa] Evidências — Chitãozinho & Xororó
        Separando voz (CPU) ████████░░░░ 62%        [Cancelar]

Na fila (arraste para reordenar)
 ≡ [capa] Fogão de Lenha — ...           Aguardando   [Cancelar]
 ≡ [capa] Ai Se Eu Te Pego — ...         Aguardando   [Cancelar]

Concluídas recentemente
 ✓ Garçom — Reginaldo Rossi    pronta há 5 min
 ✗ Música X — erro: "Video unavailable"           [Tentar de novo] [Remover]
```
- Atualização em tempo real (`job:updated`). Reordenar com drag-and-drop nativo HTML5 (sem biblioteca), ou botões ↑/↓ como alternativa.
- Rodapé: "Worker: online • CPU" / "Worker offline: verifique o terminal".

### `/proximos` — Fila de cantores (ADR-008)
```
Próximos a cantar                                   [▶ Chamar o próximo]
 1. [🦁] Ana        Evidências — Chitãozinho & X.     [↑][↓][✕]
 2. [🐸] Carla      Azul da Cor do Mar — Tim Maia     [↑][↓][✕]
 3. [🤖] Tio Beto   Pais e Filhos — Legião  ⚙ preparando  [↑][↓][✕]
```
- Atualiza ao vivo (`singQueue:changed`); reordenar com ↑/↓ (otimista, `PUT /sing-queue/order`); ✕ remove sem confirmação (é só um pedido).
- **Chamar o próximo** = primeiro pedido com música `READY` → `/player/<songId>?pedido=<id>`. Também dá para chamar um pedido específico pelo botão ▶ da linha (se a música estiver pronta).
- Vazia: "Ninguém na fila. Peça pelo celular: escaneie o QR code" + botão do QR code.
- O contador da barra superior mostra o número de pedidos (some quando é zero).
- **v2 (ADR-009):** botões **Adicionar** (janela "Pôr na fila de cantores": escolhe a pessoa, com "+ Convidado" ali mesmo, e a música da biblioteca; músicas com erro não aparecem) e **🔀 Aleatório** (`queue.shuffle`). O "Próximo" vem do servidor (`nextId`) e tem selo na linha. Cada linha tem uma alça para **arrastar** (dnd-kit: mouse com 6 px de distância, toque segurando 150 ms, teclado com espaço/setas) além de ↑↓. A página da música tem **"Pôr na fila"** (a mesma janela, com a música já escolhida).

### `/disputas` e `/disputas/:id` (ADR-010)
- Lista em cartões (imagem 16:9, nome, status, número de participantes) e **Nova disputa** (só o nome; abre a disputa).
- **Rascunho:** nome com salvamento automático; imagem (**Enviar foto** JPG/PNG/WEBP até 5 MB, **Usar capa de música**, **Tirar imagem**); quadro **Perfis → Na disputa** (arrastar com dnd-kit ou tocar no +; "Convidado" cria e já põe na disputa; a ordem da direita é a ordem das rodadas e também se arrasta); cada participante mostra as músicas escolhidas (X/N) e **"Música para Ana"** abre a busca da biblioteca; **Regras da disputa** (músicas por pessoa, modo da nota, tempo de voto, chamar o próximo, aleatório) salvas na hora; **Começar a disputa** (precisa de 2+ participantes e alguma música) leva para `/proximos`.
- **Em andamento:** **Ir para a fila**, **Encerrar disputa** (confirma), **Placar** ao vivo (`competition:changed`) e as regras (menos músicas por pessoa). A página Próximos mostra a faixa "Disputa X em andamento".
- **Encerrada:** campeão (coroa, avatar grande, nota com `ScoreReveal`) e placar final. Apagar só fora do andamento.

### `/playlists` e `/playlists/:id`
Grade de playlists (capa 2×2 com as 4 primeiras músicas). Página da playlist: [▶ Cantar tudo] [🔀 Aleatório], lista reordenável, remover item, renomear e excluir.

### `/historico`, `/favoritas`
Listas simples com SongCard/linha; o histórico mostra data e nota.

### `/ranking`
Pódio (1º, 2º e 3º com avatares grandes) da melhor média no período; abas Semana/Mês/Sempre; família e convidados juntos, com o filtro "Só a família" (ADR-008); listas "Quem mais cantou" e "Músicas mais cantadas"; destaque "Estrela do karaokê do mês" (nome neutro, sem supor gênero). Período e filtro ficam no endereço (`?periodo=week|all&familia=1`; o padrão é o mês). Convidados têm o selo "convidado".

### `/saude` — Saúde do sistema (ADR-011)
- Resumo (tudo funcionando / com avisos / com problemas), hora da verificação e modo (festa ou desenvolvimento); lista das verificações com os problemas primeiro, cada uma com mensagem e **"O que fazer"**; **Verificar agora** (`?fresh=1`); seção **Reiniciar**.
- **Indicador** ⚠ na barra superior (âmbar = aviso, vermelho = problema) só quando algo não está ok; verificado a cada 2 min. Também no menu do perfil.
- **Reiniciar o sistema** (aqui e em Configurações → Sistema): confirma, chama `POST /api/system/restart`; todas as telas (palco e celulares, pelo `system:restarting`) mostram "Reiniciando o sistema…" e recarregam quando `/api/health` volta. Fora do modo festa o botão fica desabilitado com a explicação.
- Página da música: sem letra por **site fora do ar** mostra o motivo e aponta para a Saúde do sistema; sem letra porque **não existe** diz isso.

### `/configuracoes`
Seções:
1. **Processamento:** dispositivo (Automático / GPU / CPU) + detectado ("GPU NVIDIA GeForce GT 1030, 2 GB: no modo automático será usada a CPU, porque a GPU tem pouca memória"); modelo Demucs; modelo Whisper; alinhar automaticamente; botão "Atualizar yt-dlp".
2. **Pontuação:** modo (Afinação + plateia / Só afinação / Só plateia / Desligada); peso da plateia; tempo de votação; microfone (lista de `enumerateDevices`), **medidor de nível ao vivo** e latência (ms) com botão "Calibrar" (Fase 7).
3. **Fila de cantores:** músicas esperando por pessoa (sem limite ou 1–10), "A TV pode passar do limite", "Chamar o próximo cantor" (desligado ou 5–60 s) e aleatório (ADR-009).
3b. **Letra:** ligar/desligar o efeito de pintar e o modelo do efeito (o player só tem o botão liga/desliga).
4. **Aparência:** tema padrão.
5. **Acesso pelo celular:** código atual + "Gerar novo código".
6. **Sistema:** link para a Saúde do sistema + Reiniciar o sistema.
6b. **Armazenamento:** espaço usado, número de músicas.
7. **Perfis:** link para `/perfis/gerenciar`.

## 6.7 Estado
- **Servidor (TanStack Query):** chaves `['songs', params]`, `['song', id]`, `['home', profileId]`, `['jobs', scope]`, `['playlists', profileId]`, `['playlist', id]`, `['favorites', profileId]`, `['history', profileId]`, `['ranking', period]`, `['settings']`, `['system']`.
- **Tempo real → cache:** `realtime/useRealtimeSync.ts` escuta os eventos e chama `queryClient.setQueryData`/`invalidateQueries` (ex.: `song:updated` → atualiza `['song', id]` e invalida `['home']` e `['songs']`).
- **Zustand:**
  - `useProfileStore` → `{ currentProfile, setProfile, clear }` (persistido em `localStorage`, chave `caraoke.profile`).
  - `usePlayerStore` → estado do player (07).
- **Toasts:** componente próprio simples (`components/Toast.tsx`) + store.

## 6.8 Acessibilidade e TV
- Fonte base maior no palco (`html { font-size: 18px }`); legível a 3 m.
- Todos os elementos interativos com foco visível (`focus-visible:ring-4 ring-primary`), navegáveis por Tab e Enter.
- `aria-label` em botões só com ícone.

## 6.9 Responsividade (OBRIGATÓRIA em toda tela)
**Toda tela e todo componente devem ser responsivos**, inclusive as do palco. Nenhuma tarefa de front está pronta sem isso.

| Breakpoint (Tailwind) | Largura | Alvo |
|---|---|---|
| (base) | < 640 px | Celular (360–430 px) |
| `sm` | ≥ 640 px | Celular deitado / tablet pequeno |
| `md` | ≥ 768 px | Tablet |
| `lg` | ≥ 1024 px | Notebook |
| `xl` / `2xl` | ≥ 1280 / 1536 px | PC e TV (1366×768 a 1920×1080) |

Regras:
- **Mobile-first:** escreva as classes base para o celular e adicione `md:`/`lg:` para telas maiores.
- Sem rolagem horizontal da página em nenhuma largura (exceto as fileiras de cards, que rolam de propósito).
- Grades com `grid-cols-[repeat(auto-fill,minmax(…,1fr))]` em vez de um número fixo de colunas.
- A barra superior do palco vira um **menu hambúrguer** abaixo de `xl` (1280 px: a barra completa só cabe a partir daí); a busca vira um ícone que expande.
- Modais: tela cheia no celular (`< sm`), centralizados com largura máxima nas telas maiores.
- Player: a letra usa `clamp()`; os controles se reorganizam em 2 linhas no celular.
- Hover não pode ser o único jeito de acessar uma ação (em telas de toque, os botões do `SongCard` ficam sempre visíveis ou aparecem com um toque).
- Alvos de toque ≥ 44 px; inputs com `font-size` ≥ 16 px.
- **Verificação:** testar cada tela no DevTools em 375 px, 768 px, 1366 px e 1920 px antes de marcar a tarefa como ✅.

Celular (páginas `/m`): abas inferiores **Buscar · Enviar · Fila** (e **Votar** quando houver votação aberta, com destaque pulsante).

## 6.10 Salvamento automático (padrão em todo formulário)
**Preferência do Michael: auto-save sempre.** Botão "Salvar" só quando for realmente necessário.

| Situação | Comportamento |
|---|---|
| Editar campos existentes (nome do perfil, tema, título/artista da música, configurações, nome da playlist, atraso da letra) | **Auto-save**: texto com debounce de 600 ms ou no `blur`; selects, toggles, sliders e checkboxes salvam na hora |
| Adicionar/remover/reordenar (playlists, favoritos, fila) | Na hora, com atualização otimista (desfaz se a API falhar) |
| Editor de letra (Fase 6) | Auto-save com debounce de 1,5 s + **Desfazer** (Ctrl+Z, histórico local de 50 passos) |
| **Criar** algo novo (perfil, playlist, importar música) | Botão de confirmação ("Criar", "Importar"): é necessário, porque cria um registro |
| Ações destrutivas ou caras (excluir, reprocessar, regenerar o código de acesso) | Botão + confirmação |

Implementação:
- Hook único `useAutoSave(value, saveFn, { delay })` em `frontend/src/lib/useAutoSave.ts`: debounce, cancela o pendente ao desmontar (com flush), retorna `status: 'idle' | 'saving' | 'saved' | 'error'`.
- Indicador discreto ao lado do campo/seção: "Salvando…" → "Salvo ✓" (some após 2 s) → em caso de erro, "Não foi possível salvar · Tentar de novo".
- Validação inválida (ex.: nome vazio) **não salva** e mostra o erro no campo; o último valor válido continua no servidor.
- Mutations com TanStack Query (`useMutation`) + `onMutate` otimista.
