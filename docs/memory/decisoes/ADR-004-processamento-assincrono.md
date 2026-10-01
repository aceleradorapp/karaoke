# ADR-004 — Processamento assíncrono de músicas (fila + worker)

- **Status:** aceita (detalhes de implementação em aberto)
- **Data:** 2026-10-01

## Contexto
Baixar, separar a voz com IA e sincronizar a letra leva de segundos a minutos por música. O usuário não deve esperar, e deve poder enfileirar várias músicas. As músicas chegam do YouTube ou de uma pasta de upload.

## Decisão
- **Fila de processamento persistida no MySQL** (tabela de jobs com status, etapa, progresso e erro).
- **Worker em Python** (yt-dlp, Demucs, WhisperX) consome a fila, uma música por vez por padrão.
- **Dispositivo**: `auto` (usa a GPU se houver CUDA disponível, senão a CPU), com opção manual `gpu`/`cpu` nas configurações.
- **Pastas**:
  ```
  storage/
    entrada/
      youtube/      ← downloads temporários
      upload/       ← arquivos colocados pelo usuário (monitorada)
    biblioteca/<id-da-musica>/
      instrumental.(mp3|ogg)
      voz.(mp3|ogg)
      letra.lrc
      capa.jpg
    erro/           ← origens que falharam, para tentar de novo
  ```
- Quando o processamento termina com sucesso, **o arquivo de origem é apagado**. Se falhar, a origem vai para `erro/`.

## Consequências
- O original com voz não é guardado: instrumental + voz o reconstroem (é assim que funciona a voz guia).
- O worker fala **somente com a API do Node** (HTTP + token), nunca com o banco (ADR-005).
