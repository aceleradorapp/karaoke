from pathlib import Path
from types import SimpleNamespace

import pytest

from caraoke_worker.errors import JobCanceled
from caraoke_worker.steps import cover

IMAGE = b"\xff\xd8" + b"x" * 3000
TINY = b"\xff\xd8tiny"


class FakeResponse:
    def __init__(self, status=200, content=b"", payload=None):
        self.status_code = status
        self.content = content
        self._payload = payload or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(str(self.status_code))


@pytest.fixture
def http(monkeypatch):
    routes: dict[str, FakeResponse] = {}
    requested: list[tuple[str, dict]] = []

    def fake_get(url, params=None, timeout=None):
        requested.append((url, params or {}))
        return routes.get(url, FakeResponse(404))

    monkeypatch.setattr(cover.requests, "get", fake_get)
    return SimpleNamespace(routes=routes, requested=requested)


def stored_cover(context) -> Path:
    return context.song_dir / "capa.jpg"


def test_prefers_the_highest_resolution_youtube_thumbnail(make_context, http):
    http.routes["https://i.ytimg.com/vi/abc/maxresdefault.jpg"] = FakeResponse(content=IMAGE)
    http.routes["https://i.ytimg.com/vi/abc/hqdefault.jpg"] = FakeResponse(content=IMAGE + b"hq")
    context = make_context(source="YOUTUBE", youtube_id="abc", steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE
    assert context.result["hasCover"] is True


def test_falls_back_to_the_standard_thumbnail_when_there_is_no_maxres(make_context, http):
    http.routes["https://i.ytimg.com/vi/abc/hqdefault.jpg"] = FakeResponse(content=IMAGE)
    context = make_context(source="YOUTUBE", youtube_id="abc", steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE


def test_rejects_placeholder_images_that_are_too_small(make_context, http):
    http.routes["https://i.ytimg.com/vi/abc/maxresdefault.jpg"] = FakeResponse(content=TINY)
    http.routes["https://i.ytimg.com/vi/abc/hqdefault.jpg"] = FakeResponse(content=TINY)
    context = make_context(source="YOUTUBE", youtube_id="abc", steps=["COVER"])

    cover.run(context)

    assert context.result["hasCover"] is False
    assert not stored_cover(context).exists()


def audio_with(**attributes):
    return SimpleNamespace(**attributes)


def test_reads_the_cover_embedded_in_an_mp3(make_context, http, monkeypatch, storage_dir):
    source = storage_dir / "entrada" / "upload" / "song.mp3"
    source.write_text("audio")
    tags = SimpleNamespace(getall=lambda name: [SimpleNamespace(data=IMAGE)] if name == "APIC" else [])
    monkeypatch.setattr(cover.mutagen, "File", lambda path: audio_with(tags=tags))
    context = make_context(source_path=str(source), steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE


def test_reads_the_cover_embedded_in_a_flac(make_context, http, monkeypatch, storage_dir):
    source = storage_dir / "entrada" / "upload" / "song.flac"
    source.write_text("audio")
    monkeypatch.setattr(cover.mutagen, "File", lambda path: audio_with(pictures=[SimpleNamespace(data=IMAGE)]))
    context = make_context(source_path=str(source), steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE


def test_reads_the_cover_embedded_in_an_m4a(make_context, http, monkeypatch, storage_dir):
    source = storage_dir / "entrada" / "upload" / "song.m4a"
    source.write_text("audio")
    tags = {"covr": [IMAGE]}
    monkeypatch.setattr(cover.mutagen, "File", lambda path: audio_with(tags=tags))
    context = make_context(source_path=str(source), steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE


def test_searches_itunes_and_asks_for_a_bigger_artwork(make_context, http, monkeypatch):
    monkeypatch.setattr(cover.mutagen, "File", lambda path: None)
    http.routes[cover.ITUNES_SEARCH_URL] = FakeResponse(
        payload={"results": [{"artworkUrl100": "https://img.test/art/100x100bb.jpg"}]}
    )
    http.routes["https://img.test/art/600x600bb.jpg"] = FakeResponse(content=IMAGE)
    context = make_context(steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE
    _, params = http.requested[0]
    assert params["term"] == "Chitãozinho & Xororó Evidências"
    assert params["country"] == "BR"


def test_finishes_without_a_cover_when_nothing_is_found(make_context, http):
    http.routes[cover.ITUNES_SEARCH_URL] = FakeResponse(payload={"results": []})
    context = make_context(steps=["COVER"])

    cover.run(context)

    assert context.result["hasCover"] is False


def test_keeps_going_when_one_source_fails(make_context, http, monkeypatch):
    def broken(*args, **kwargs):
        raise ConnectionError("offline")

    monkeypatch.setattr(cover, "youtube_cover", broken)
    http.routes[cover.ITUNES_SEARCH_URL] = FakeResponse(
        payload={"results": [{"artworkUrl100": "https://img.test/100x100.jpg"}]}
    )
    http.routes["https://img.test/600x600.jpg"] = FakeResponse(content=IMAGE)
    context = make_context(source="YOUTUBE", youtube_id="abc", steps=["COVER"])

    cover.run(context)

    assert stored_cover(context).read_bytes() == IMAGE


def test_lets_a_cancellation_through(make_context, monkeypatch):
    def canceled(*args, **kwargs):
        raise JobCanceled()

    monkeypatch.setattr(cover, "youtube_cover", canceled)
    context = make_context(source="YOUTUBE", youtube_id="abc", steps=["COVER"])

    with pytest.raises(JobCanceled):
        cover.run(context)
