import logging
import os
from collections.abc import Callable
from pathlib import Path

from .api import Api
from .config import REPO_ROOT, Config
from .melody import MELODY_FILE, extract_melody

VOCALS_FILE = "voz.mp3"
LIBRARY_DIR = "biblioteca"
DEFAULT_STORAGE_DIR = "storage"

logger = logging.getLogger("melody_backfill")


def storage_dir() -> Path:
    configured = Path(os.environ.get("STORAGE_DIR", DEFAULT_STORAGE_DIR))
    return configured if configured.is_absolute() else REPO_ROOT / configured


def songs_without_melody(library: Path) -> list[Path]:
    return sorted(
        song_dir
        for song_dir in library.iterdir()
        if song_dir.is_dir() and (song_dir / VOCALS_FILE).exists() and not (song_dir / MELODY_FILE).exists()
    )


def backfill(library: Path, mark_melody: Callable[[str], None]) -> tuple[int, int]:
    pending = songs_without_melody(library)
    done = 0
    for index, song_dir in enumerate(pending, start=1):
        logger.info("(%d/%d) %s", index, len(pending), song_dir.name)
        if not extract_melody(song_dir / VOCALS_FILE, song_dir):
            logger.warning("Sem melodia: %s", song_dir.name)
            continue
        try:
            mark_melody(song_dir.name)
            done += 1
        except Exception as error:
            logger.warning("Não foi possível avisar o backend sobre %s: %s", song_dir.name, error)
    return done, len(pending)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [melodia] %(levelname)s %(message)s")
    config = Config.load()
    api = Api(config.api_url, config.worker_token)
    library = storage_dir() / LIBRARY_DIR
    done, total = backfill(library, api.mark_melody)
    print(f"Melodia gerada em {done} de {total} músicas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
