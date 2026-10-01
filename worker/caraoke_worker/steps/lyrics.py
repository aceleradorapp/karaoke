import json
import logging
import os
from dataclasses import dataclass
from typing import Any

import requests

from ..context import JobContext
from ..lrc import build_document, parse_lrc, plain_text_lines, to_lrc
from ..titles import clean_title
from ..vocal_onset import detect_vocal_onset, suggest_offset_ms

logger = logging.getLogger(__name__)

LRCLIB_BASE_URL = "https://lrclib.net/api"
DEFAULT_USER_AGENT = "caraoke-michael/0.1 (personal use)"
REQUEST_TIMEOUT_SECONDS = 15
DURATION_TOLERANCE_SECONDS = 5
NOT_FOUND = 404


@dataclass
class LyricsMatch:
    synced: str | None = None
    plain: str | None = None
    instrumental: bool = False


def _headers() -> dict[str, str]:
    return {"User-Agent": os.environ.get("LRCLIB_USER_AGENT", DEFAULT_USER_AGENT)}


def _to_match(entry: dict[str, Any]) -> LyricsMatch:
    return LyricsMatch(
        synced=entry.get("syncedLyrics") or None,
        plain=entry.get("plainLyrics") or None,
        instrumental=bool(entry.get("instrumental")),
    )


def _is_close_enough(entry: dict[str, Any], duration: int | None) -> bool:
    entry_duration = entry.get("duration")
    if duration is None or entry_duration is None:
        return True
    return abs(float(entry_duration) - duration) <= DURATION_TOLERANCE_SECONDS


def pick_best(entries: list[dict[str, Any]], duration: int | None) -> LyricsMatch | None:
    close = [entry for entry in entries if _is_close_enough(entry, duration)]
    synced = [entry for entry in close if entry.get("syncedLyrics")]
    if synced:
        return _to_match(synced[0])
    plain = [entry for entry in close if entry.get("plainLyrics") or entry.get("instrumental")]
    return _to_match(plain[0]) if plain else None


def fetch_exact(session: requests.Session, artist: str, title: str, duration: int | None) -> LyricsMatch | None:
    params: dict[str, Any] = {"artist_name": artist, "track_name": title}
    if duration:
        params["duration"] = duration
    response = session.get(f"{LRCLIB_BASE_URL}/get", params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    if response.status_code == NOT_FOUND:
        return None
    response.raise_for_status()
    return _to_match(response.json())


def search(session: requests.Session, params: dict[str, str], duration: int | None) -> LyricsMatch | None:
    response = session.get(f"{LRCLIB_BASE_URL}/search", params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    return pick_best(response.json(), duration)


def find_in_order(session: requests.Session, artist: str, title: str, duration: int | None) -> LyricsMatch | None:
    attempts = (
        lambda: fetch_exact(session, artist, title, duration),
        lambda: search(session, {"track_name": title, "artist_name": artist}, duration),
        lambda: search(session, {"q": f"{artist} {title}".strip()}, duration),
    )
    for attempt in attempts:
        match = attempt()
        if match:
            return match
    return None


def find_lyrics(session: requests.Session, artist: str, title: str, duration: int | None) -> LyricsMatch | None:
    cleaned_title = clean_title(title)
    match = find_in_order(session, artist, cleaned_title, duration)
    if match or not artist:
        return match
    return find_in_order(session, cleaned_title, artist, duration)


def build_result(match: LyricsMatch | None) -> tuple[dict[str, Any] | None, str, bool]:
    if match is None:
        return None, "NONE", True
    if match.instrumental:
        return None, "NONE", False
    if match.synced:
        lines = parse_lrc(match.synced)
        if lines:
            return build_document("LRCLIB", True, lines), "LRCLIB", False
    if match.plain:
        return build_document("PLAIN", False, plain_text_lines(match.plain)), "PLAIN", True
    return None, "NONE", True


def write_documents(context: JobContext, document: dict[str, Any]) -> None:
    context.song_dir.mkdir(parents=True, exist_ok=True)
    (context.song_dir / "letra.json").write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    if document["synced"]:
        (context.song_dir / "letra.lrc").write_text(to_lrc(document["lines"]), encoding="utf-8")


def align_with_vocals(context: JobContext, document: dict[str, Any]) -> int:
    vocals = context.song_dir / "voz.mp3"
    if not document["synced"] or not document["lines"] or not vocals.exists():
        return 0
    context.report("LYRICS", 90, "Alinhando a letra com a voz…")
    try:
        onset = detect_vocal_onset(vocals)
    except Exception:
        logger.warning("Vocal onset detection failed", exc_info=True)
        return 0
    return suggest_offset_ms(document["lines"][0]["start"], onset)


def run(context: JobContext) -> None:
    context.report("LYRICS", 0, "Buscando a letra…")
    duration = context.result.get("durationSec")

    try:
        with requests.Session() as session:
            session.headers.update(_headers())
            match = find_lyrics(session, context.song["artist"], context.song["title"], duration)
    except requests.RequestException as error:
        logger.warning("Lyrics lookup failed: %s", error)
        match = None

    document, source, needs_review = build_result(match)
    offset_ms = 0
    if document:
        write_documents(context, document)
        offset_ms = align_with_vocals(context, document)
    context.result.update(lyricsSource=source, lyricsNeedsReview=needs_review, lyricsOffsetMs=offset_ms)
    context.report("LYRICS", 100, "Letra encontrada" if document else "Letra não encontrada")
