import json
from typing import Any

import numpy as np
import pytest
import requests

from caraoke_worker.steps import lyrics

SYNCED_LRC = "[00:10.00]Primeira\n[00:14.00]Segunda\n[00:20.00]Terceira"
PLAIN_TEXT = "Primeira linha\nSegunda linha"

NOT_FOUND = {"status": 404, "json": {}}


def found(synced: str | None = SYNCED_LRC, plain: str | None = PLAIN_TEXT, **extra: Any) -> dict[str, Any]:
    return {"status": 200, "json": {"syncedLyrics": synced, "plainLyrics": plain, **extra}}


def listing(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"status": 200, "json": list(entries)}


class FakeResponse:
    def __init__(self, status: int, payload: Any) -> None:
        self.status_code = status
        self._payload = payload

    def json(self) -> Any:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


class FakeSession:
    responder = None
    calls: list[tuple[str, dict[str, Any]]] = []

    def __init__(self) -> None:
        self.headers: dict[str, str] = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, url: str, params: dict[str, Any], timeout: int) -> FakeResponse:
        endpoint = url.rsplit("/", 1)[-1]
        FakeSession.calls.append((endpoint, params))
        reply = FakeSession.responder(endpoint, params)
        if isinstance(reply, Exception):
            raise reply
        return FakeResponse(reply["status"], reply["json"])


def serve(monkeypatch, responder):
    FakeSession.calls = []
    FakeSession.responder = staticmethod(responder)
    monkeypatch.setattr(lyrics.requests, "Session", FakeSession)


def lyrics_context(make_context, **options):
    context = make_context(steps=["LYRICS"], **options)
    context.result["durationSec"] = 215
    return context


def stored_document(context) -> dict[str, Any]:
    return json.loads((context.song_dir / "letra.json").read_text(encoding="utf-8"))


def test_uses_the_exact_match_and_writes_the_json_and_lrc_files(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found())
    context = lyrics_context(make_context)

    lyrics.run(context)

    document = stored_document(context)
    assert document["source"] == "LRCLIB"
    assert document["synced"] is True
    assert [line["text"] for line in document["lines"]] == ["Primeira", "Segunda", "Terceira"]
    assert (context.song_dir / "letra.lrc").read_text(encoding="utf-8").startswith("[00:10.00]Primeira")
    assert context.result["lyricsSource"] == "LRCLIB"
    assert context.result["lyricsNeedsReview"] is False


def test_sends_the_artist_title_and_song_duration_to_lrclib(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found())

    lyrics.run(lyrics_context(make_context))

    endpoint, params = FakeSession.calls[0]
    assert endpoint == "get"
    assert params == {"artist_name": "Chitãozinho & Xororó", "track_name": "Evidências", "duration": 215}


def test_removes_karaoke_noise_from_the_title_before_searching(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found())

    lyrics.run(lyrics_context(make_context, title="Evidências (Karaoke Version)"))

    assert FakeSession.calls[0][1]["track_name"] == "Evidências"


def test_falls_back_to_a_search_picking_the_synced_entry_with_a_close_duration(make_context, monkeypatch):
    entries = [
        {"duration": 400, "syncedLyrics": "[00:01.00]Longa", "plainLyrics": "Longa"},
        {"duration": 217, "syncedLyrics": None, "plainLyrics": "Só texto"},
        {"duration": 214, "syncedLyrics": SYNCED_LRC, "plainLyrics": PLAIN_TEXT},
    ]

    def responder(endpoint, params):
        return NOT_FOUND if endpoint == "get" else listing(*entries)

    serve(monkeypatch, responder)
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert context.result["lyricsSource"] == "LRCLIB"
    assert stored_document(context)["lines"][0]["text"] == "Primeira"


def test_ignores_search_results_with_a_very_different_duration(make_context, monkeypatch):
    far = {"duration": 400, "syncedLyrics": SYNCED_LRC, "plainLyrics": PLAIN_TEXT}
    serve(monkeypatch, lambda endpoint, params: NOT_FOUND if endpoint == "get" else listing(far))
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert context.result["lyricsSource"] == "NONE"
    assert not (context.song_dir / "letra.json").exists()


def test_keeps_plain_text_lyrics_marked_for_review_when_there_is_no_sync(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found(synced=None))
    context = lyrics_context(make_context)

    lyrics.run(context)

    document = stored_document(context)
    assert document["source"] == "PLAIN"
    assert document["synced"] is False
    assert [line["text"] for line in document["lines"]] == ["Primeira linha", "Segunda linha"]
    assert not (context.song_dir / "letra.lrc").exists()
    assert context.result["lyricsSource"] == "PLAIN"
    assert context.result["lyricsNeedsReview"] is True


def test_reports_instrumental_tracks_without_lyrics_and_without_review(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found(synced=None, plain=None, instrumental=True))
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert context.result["lyricsSource"] == "NONE"
    assert context.result["lyricsNeedsReview"] is False
    assert not (context.song_dir / "letra.json").exists()


def test_marks_the_song_for_review_when_nothing_is_found(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: NOT_FOUND if endpoint == "get" else listing())
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert context.result["lyricsSource"] == "NONE"
    assert context.result["lyricsNeedsReview"] is True


def test_tries_the_swapped_artist_and_title_when_the_first_order_finds_nothing(make_context, monkeypatch):
    def responder(endpoint, params):
        lrclib_knows_it_as_artist_first = endpoint == "get" and params["artist_name"] == "Chitãozinho & Xororó"
        if lrclib_knows_it_as_artist_first:
            return found()
        return NOT_FOUND if endpoint == "get" else listing()

    serve(monkeypatch, responder)
    context = lyrics_context(make_context, artist="Evidências", title="Chitãozinho & Xororó")

    lyrics.run(context)

    assert context.result["lyricsSource"] == "LRCLIB"
    last_endpoint, last_params = FakeSession.calls[-1]
    assert last_endpoint == "get"
    assert (last_params["artist_name"], last_params["track_name"]) == ("Chitãozinho & Xororó", "Evidências")


def test_uses_a_free_text_search_as_a_last_resort(make_context, monkeypatch):
    entry = {"duration": 215, "syncedLyrics": SYNCED_LRC, "plainLyrics": PLAIN_TEXT}

    def responder(endpoint, params):
        if endpoint == "search" and "q" in params:
            return listing(entry)
        return NOT_FOUND if endpoint == "get" else listing()

    serve(monkeypatch, responder)
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert context.result["lyricsSource"] == "LRCLIB"


def test_does_not_fail_the_job_when_lrclib_is_unreachable(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: requests.ConnectionError("offline"))
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert context.result["lyricsSource"] == "NONE"
    assert context.result["lyricsNeedsReview"] is True


def test_falls_back_to_plain_text_when_the_synced_lyrics_cannot_be_parsed():
    document, source, needs_review = lyrics.build_result(lyrics.LyricsMatch(synced="no timestamps", plain="Texto"))

    assert (source, needs_review) == ("PLAIN", True)
    assert document["lines"][0]["text"] == "Texto"


def test_searches_without_a_duration_filter_when_the_duration_is_unknown(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found())
    context = make_context(steps=["LYRICS"])

    lyrics.run(context)

    assert "duration" not in FakeSession.calls[0][1]


SPREAD_LRC = "[00:10.00]Primeira\n[00:18.00]Segunda\n[00:27.00]Terceira\n[00:40.00]Quarta"


def voice_at(*phrases):
    envelope = np.zeros(6000, dtype=np.float32)
    for start, end in phrases:
        envelope[int(start * 20) : int(end * 20)] = 0.4
    return envelope


def run_with_vocals(make_context, monkeypatch, envelope, synced=SPREAD_LRC):
    serve(monkeypatch, lambda endpoint, params: found(synced=synced))
    monkeypatch.setattr(lyrics, "analyze_vocals", lambda path: envelope)
    context = lyrics_context(make_context)
    context.song_dir.mkdir(parents=True, exist_ok=True)
    (context.song_dir / "voz.mp3").write_bytes(b"x")
    lyrics.run(context)
    return context


def test_aligns_every_line_with_the_voice_and_keeps_the_original_lyrics(make_context, monkeypatch):
    envelope = voice_at((25, 31), (33, 39), (42, 48), (55, 61))

    context = run_with_vocals(make_context, monkeypatch, envelope)

    document = stored_document(context)
    assert document["source"] == "ALIGNED"
    assert [round(line["start"]) for line in document["lines"]] == [25, 33, 42, 55]
    original = json.loads((context.song_dir / "letra.original.json").read_text(encoding="utf-8"))
    assert original["source"] == "LRCLIB"
    assert [line["start"] for line in original["lines"]] == [10.0, 18.0, 27.0, 40.0]
    assert context.result["lyricsSource"] == "ALIGNED"
    assert context.result["lyricsOffsetMs"] == 0
    assert (context.song_dir / "letra.lrc").read_text(encoding="utf-8").startswith("[00:25.")


def test_keeps_the_lyrics_as_they_came_when_no_voice_is_found(make_context, monkeypatch):
    context = run_with_vocals(make_context, monkeypatch, np.zeros(6000, dtype=np.float32))

    document = stored_document(context)
    assert document["source"] == "LRCLIB"
    assert [line["start"] for line in document["lines"]] == [10.0, 18.0, 27.0, 40.0]
    assert not (context.song_dir / "letra.original.json").exists()
    assert context.result["lyricsSource"] == "LRCLIB"


def test_does_not_align_lyrics_without_timestamps(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found(synced=None))
    monkeypatch.setattr(lyrics, "analyze_vocals", lambda path: pytest.fail("must not analyze"))
    context = lyrics_context(make_context)
    context.song_dir.mkdir(parents=True, exist_ok=True)
    (context.song_dir / "voz.mp3").write_bytes(b"x")

    lyrics.run(context)

    assert context.result["lyricsSource"] == "PLAIN"
    assert context.result["lyricsOffsetMs"] == 0


def test_does_not_try_to_align_when_there_is_no_vocals_file(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found(synced=SPREAD_LRC))
    monkeypatch.setattr(lyrics, "analyze_vocals", lambda path: pytest.fail("must not analyze"))
    context = lyrics_context(make_context)

    lyrics.run(context)

    assert stored_document(context)["source"] == "LRCLIB"


def test_a_failure_while_analyzing_never_breaks_the_lyrics(make_context, monkeypatch):
    serve(monkeypatch, lambda endpoint, params: found())

    def explode(path):
        raise RuntimeError("boom")

    monkeypatch.setattr(lyrics, "analyze_vocals", explode)
    context = lyrics_context(make_context)
    context.song_dir.mkdir(parents=True, exist_ok=True)
    (context.song_dir / "voz.mp3").write_bytes(b"x")

    lyrics.run(context)

    assert context.result["lyricsSource"] == "LRCLIB"
    assert stored_document(context)["lines"][0]["start"] == 10.0
