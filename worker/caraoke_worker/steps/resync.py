import json
import logging
from typing import Any

from ..context import JobContext
from ..errors import StepError
from ..lrc import build_document, to_lrc
from ..lyric_alignment import align_lines_with_vocals
from ..vocal_onset import analyze_vocals
from ..word_alignment import align_song_words

logger = logging.getLogger(__name__)

STEP = "RESYNC"
ORIGINAL_FILE = "letra.original.json"
LYRICS_FILE = "letra.json"
WORDS_START_PERCENT = 40


def read_base(context: JobContext) -> tuple[dict[str, Any], bool]:
    original = context.song_dir / ORIGINAL_FILE
    current = context.song_dir / LYRICS_FILE
    for path, is_original in ((original, True), (current, False)):
        if not path.exists():
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("synced") and document.get("lines"):
            return document, is_original
    raise StepError("A letra desta música não tem tempos para sincronizar")


def report_line(context: JobContext, index: int, total: int) -> None:
    percent = WORDS_START_PERCENT + (100 - WORDS_START_PERCENT - 1) * index / max(total, 1)
    context.report(STEP, percent, f"Alinhando as palavras com a voz… linha {index + 1} de {total}")


def run(context: JobContext) -> None:
    context.report(STEP, 0, "Preparando a letra…")
    vocals = context.song_dir / "voz.mp3"
    if not vocals.exists():
        raise StepError("A música não tem a voz separada")

    base, has_original = read_base(context)
    lines = [{key: value for key, value in line.items() if key != "words"} for line in base["lines"]]

    context.report(STEP, 15, "Alinhando as linhas com a voz…")
    envelope = analyze_vocals(vocals)
    aligned = (align_lines_with_vocals(lines, envelope) if envelope is not None else None) or lines

    context.report(STEP, 40, "Alinhando as palavras com a voz…")
    try:
        timed = align_song_words(vocals, aligned, on_line=lambda index, total: report_line(context, index, total)) or aligned
    except Exception:
        logger.warning("Aligning the words failed; keeping only the lines", exc_info=True)
        timed = aligned

    if not has_original:
        (context.song_dir / ORIGINAL_FILE).write_text(json.dumps(base, ensure_ascii=False), encoding="utf-8")
    document = build_document("ALIGNED", True, timed)
    (context.song_dir / LYRICS_FILE).write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    (context.song_dir / "letra.lrc").write_text(to_lrc(timed), encoding="utf-8")

    context.result.update(lyricsSource="ALIGNED", lyricsNeedsReview=False, lyricsOffsetMs=0, lyricsNotice=None)
    with_words = sum(1 for line in timed if line.get("words"))
    context.report(STEP, 100, f"Sincronização refeita ({with_words} de {len(timed)} linhas com palavras)")
