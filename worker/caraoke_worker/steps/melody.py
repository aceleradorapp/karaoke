import logging

from ..context import JobContext
from ..melody import extract_melody

logger = logging.getLogger(__name__)

VOCALS_FILE = "voz.mp3"


def run(context: JobContext) -> None:
    context.report("MELODY", 0, "Extraindo a melodia para a pontuação…")
    vocals = context.song_dir / VOCALS_FILE
    has_melody = False
    if vocals.exists():
        try:
            has_melody = extract_melody(vocals, context.song_dir)
        except Exception as error:
            logger.warning("Melody extraction failed: %s", error)
    context.result["hasMelody"] = has_melody
    context.report("MELODY", 100, "Melodia pronta" if has_melody else "Sem melodia (a nota fica só com a plateia)")
