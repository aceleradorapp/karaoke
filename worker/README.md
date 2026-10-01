# Worker de processamento

Processo Python que consome a fila de músicas (download, separação de voz, letra, capa, melodia).
Detalhes: [docs/tecnico/05-worker-processamento.md](../docs/tecnico/05-worker-processamento.md).

```powershell
npm run worker:setup
npm run dev:worker
worker\.venv\Scripts\python -m pytest worker
```
