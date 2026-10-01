# Contexto do projeto

> Documento vivo. Atualize quando algo fundamental mudar.

## Visão
App de karaokê para a família: escolher músicas e cantar com a letra sincronizada na tela.
Começa como MVP de uso local (em casa) e evolui até o produto final, publicado para uso fora de casa.

## Objetivos
- Buscar e listar músicas do YouTube pelo próprio sistema, com prévia (ouvir trechos).
- Baixar a música e remover o vocal com IA (gerar o instrumental).
- Obter a letra e sincronizá-la com o áudio.
- Perfis por usuário: playlists, favoritos e outras funções individuais.
- Tocar a música (instrumental + letra) em uma tela de karaokê.

## Público / usuários
- Família do Michael (poucos usuários e confiáveis). No futuro: acesso remoto, então vai precisar de autenticação.

## Como o app vai ser usado
- Instalado em **um PC da casa**, acessado pela **rede local**.
- Tela de exibição: o monitor do PC ou a **TV da área de lazer** (PC ligado na TV).
- **Celular como controle**: os convidados acessam pela rede, escolhem músicas e montam a fila.

## Requisitos já definidos (2026-10-01)
- **Perfis estilo Netflix**: usuários internos, sem senha, com avatar (imagem ou ícone escolhido de uma galeria).
- Cada perfil pode ter **várias playlists**.
- **Ícone "adicionar à playlist"** em cada música, que abre a escolha de qual playlist.
- **Busca** na biblioteca de músicas.
- **Remoção de vocal assíncrona**: importa e o processamento continua em segundo plano, sem precisar esperar.
- **Botão de voz guia** junto ao play: liga ou desliga o vocal original. **Padrão: desligado**.
- **Letras**: encontrar automaticamente e sincronizar.
- **Usuário temporário pelo celular**: o convidado cria um perfil para escolher as músicas do dia. O histórico é mantido para ele recuperar a lista em outro dia.
- Funções por usuário desejadas: **favoritos, histórico, pontuação, ranking da família**.
- **GPU ou CPU**: detecção automática da placa de vídeo, com opção manual nas configurações.
- **Fila de processamento**: o usuário monta uma lista de músicas para processar.
- **Duas origens de música**: download do YouTube e **pasta de upload** (colocar arquivos). Pastas organizadas; ao terminar o processamento, o arquivo de origem é apagado.
- **Qualquer pessoa pode importar** músicas, pelo celular ou pelo app.
- **Página do celular é limitada**: buscar músicas, baixar e processar (não é o sistema todo).
- **QR code sob demanda**: um botão na tela principal abre uma janela com o QR code de acesso.
- **Vários temas** visuais.
- **Visual estilo Netflix**, com miniatura (capa) para cada música.
- **Pontuação ao final**: afinação + bônus da plateia, configurável quando não der para ligar o microfone no PC (ADR-006).

## Stack (detalhes no ADR-005 e em `docs/tecnico/`)
| Camada | Escolha | Status |
|---|---|---|
| Front-end | React 19 + Vite + TypeScript + Tailwind 4 | ✅ |
| Back-end | Node 24 + Fastify 5 + TypeScript + Socket.IO | ✅ |
| Banco | MariaDB 10.4 (XAMPP), banco `caraoke`, Prisma 6 | ✅ |
| Processamento de IA | Worker Python 3.11 (yt-dlp, Demucs, stable-ts, parselmouth) | ✅ |
| Testes | Vitest + pytest | ✅ |
| Deploy / hospedagem | — | Fase 8 |

## Hardware do PC da casa
i5-4460 (4 núcleos) · 8 GB de RAM · GeForce GT 1030 com 2 GB → o Demucs roda na CPU no modo automático (4–6 min por música).

## Restrições e premissas
- Projeto pessoal, uso na rede de casa. Não expor à internet antes da Fase 8.
- Não mexer nos outros bancos do XAMPP.

## Decisões menores adotadas como padrão (podem mudar)
- Música ainda processando: **play bloqueado** (tocar a versão original está no backlog).
- Convidado: criado na tela de perfis do palco; o celular não cria perfil no MVP.
- Celular: só buscar, importar, enviar, ver a fila e votar.

## Perguntas em aberto
- O celular deve poder colocar músicas na fila de quem vai cantar? (backlog)
