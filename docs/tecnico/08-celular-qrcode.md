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
      ok  → salva em localStorage("caraoke.accessCode") → /m/buscar
      401 → tela "Código inválido: escaneie o QR code na TV de novo"
```
- QR gerado no front com `qrcode.react` (`<QRCodeSVG value={url} size={320} level="M" includeMargin />`), em fundo **branco** independentemente do tema (leitura confiável).
- **Endereço com nome (2026-10-02):** o YouTube **recusa** a prévia embutida em páginas abertas por IP (`http://192.168...` mostra "Este vídeo não está disponível"), mas aceita nomes. Por isso o QR usa `http://<ip>.nip.io:<porta>/m?c=...` (DNS público que devolve o próprio IP; não passa tráfego por fora). O endereço só por IP continua na lista como alternativa (roteadores com proteção contra "DNS rebinding" ou sem internet podem não resolver o nome). O Vite libera esses nomes em `server.allowedHosts` (`.nip.io`, `.sslip.io`). A prévia também tem o link "Abrir no YouTube" no mesmo ponto, como reserva.
- Mais de um endereço: mostrar o primeiro e um seletor "Outro endereço".
- Se o celular abrir `/m` sem `?c=` e houver código salvo, tenta o salvo; se não houver, pede para escanear.
- `access:changed` (código regenerado) → todos os celulares voltam para a tela "escaneie de novo".

## 8.2 Páginas do celular (`features/mobile/`)
Layout: cabeçalho com o logo e o nome do app; conteúdo; **abas inferiores** fixas:

| Aba | Rota | Conteúdo |
|---|---|---|
| 🔍 Buscar | `/m/buscar` | `YoutubeSearch compact`: campo, resultados em lista (thumb 120 px, título, canal, duração), **Prévia** abre um modal com o embed, **Importar** abre a confirmação de artista/título |
| ⬆ Enviar | `/m/enviar` | Upload (o `<input type="file" accept="audio/*" multiple>` abre os arquivos do celular) |
| ⚙ Fila | `/m/fila` | Fila de processamento, somente leitura, em tempo real |
| ⭐ Votar | `/m/votar` | Aparece só com a votação aberta; abre sozinha no `vote:open` |

- **Sem** biblioteca, player, playlists, perfis ou configurações no celular (decisão do Michael).
- **Capas no celular:** uma `<img>` não envia cabeçalhos, então o celular pede `/media/<id>/capa.jpg?c=<código>` (`lib/deviceMedia.ts`). O backend aceita o código no endereço **só** para capas; áudio e letra continuam bloqueados para o celular (`plugins/access.ts`).
- Importação pelo celular: `profileId` vazio (`addedBy = null`).
- Tamanho mínimo de toque de 44 px; inputs com `font-size: 16px` (evita o zoom do iOS).

## 8.3 Segurança (rede da casa)
- O código de acesso impede que qualquer aparelho no Wi-Fi (visitas, TV smart, etc.) use a API, mesmo sabendo o endereço.
- Não é segurança forte (HTTP sem TLS); é suficiente para a rede doméstica. A publicação na internet (Fase 8) exige HTTPS + autenticação real: **não exponha esta versão à internet** (sem redirecionamento de porta no roteador).
