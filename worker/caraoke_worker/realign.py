import json
import logging
import shutil
import sys
from pathlib import Path

from .lrc import to_lrc
from .word_alignment import align_song_words

ORIGINAL_FILE = "letra.original.json"


def realign(song_dir: Path) -> int:
    lyrics_file = song_dir / "letra.json"
    vocals = song_dir / "voz.mp3"
    if not lyrics_file.exists() or not vocals.exists():
        print(f"Faltam letra.json ou voz.mp3 em {song_dir}")
        return 1

    document = json.loads(lyrics_file.read_text(encoding="utf-8"))
    if not document.get("synced"):
        print("A letra não tem tempos; alinhe as linhas antes (página de sincronizar).")
        return 1

    original = song_dir / ORIGINAL_FILE
    if not original.exists():
        shutil.copyfile(lyrics_file, original)

    lines = [{key: value for key, value in line.items() if key != "words"} for line in document["lines"]]
    timed = align_song_words(vocals, lines)
    if timed is None:
        print("Não foi possível alinhar as palavras.")
        return 1

    document["lines"] = timed
    lyrics_file.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    (song_dir / "letra.lrc").write_text(to_lrc(timed), encoding="utf-8")
    with_words = sum(1 for line in timed if line.get("words"))
    print(f"Palavras alinhadas em {with_words} de {len(timed)} linhas.")
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [realign] %(levelname)s %(message)s")
    if len(sys.argv) != 2:
        print("Uso: python -m caraoke_worker.realign <pasta da música>")
        return 2
    return realign(Path(sys.argv[1]))


if __name__ == "__main__":
    raise SystemExit(main())
