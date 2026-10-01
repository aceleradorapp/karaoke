# SPEC-001 — Página avançada de sincronização da letra

- **Status:** rascunho
- **Criada em:** 2026-10-01
- **Fase do roadmap:** 6 (F6-03 e F6-06)
- **Relacionadas:** tela atual `/musica/:id/sincronizar` (F3-13/F3-14), ADR a criar para o alinhamento por IA

## 1. Objetivo
A tela atual move **a letra inteira** por um único atraso. Isso resolve letras com a introdução diferente, mas não resolve quando só **algumas linhas** estão fora (a letra do LRCLIB vem de outra gravação). Caso real: "À Sua Maneira" — com o melhor atraso fixo (+15,75 s), 13 de 16 linhas caem a menos de 0,5 s da voz; 3 linhas ficam ~1,2 s fora.
Michael quer uma página com **mais recursos** para sincronizar o áudio com a letra.

## 2. Histórias de usuário
- Como cantor, quero ajustar o tempo de **uma linha** (ou palavra) sem mexer nas outras, para corrigir os trechos fora de sincronia.
- Como cantor, quero **marcar a letra ouvindo a música** (tocar um botão/tecla a cada linha) para criar a sincronia do zero quando a letra não tem tempos.
- Como cantor, quero ver **onde a voz canta** (onda) junto das linhas, para ajustar com o olho e não só de ouvido.
- Como cantor, quero **desfazer** e comparar com o original, para não perder o que já estava bom.

## 3. Requisitos funcionais
- [ ] RF1 — Arrastar o início (e o fim) de cada linha na linha do tempo; as linhas seguintes podem acompanhar ("mover daqui para frente") ou ficar paradas.
- [ ] RF2 — **Marcar tocando**: durante a música, uma tecla/botão grande marca o início da próxima linha (desconta o tempo de reação, configurável); funciona também em letra sem tempos (só texto).
- [ ] RF3 — Alinhar a linha ao **início de voz mais próximo** (ímã nos inícios detectados na faixa de voz) e "ajustar todas ao ímã" com revisão.
- [ ] RF4 — **Alinhamento automático por IA** (stable-ts) da letra de texto com a faixa de voz separada, com a opção de reprocessar só a letra (F6-01/F6-02).
- [ ] RF5 — Ajuste fino por linha: passos de 1 s a 0,01 s, repetir a linha para ouvir, "ouvir só desta linha até a próxima".
- [ ] RF6 — Editar o **texto** das linhas (corrigir, dividir, juntar, apagar, inserir linha em branco/instrumental).
- [ ] RF7 — Modo **palavra a palavra** (karaokê com preenchimento por palavra) a partir do alinhamento por IA; ajuste manual das palavras.
- [ ] RF8 — Histórico de versões da letra (original do LRCLIB, automática, manual) com **desfazer/refazer** e "voltar ao original".
- [ ] RF9 — Auto-save contínuo (sem botão salvar), com indicador de estado.
- [ ] RF10 — Pré-visualização igual à do karaokê (mesmo `LyricsView`) e atalhos de teclado para tudo.
- [ ] RF11 — Melhorar o alinhamento automático atual: em vez de usar só o primeiro som da voz, escolher o atraso que minimiza a distância entre **todos** os inícios de linha e os inícios de voz (no exemplo, +15,75 s contra +15,51 s do primeiro som).

## 4. Requisitos não funcionais
- Layout responsivo do celular (375 px) à TV (1920 px); alvos de toque ≥ 44 px; arrastar com toque e mouse.
- Auto-save e nenhuma perda de dados ao sair da página.
- Áudio sem engasgo ao ajustar; a tela não pode recarregar o áudio a cada salvamento (bug já corrigido na F3-15).

## 5. Design / UX
Evolução de `/musica/:id/sincronizar`: modo **Simples** (atraso único, como hoje) e modo **Por linha** (lista de linhas ao lado/abaixo da linha do tempo, linha atual em destaque, botões por linha). A decidir com o Michael antes de implementar (wireframes em `vault/`).

## 6. Técnico
### Front-end (React)
Reaproveitar `SyncTimeline`, `useSyncPreview`, `timelineMath`, `vocalAnalysis`. Novo: estado de edição das linhas com histórico (desfazer/refazer), arrastar por linha, modo "marcar tocando".

### Back-end (Node.js)
`PUT /api/songs/:id/lyrics` (salvar `letra.json`/`letra.lrc` editados), `POST /api/songs/:id/lyrics/align` (job só de letra), versões da letra guardadas no diretório da música.

### Worker (Python)
`align.py` com stable-ts (F6-01); detecção de inícios de voz compartilhada com `vocal_onset.py`.

## 7. Critérios de aceite
- [ ] Dado "À Sua Maneira", quando uso o modo por linha, então as 16 linhas ficam a menos de 0,3 s da voz.
- [ ] Dado uma letra só de texto, quando marco tocando a música inteira, então a letra sai sincronizada e é salva sozinha.
- [ ] Dado um ajuste errado, quando desfaço, então volto ao estado anterior; e "voltar ao original" restaura a letra do LRCLIB.

## 8. Fora de escopo
Transcrição de letra do zero para músicas sem texto (fica em F6-01, só como opção) e edição colaborativa.

## 9. Questões em aberto
- Mover as linhas seguintes junto ao arrastar uma linha deve ser o padrão?
- Guardar quantas versões da letra por música?
- Modo de marcar por palavra: tecla única ou duas (início e fim)?
