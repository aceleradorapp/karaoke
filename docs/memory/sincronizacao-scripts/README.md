# Roteiros de verificação da sincronização (referência)

Cópias dos roteiros usados para verificar a sincronização da letra. **Não fazem parte do build nem dos testes** do projeto; servem de modelo e de prova de como cada número foi medido. Leia antes `../sincronizacao-da-letra.md`.

| Arquivo | O que faz |
|---|---|
| `editor-sincronizar.mjs` | Abre a página de sincronizar com a música real, confere a paridade navegador × worker, arrasta linhas no canvas, desfaz/refaz, usa o ímã, edita texto, volta ao original, testa o modo "Marcar tocando", confere o player e a responsividade (375/768/1366/1920 px) |
| `efeito-da-letra.mjs` | Mede o preenchimento da letra durante a reprodução (modelos, tempo 50%/100%/150%, efeito desligado, tecla E, persistência após recarregar) e confere o layout |
| `whisper-experimento.py` | Alinha o texto da letra com a voz usando o Whisper (stable-ts) na CPU e grava as palavras em JSON (usado para medir tempo e precisão) |
| `paridade-alinhamento.py` | Roda o alinhamento do worker (Python) no arquivo real e compara com os tempos do Whisper |
| `comparar-whisper.py` | Remonta as linhas a partir das palavras do Whisper (contando palavras) e compara com os inícios de voz |

## Como rodar os de navegador

1. Deixe o sistema no ar (`npm run dev` na raiz).
2. Numa pasta **fora do repositório**: `npm init -y`, `npm i playwright`, `npx playwright install chromium`, e copie o `.mjs` para lá.
3. `node editor-sincronizar.mjs` (ou `efeito-da-letra.mjs`). Eles criam capturas de tela em subpastas `shots*`.

Observações:
- O id da música e os caminhos estão fixos para a música "À Sua Maneira" (`cmupw7a4q0001u0v0facactnd`) e para `D:/Projetos/caraoke-michael`; ajuste se mudar.
- `editor-sincronizar.mjs` espera que a música **ainda não tenha** `letra.original.json` (ele recusa se existir). Para repetir, restaure o `letra.json` original, apague `letra.original.json` e ponha no banco `lyricsSource='LRCLIB'` e `lyricsOffsetMs=15750`.
- Os dois restauram o que alteraram (configurações, `fillPercent`, apresentações criadas).

## Como rodar os de Python

Com o venv do worker, a partir da pasta `worker`: defina `FF` com o caminho do FFmpeg e `PYTHONPATH=.`, por exemplo
`PYTHONPATH=. .venv/Scripts/python.exe ../docs/memory/sincronizacao-scripts/paridade-alinhamento.py`.
`paridade-alinhamento.py` e `comparar-whisper.py` leem `worker/align_small.json`, que o `whisper-experimento.py` gera (~10 min na CPU; **não faça commit desse arquivo**).
