import logging
from pathlib import Path

import mutagen
import requests

from ..context import JobContext
from ..errors import JobCanceled

logger = logging.getLogger(__name__)

YOUTUBE_THUMBNAIL_URLS = (
    "https://i.ytimg.com/vi/{id}/maxresdefault.jpg",
    "https://i.ytimg.com/vi/{id}/hqdefault.jpg",
)
ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
REQUEST_TIMEOUT_SECONDS = 15
MIN_IMAGE_BYTES = 2000
OK = 200


def download_image(url: str) -> bytes | None:
    response = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
    if response.status_code != OK or len(response.content) < MIN_IMAGE_BYTES:
        return None
    return response.content


def youtube_cover(youtube_id: str | None) -> bytes | None:
    if not youtube_id:
        return None
    for template in YOUTUBE_THUMBNAIL_URLS:
        image = download_image(template.format(id=youtube_id))
        if image:
            return image
    return None


def embedded_cover(source: Path | None) -> bytes | None:
    if source is None or not source.exists():
        return None
    audio = mutagen.File(source)
    if audio is None:
        return None

    pictures = getattr(audio, "pictures", None)
    if pictures:
        return bytes(pictures[0].data)

    tags = getattr(audio, "tags", None)
    if tags is None:
        return None
    if hasattr(tags, "getall"):
        frames = tags.getall("APIC")
        if frames:
            return bytes(frames[0].data)
    covers = tags.get("covr") if hasattr(tags, "get") else None
    return bytes(covers[0]) if covers else None


def itunes_cover(artist: str, title: str) -> bytes | None:
    response = requests.get(
        ITUNES_SEARCH_URL,
        params={"term": f"{artist} {title}", "entity": "song", "limit": 1, "country": "BR"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    results = response.json().get("results", [])
    if not results:
        return None
    artwork_url = results[0].get("artworkUrl100", "").replace("100x100", "600x600")
    return download_image(artwork_url) if artwork_url else None


def find_cover(context: JobContext) -> bytes | None:
    sources = (
        lambda: youtube_cover(context.song.get("youtubeId")),
        lambda: embedded_cover(context.source_file),
        lambda: itunes_cover(context.song["artist"], context.song["title"]),
    )
    for source in sources:
        try:
            image = source()
        except JobCanceled:
            raise
        except Exception as error:
            logger.warning("Cover source failed: %s", error)
            continue
        if image:
            return image
    return None


def run(context: JobContext) -> None:
    context.report("COVER", 0, "Buscando a capa…")
    image = find_cover(context)
    if image:
        context.song_dir.mkdir(parents=True, exist_ok=True)
        (context.song_dir / "capa.jpg").write_bytes(image)
        context.result["hasCover"] = True
    context.report("COVER", 100, "Capa encontrada" if image else "Sem capa")
