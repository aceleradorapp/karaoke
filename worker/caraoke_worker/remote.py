import copy
import shutil
from pathlib import Path
from typing import Any

from .context import JobContext

RESULT_FILES = (
    "instrumental.mp3",
    "voz.mp3",
    "letra.json",
    "letra.original.json",
    "letra.lrc",
    "capa.jpg",
    "melodia.json",
)
YOUTUBE_SOURCE = "YOUTUBE"


def with_local_paths(claim: dict[str, Any], work_dir: Path) -> dict[str, Any]:
    local = copy.deepcopy(claim)
    song_id = local["job"]["song"]["id"]
    local["paths"] = {
        "storageDir": str(work_dir),
        "songDir": str(work_dir / "biblioteca" / song_id),
        "tmpDir": str(work_dir / "tmp"),
    }
    return local


def fetch_source(context: JobContext) -> None:
    has_server_file = context.job.get("sourcePath") and context.song.get("source") != YOUTUBE_SOURCE
    if not has_server_file:
        return
    context.report("DOWNLOAD", 0, "Baixando o arquivo do karaokê…")
    destination = context.storage_dir / "entrada" / "upload"
    destination.mkdir(parents=True, exist_ok=True)
    context.downloaded_file = context.api.download_source(context.job["id"], destination)
    context.report("DOWNLOAD", 100, "Arquivo recebido")


def send_results(context: JobContext) -> None:
    files = [context.song_dir / name for name in RESULT_FILES if (context.song_dir / name).exists()]
    context.report("FINALIZE", 50, "Enviando as músicas prontas para o karaokê…")
    context.api.upload_files(context.song["id"], files)


def discard_local_files(context: JobContext) -> None:
    shutil.rmtree(context.song_dir, ignore_errors=True)
