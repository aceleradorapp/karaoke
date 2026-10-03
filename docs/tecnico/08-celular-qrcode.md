# 08 — Celular e QR code

## 8.1 Fluxo de entrada
```
Palco: botão 📱 (barra superior ou tela de perfis) → modal do QR code
   GET /api/system/access → { code: "K7P2QX", urls: ["http://192.168.98.10:5173/m?c=K7P2QX"] }
   ┌──────────────────────────────────────┐
   │  Cante junto! Aponte a câmera 📷      │
   │        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │
   │        ▓▓  QR CODE (320px) ▓▓        │
   │        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │
   │  ou digite: 192.168.98.10:5173/m     │
   │  código: K7P2QX                      │
   │  [Gerar novo código]       [Fechar]  │
   └──────────────────────────────────────┘
Celular: lê o QR → abre /m?c=K7P2QX
   → GET /api/system/access/check com X-Access-Code
      ok  → salva em localStorage("caraoke.accessCode")
            → sem identidade salva → /m/quem-sou ; com identidade → /m/musicas
      401 → tela "Código inválido: escaneie o QR code na TV de novo"
```
- QR gerado no front com `qrcode.react` (`<QRCodeSVG value={url} size={320} level="M" includeMargin />`), em fundo **branco** independentemente do tema (leitura confiável).
- **Endereço com nome (2026-10-02):** o YouTube **recusa** a prévia embutida em páginas abertas por IP (`http://192.168...` mostra "Este vídeo não está disponível"), mas aceita nomes. Por isso o QR usa `http://<ip>.nip.io:<porta>/m?c=...` (DNS público que devolve o próprio IP; não passa tráfego por fora). O endereço só por IP continua na lista como alternativa (roteadores com proteção contra "DNS rebinding" ou sem internet podem não resolver o nome). O Vite libera esses nomes em `server.allowedHosts` (`.nip.io`, `.sslip.io`). A prévia também tem o link "Abrir no YouTube" no mesmo ponto, como reserva.
- Mais de um endereço: mostrar o primeiro e um seletor "Outro endereço".
- Se o celular abrir `/m` sem `?c=` e houver código salvo, tenta o salvo; se não houver, pede para escanear.
- `access:changed` (código regenerado) → todos os celulares voltam para a tela "escaneie de novo".

## 8.2 Páginas do celular (`features/mobile/`)
Layout: cabeçalho com o logo, o nome do app e **"🎤 Ana · trocar"** (identidade, 8.4); conteúdo; **abas inferiores** fixas:

| Aba | Rota | Conteúdo |
|---|---|---|
| 🎵 Músicas | `/m/musicas` | Biblioteca: busca (debounce 300 ms, `GET /songs?q=`), lista com capa, título, artista e **Quero cantar** (vira "Na fila ✓" e permite tirar). Músicas com erro não aparecem; as que estão processando aparecem com "preparando" e também podem ser pedidas |
| 🔍 Buscar | `/m/buscar` | `YoutubeSearch compact`: campo, resultados em lista (thumb 120 px, título, canal, duração), **Prévia** abre um modal com o embed, **Importar** abre a confirmação de artista/título |
| ⬆ Enviar | `/m/enviar` | Upload (o `<input type="file" accept="audio/*" multiple>` abre os arquivos do celular) |
| 📋 Fila | `/m/fila` | **Próximos a cantar** (fila de cantores, em tempo real; os meus pedidos destacados e com "Tirar") e, abaixo, **Preparando** (fila de processamento, somente leitura) |
| 🎙 Letra | `/m/letra` | Aparece só enquanto a TV toca uma música (`player:state`): quem canta, a música e a letra sincronizada com a TV (mesmo efeito de pintar), sem som. Mantém a tela acesa (Wake Lock em HTTPS; senão um vídeo mudo de 2 KB em repetição, `public/keep-awake.mp4`; se nada funcionar, mostra a dica) — ADR-009. Cada celular tem **Efeito: ligado/desligado** (desligado, a frase atual fica toda colorida de uma vez) e **Adiantar/Atrasar a letra** de 0,1 em 0,1 s (até ±2 s), salvos no próprio celular (`caraoke.mobileLyrics`). O relógio é medido com 8 amostras (usa a de menor ida e volta) e refeito a cada 60 s |
| ⭐ Votar | `/m/votar` | Aparece só com a votação aberta; abre sozinha no `vote:open` (lembra a aba anterior e volta para ela 5 s depois da nota final). Quem cantou vê "É a sua vez!" em vez das estrelas; `voterToken` em `localStorage` (`caraoke.voterToken`, com reserva para `crypto.randomUUID`, que não existe em página HTTP sem TLS) |

- **Sem** player, playlists, edição de perfis ou configurações no celular. A biblioteca e a identidade entraram com o ADR-008.
- **Capas no celular:** uma `<img>` não envia cabeçalhos, então o celular pede `/media/<id>/capa.jpg?c=<código>` (`lib/deviceMedia.ts`). O backend aceita o código no endereço **só** para capas; áudio e letra continuam bloqueados para o celular (`plugins/access.ts`).
- Importação e envio pelo celular: `profileId` = identidade do celular (`addedBy` = quem pediu). A confirmação da importação tem a caixa **"Quero cantar esta"** (marcada por padrão): depois de importar, cria o pedido na fila de cantores (`POST /sing-queue`); se der 409 (limite), mostra a mensagem e a importação continua valendo.
- Tamanho mínimo de toque de 44 px; inputs com `font-size: 16px` (evita o zoom do iOS).

## 8.3 Segurança (rede da casa)
- O código de acesso impede que qualquer aparelho no Wi-Fi (visitas, TV smart, etc.) use a API, mesmo sabendo o endereço.
- Não é segurança forte (HTTP sem TLS); é suficiente para a rede doméstica. A publicação na internet (Fase 8) exige HTTPS + autenticação real: **não exponha esta versão à internet** (sem redirecionamento de porta no roteador).
- A identidade do celular (8.4) é de confiança, sem senha: organiza a festa, não protege dados. O celular só remove os próprios pedidos (o backend confere o `profileId`).

## 8.4 Identidade: "Quem é você?" (ADR-008)
```
┌──────────────────────────────┐
│  Quem é você?                │
│  Família                     │
│   [🎤] Michael  [🦁] Ana      │
│  Convidados                  │
│   [🤖] Tio Beto [🐸] Carla    │
│  ──────────────────────────  │
│  Sou novo por aqui           │
│   Nome [____________]        │
│   [grade de avatares]        │
│   [ Entrar ]                 │
└──────────────────────────────┘
```
- `GET /profiles` lista família e convidados; tocar num perfil = "sou eu" (sem senha). "Sou novo" cria um convidado (`POST /profiles` com nome e avatar).
- Guardado em `localStorage` (`caraoke.mobileProfile`: `{ id, name, avatar }`, store `useMobileProfileStore`). "trocar" no cabeçalho volta para `/m/quem-sou`.
- Ao abrir o layout, se o perfil salvo não existir mais em `GET /profiles`, apaga a identidade e manda para `/m/quem-sou`.
- As abas Músicas, Buscar, Enviar e Fila exigem identidade (`/m/quem-sou` se não houver).
