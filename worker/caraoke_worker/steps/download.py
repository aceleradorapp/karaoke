from pathlib import Path
from typing import Any

import yt_dlp

from ..context import JobContext
from ..errors import StepError

YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v={youtube_id}"
MAX_VIDEO_DURATION_SECONDS = 12 * 60
MAX_PERCENT = 100


def calculate_percent(progress: dict[str, Any]) -> float | None:
    total = progress.get("total_bytes") or progress.get("total_bytes_estimate")
    downloaded = progress.get("downloaded_bytes")
    if not total or downloaded is None:
        return None
    return downloaded / total * MAX_PERCENT


def build_options(context: JobContext) -> dict[str, Any]:
    def on_progress(progress: dict[str, Any]) -> None:
        if progress.get("status") != "downloading":
            return
        percent = calculate_percent(progress)
        if percent is not None:
            context.report("DOWNLOAD", percent, f"Baixando do YouTube… {int(percent)}%")

    return {
        "format": "bestaudio/best",
        "outtmpl": str(context.youtube_dir / f"{context.song['id']}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "retries": 3,
        "progress_hooks": [on_progress],
    }


def ensure_duration_allowed(info: dict[str, Any]) -> None:
    duration = info.get("duration")
    if duration and duration > MAX_VIDEO_DURATION_SECONDS:
        raise StepError("O vídeo tem mais de 12 minutos")


def locate_downloaded_file(context: JobContext, expected: Path) -> Path:
    if expected.exists():
        return expected
    matches = sorted(context.youtube_dir.glob(f"{context.song['id']}.*"))
    if matches:
        return matches[0]
    raise StepError("O download terminou, mas o arquivo não foi encontrado")


def run(context: JobContext) -> None:
    youtube_id = context.song.get("youtubeId")
    if not youtube_id:
        raise StepError("A música não tem um vídeo do YouTube associado")

    context.youtube_dir.mkdir(parents=True, exist_ok=True)
    context.report("DOWNLOAD", 0, "Preparando o download…")

    with yt_dlp.YoutubeDL(build_options(context)) as downloader:
        info = downloader.extract_info(YOUTUBE_WATCH_URL.format(youtube_id=youtube_id), download=False)
        ensure_duration_allowed(info)
        processed = downloader.process_ie_result(info, download=True)
        expected = Path(downloader.prepare_filename(processed))

    context.downloaded_file = locate_downloaded_file(context, expected)
    context.report("DOWNLOAD", MAX_PERCENT, "Download concluído")
