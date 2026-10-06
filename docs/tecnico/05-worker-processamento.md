# 05 — Worker de processamento (Python)

## 5.1 Responsabilidade
Processo Python de longa duração que:
1. Envia **heartbeat** ao backend a cada 10 s (em uma thread separada).
2. Faz **polling** em `POST /api/internal/jobs/claim` a cada 3 s quando ocioso.
3. Executa as etapas do job, reportando progresso.
4. Chama `complete` ou `fail`.

**Nunca acessa o banco.** Lê e escreve arquivos em `STORAGE_DIR` (os caminhos vêm do claim).

## 5.2 Estrutura
```
worker/caraoke_worker/
  __main__.py   # main(): carrega config, inicia heartbeat, loop de jobs, trata Ctrl+C
  config.py     # Config (dataclass) a partir do .env da raiz (python-dotenv, path ../.env)
  api.py        # class Api: heartbeat(), settings(), claim(), progress(), complete(), fail()
  device.py     # detect_device(), resolve_device(mode)
  titles.py     # clean_title(): espelho de shared/titleParser (para buscar letras)
  errors.py     # JobCanceled, StepError
  steps/download.py  steps/separate.py  steps/lyrics.py
  steps/align.py     steps/cover.py     steps/melody.py
```

## 5.3 Loop principal (pseudocódigo)
```python
def main():
    cfg = Config.load()
    api = Api(cfg.api_url, cfg.worker_token)
    info = detect_device()
    start_heartbeat_thread(api, info)            # a cada 10 s
    log.info("Worker iniciado: %s", info)
    while True:
        try:
            claim = api.claim()                  # None se 204
            if claim is None:
                time.sleep(3); continue
            run_job(api, claim, info)
        except requests.ConnectionError:
            log.warning("Backend indisponível; tentando em 5 s"); time.sleep(5)

def run_job(api, claim, info):
    job, paths = claim["job"], claim["paths"]
    settings = api.settings()
    ctx = JobContext(job, paths, settings, info, api)   # report(step, pct, msg) → levanta JobCanceled se cancel=True
    result = {"hasInstrumental": False, "hasVocals": False, "hasCover": False,
              "hasMelody": False, "lyricsSource": "NONE", "lyricsNeedsReview": False, "durationSec": None}
    try:
        source = job["sourcePath"]
        for step in job["steps"]:
            if step == "DOWNLOAD": source = download.run(ctx)
            elif step == "SEPARATE": result |= separate.run(ctx, source)
            elif step == "LYRICS":   result |= lyrics.run(ctx)
            elif step == "COVER":    result |= cover.run(ctx, source)
            elif step == "MELODY":   result |= melody.run(ctx)
            elif step == "FINALIZE": ctx.report("FINALIZE", 100, "Finalizando")
        api.complete(job["id"], result)
    except JobCanceled:
        log.info("Job %s cancelado", job["id"])   # o backend já marcou CANCELED
    except Exception as e:
        log.exception("Falha no job")
        api.fail(job["id"], step=ctx.current_step, error=f"{type(e).__name__}: {e}"[:2000])
    finally:
        cleanup_tmp(paths["tmpDir"], job["id"])
```
- `ctx.report()` faz no máximo 1 PATCH por segundo (exceto quando muda de etapa ou chega a 100%).
- Se a resposta do PATCH trouxer `cancel: true`, levanta `JobCanceled` e **mata o subprocesso em execução** (guarde a referência em `ctx.proc`).

## 5.4 Detecção de GPU (`device.py`)
```python
MIN_VRAM_AUTO_MB = 3500   # htdemucs precisa de ~3 GB+ com o segment padrão

def detect_device() -> dict:
    import torch
    info = {"cudaAvailable": torch.cuda.is_available(), "gpuName": None, "vramMb": None}
    if info["cudaAvailable"]:
        p = torch.cuda.get_device_properties(0)
        info["gpuName"] = p.name
        info["vramMb"] = p.total_memory // (1024 * 1024)
    return info

def resolve_device(mode: str, info: dict) -> str:
    """mode: auto | gpu | cpu  →  'cuda' ou 'cpu'"""
    if mode == "cpu" or not info["cudaAvailable"]:
        return "cpu"
    if mode == "gpu":
        return "cuda"
    return "cuda" if (info["vramMb"] or 0) >= MIN_VRAM_AUTO_MB else "cpu"
```
**Neste PC (GT 1030, 2 GB):** `auto → cpu`. Em modo `gpu` manual, o Demucs roda com `--segment 4` e, se ocorrer `CUDA out of memory`, refaz automaticamente na CPU (5.6). A UI de configurações deve explicar isso.

## 5.5 Etapa DOWNLOAD (`steps/download.py`)
Usa o módulo `yt_dlp` (não o CLI):
```python
opts = {
    "format": "bestaudio/best",
    "outtmpl": os.path.join(youtube_dir, f"{song_id}.%(ext)s"),
    "noplaylist": True,
    "quiet": True, "no_warnings": True,
    "progress_hooks": [hook],   # hook: d["status"]=="downloading" → pct = downloaded/total*100
    "retries": 3,
}
with yt_dlp.YoutubeDL(opts) as ydl:
    info = ydl.extract_info(f"https://www.youtube.com/watch?v={youtube_id}", download=True)
    path = ydl.prepare_filename(info)
```
- Mensagem: "Baixando do YouTube… 42%".
- Retorna o caminho do arquivo baixado (`entrada/youtube/<songId>.webm|m4a`).
- **Não converte** para MP3 (o Demucs lê via ffmpeg).

## 5.6 Etapa SEPARATE (`steps/separate.py`)
Executa o Demucs como **subprocesso** (isola a memória e permite cancelar):
```python
cmd = [sys.executable, "-m", "demucs",
       "--two-stems", "vocals",
       "-n", model,                 # settings processing.demucsModel
       "-d", device,                # 'cpu' | 'cuda'
       "--mp3", "--mp3-bitrate", "192",
       "-o", out_dir,               # tmp/<jobId>/demucs
       source_path]
if device == "cuda":
    cmd[3:3] = ["--segment", "4"]   # pouca VRAM
if device == "cpu":
    cmd[3:3] = ["-j", "2"]          # 2 threads de trabalho (4 núcleos, sem travar o PC)
```
- Progresso: o Demucs escreve barras do tqdm no **stderr**, com `\r`. Leia por blocos e junte em linhas completas (um bloco pode cortar a linha no meio). Use **só a barra de separação** (a unidade dela é `seconds`). A barra de **download dos pesos do modelo** (só na 1ª execução, unidade `M`/`B`) vira a mensagem "Baixando o modelo de IA (só na primeira vez)…" com progresso 0. Mensagem: "Separando voz (CPU)… 37%".
- Saída: `out_dir/<model>/<nome_sem_extensão>/vocals.mp3` e `no_vocals.mp3`.
- Mover para `songDir/voz.mp3` e `songDir/instrumental.mp3` (criar `songDir` se não existir).
- **Fallback:** se `returncode != 0` e o stderr contiver `CUDA out of memory` (ou `CUDA error`), reporte "Pouca memória na GPU; continuando na CPU" e execute de novo com `-d cpu`.
- Duração: `mutagen.File(instrumental).info.length` → `durationSec`.
- `ctx.device_label` = `"cpu"` ou `f"cuda:{gpuName}"` (enviado no progress).
- Retorna `{"hasInstrumental": True, "hasVocals": True, "durationSec": int(round(length))}`.

## 5.7 Etapa LYRICS (`steps/lyrics.py`)

### Formato de saída: `letra.json` (= `LyricsDoc` em `shared/src/lyrics.ts`)
```jsonc
{
  "version": 1,
  "source": "LRCLIB",              // LyricsSource
  "synced": true,                  // false = sem tempos (PLAIN)
  "language": "pt",                // opcional
  "lines": [
    {
      "start": 12.34,              // segundos (float, 2 casas)
      "end": 15.80,                // = start da próxima linha, ou start + 4 s na última
      "text": "Eu sei que vou te amar",
      "words": [                   // opcional (ALIGNED/TRANSCRIBED)
        { "start": 12.34, "end": 12.60, "text": "Eu" }
      ]
    }
  ]
}
```
Linhas vazias do LRC (pausas instrumentais) **não** entram em `lines`. No modo PLAIN, `start`/`end` = 0.

### Algoritmo
```
1. artist, title = song.artist, clean_title(song.title)
2. GET https://lrclib.net/api/get?artist_name=&track_name=&duration=<durationSec>
   headers: User-Agent = LRCLIB_USER_AGENT; timeout 15 s; tenta de novo até 3 vezes em 500/502/503/504 (backoff 0,3 s; o LRCLIB falha ~30% das vezes de forma aleatória)
   → 200: usar; 404: passo 3
3. GET https://lrclib.net/api/search?track_name=&artist_name=
   → escolher o 1º resultado com |duration - durationSec| <= 5 s e syncedLyrics;
     senão, o 1º com plainLyrics
4. Com syncedLyrics → parse LRC → source=LRCLIB, synced=true
   Só com plainLyrics →
     (Fase 6, se processing.autoAlign) align.run(text) → source=ALIGNED, needsReview=false
     (antes da Fase 6)                 → source=PLAIN, synced=false, needsReview=true
   Nada encontrado →
     (Fase 6) align.transcribe() → source=TRANSCRIBED, needsReview=true
     (antes)  → source=NONE
5. Gravar songDir/letra.json (UTF-8, ensure_ascii=False) e também letra.lrc quando synced
```
- Parser de LRC: tags `[mm:ss.xx]` (várias por linha são permitidas, ex.: refrão repetido → duplicar a linha); ignorar tags de metadados `[ar:]`, `[ti:]`, `[offset:+/-ms]` (aplicar o offset); ordenar por `start`.
- `instrumental` (`"lrclib.instrumental": true`) → `source=NONE`, `message="Música instrumental"`.
- Falha de rede no LRCLIB **não falha o job**: segue com NONE e `needsReview=true`.

## 5.8a Fase 6 — Tempos por palavra (implementado em 2026-10-02)
Depois de alinhar as linhas com a voz, o passo LYRICS faz o **alinhamento forçado** do texto de cada linha com `voz.mp3` usando `torchaudio.pipelines.MMS_FA`, só dentro da janela da linha, e grava `words` em cada linha (`worker/caraoke_worker/word_alignment.py`). Detalhes, parâmetros e números em `docs/memory/sincronizacao-da-letra.md` §14. Controlado por `processing.autoAlign`. O Whisper abaixo ficou só para **transcrever** músicas sem letra.

## 5.8 Fase 6 — Alinhamento e transcrição (`steps/align.py`)
Usa **stable-ts** (`stable_whisper`) sobre a **voz isolada** (`voz.mp3`), o que dá muito mais precisão do que sobre a mixagem.
```python
import stable_whisper
model = stable_whisper.load_model(settings["processing.whisperModel"], device=device)  # 'small'

# Alinhar texto conhecido (preferido)
result = model.align(vocals_path, plain_text, language="pt")   # ou idioma detectado
# Transcrever (sem letra)
result = model.transcribe(vocals_path, language=None, vad=True, regroup=True)

for seg in result.segments:            # cada segmento ≈ uma linha
    line = {"start": seg.start, "end": seg.end, "text": seg.text.strip(),
            "words": [{"start": w.start, "end": w.end, "text": w.word.strip()} for w in seg.words]}
```
- No `align`, preserve as quebras de linha do texto original: passe o texto com `\n` e use `result.split_by_punctuation`/`regroup` apenas se necessário. **Critério de aceite:** o número de linhas resultante ≈ o número de linhas do texto (±10%).
- Idioma: `pt` padrão; se o título/artista não for brasileiro, deixe `language=None` (detecção automática).
- Modelo carregado uma vez e mantido em cache no processo enquanto houver jobs (libere após 5 min ocioso, para devolver a RAM).
- Device: `resolve_device` (a GT 1030 roda o whisper `small` com 2 GB, então `gpu` manual é viável aqui).

## 5.9 Etapa COVER (`steps/cover.py`)
Ordem de tentativa, salvando sempre `songDir/capa.jpg`:
1. **YouTube:** `https://i.ytimg.com/vi/<id>/maxresdefault.jpg`; se 404, `hqdefault.jpg`.
2. **Upload:** capa embutida via `mutagen` (`APIC` em MP3, `covr` em M4A, `pictures` em FLAC).
3. **iTunes Search API:** `https://itunes.apple.com/search?term=<artist title>&entity=song&limit=1&country=BR` → `artworkUrl100`, trocando `100x100` por `600x600`.
4. Nenhuma → `hasCover=False` (o front gera um cartão com gradiente).

Falhas aqui **não falham o job**.

## 5.10 Fase 7 — Etapa MELODY (`steps/melody.py`)
Extrai a melodia de referência da voz isolada para a pontuação por afinação.
```python
import parselmouth, numpy as np, subprocess
# 1) converter voz.mp3 → wav mono 16 kHz em tmp (ffmpeg)
subprocess.run(["ffmpeg", "-y", "-i", vocals, "-ac", "1", "-ar", "16000", wav], check=True, capture_output=True)
snd = parselmouth.Sound(wav)
pitch = snd.to_pitch(time_step=0.02, pitch_floor=75, pitch_ceiling=1000)
f0 = pitch.selected_array["frequency"]          # 0 = não vozeado
midi = [None if f <= 0 else round(69 + 12 * np.log2(f / 440.0), 1) for f in f0]
# 2) limpar ruído: remover trechos vozeados com menos de 5 frames (100 ms)
```
Saída `songDir/melodia.json`:
```json
{ "version": 1, "step": 0.02, "start": 0.0, "midi": [null, null, 57.2, 57.4, ...] }
```
Tamanho típico: 4 min ≈ 12.000 valores ≈ 60 KB. Ok.

**Implementação (2026-10-02):** `caraoke_worker/melody.py` decodifica a voz direto do ffmpeg (float32 16 kHz, sem wav temporário) e passa as amostras ao `parselmouth.Sound`; `start` = tempo do 1º quadro do Praat. Falha ou voz muda → `hasMelody=false`, **sem** derrubar o job (a nota fica só com a plateia). Leva ~0,3–1 s por música na CPU.
**Músicas antigas:** `npm run worker:melody` (`caraoke_worker.melody_backfill`) gera o `melodia.json` de toda pasta com `voz.mp3` e sem melodia, e avisa o backend por `POST /api/internal/songs/:id/melody` (marca `hasMelody` e emite `song:updated`). Pode rodar com o sistema ligado.

## 5.11 Logs e robustez
- `logging` com nível INFO, formato `%(asctime)s [worker] %(levelname)s %(message)s`.
- Qualquer exceção em uma etapa crítica (DOWNLOAD, SEPARATE) → `fail`. Etapas opcionais (LYRICS, COVER, MELODY) capturam os próprios erros e seguem em frente.
- O `tmp/<jobId>/` é sempre limpo no `finally`.
- **Ctrl+C:** termina o subprocesso atual e sai. O job fica RUNNING e o backend o recupera no próximo start (ou: ao iniciar o worker, ele não precisa fazer nada além disso).

## 5.12 Tempos esperados neste PC (para mensagens e testes)
| Etapa | Música de 4 min |
|---|---|
| Download | 5–20 s |
| Demucs `htdemucs` CPU | 4–6 min |
| LRCLIB | < 2 s |
| Alinhamento stable-ts `small` CPU | 1–3 min |
| Melodia | 5–15 s |

**Motivo da falta de letra (ADR-011):** a etapa LYRICS manda `lyricsNotice` no resultado: `SITE_UNREACHABLE` quando o LRCLIB não respondeu (erro de rede/HTTP), `NOT_FOUND` quando respondeu sem letra, `null` quando achou ou é instrumental. O backend grava em `songs.lyricsNotice` (zerado ao salvar a letra à mão).
