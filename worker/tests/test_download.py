from pathlib import Path

import pytest

from caraoke_worker.errors import JobCanceled, StepError
from caraoke_worker.steps import download
from conftest import FakeApi


class FakeYoutubeDL:
    info: dict = {"duration": 215}
    produce_file = True
    progress_events: list[dict] = []
    created_with: dict = {}
    last_url: str | None = None
    downloaded_after_filter = False

    def __init__(self, options):
        self.options = options
        FakeYoutubeDL.created_with = options

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download):
        FakeYoutubeDL.last_url = url
        assert download is False
        return dict(FakeYoutubeDL.info)

    def process_ie_result(self, info, download):
        assert download is True
        FakeYoutubeDL.downloaded_after_filter = True
        for event in FakeYoutubeDL.progress_events:
            for hook in self.options["progress_hooks"]:
                hook(event)
        if FakeYoutubeDL.produce_file:
            Path(self.prepare_filename(info)).write_text("audio")
        return info

    def prepare_filename(self, info):
        return str(Path(self.options["outtmpl"].replace("%(ext)s", "webm")))


@pytest.fixture(autouse=True)
def fake_yt_dlp(monkeypatch):
    FakeYoutubeDL.info = {"duration": 215}
    FakeYoutubeDL.produce_file = True
    FakeYoutubeDL.progress_events = []
    FakeYoutubeDL.downloaded_after_filter = False
    monkeypatch.setattr(download.yt_dlp, "YoutubeDL", FakeYoutubeDL)


def youtube_context(make_context, api=None):
    return make_context(api, source="YOUTUBE", youtube_id="abc123DEF_-", steps=["DOWNLOAD"])


def test_downloads_the_audio_into_the_youtube_folder(make_context, storage_dir):
    context = youtube_context(make_context)

    download.run(context)

    assert context.downloaded_file == storage_dir / "entrada" / "youtube" / "song1.webm"
    assert context.downloaded_file.read_text() == "audio"
    assert FakeYoutubeDL.last_url == "https://www.youtube.com/watch?v=abc123DEF_-"


def test_asks_for_the_best_audio_without_playlists(make_context):
    download.run(youtube_context(make_context))

    options = FakeYoutubeDL.created_with
    assert options["format"] == "bestaudio/best"
    assert options["noplaylist"] is True
    assert options["outtmpl"].endswith("song1.%(ext)s")


def test_rejects_videos_longer_than_twelve_minutes_before_downloading(make_context):
    FakeYoutubeDL.info = {"duration": 12 * 60 + 1}

    with pytest.raises(StepError, match="12 minutos"):
        download.run(youtube_context(make_context))

    assert FakeYoutubeDL.downloaded_after_filter is False


def test_accepts_a_video_of_exactly_twelve_minutes(make_context):
    FakeYoutubeDL.info = {"duration": 12 * 60}
    download.run(youtube_context(make_context))
    assert FakeYoutubeDL.downloaded_after_filter is True


def test_reports_the_download_progress(make_context, clock):
    api = FakeApi()
    FakeYoutubeDL.progress_events = [
        {"status": "downloading", "downloaded_bytes": 250, "total_bytes": 1000},
        {"status": "downloading", "downloaded_bytes": 500, "total_bytes_estimate": 1000},
        {"status": "finished", "downloaded_bytes": 1000, "total_bytes": 1000},
    ]
    context = youtube_context(make_context, api)

    def tick(*args, **kwargs):
        clock.advance(2)

    original = api.progress

    def spy(*args, **kwargs):
        tick()
        return original(*args, **kwargs)

    api.progress = spy
    download.run(context)

    messages = [call["message"] for call in api.progress_calls]
    assert "Baixando do YouTube… 25%" in messages
    assert "Baixando do YouTube… 50%" in messages
    assert messages[-1] == "Download concluído"
    assert api.progress_calls[-1]["progress"] == 100


def test_stops_downloading_when_the_job_is_canceled(make_context):
    FakeYoutubeDL.progress_events = [{"status": "downloading", "downloaded_bytes": 10, "total_bytes": 100}]
    api = FakeApi(cancel_on_call=2)

    with pytest.raises(JobCanceled):
        download.run(youtube_context(make_context, api))


def test_requires_a_youtube_id(make_context):
    context = make_context(source="YOUTUBE", steps=["DOWNLOAD"])

    with pytest.raises(StepError, match="YouTube"):
        download.run(context)


def test_fails_when_the_downloaded_file_cannot_be_found(make_context):
    FakeYoutubeDL.produce_file = False

    with pytest.raises(StepError, match="não foi encontrado"):
        download.run(youtube_context(make_context))


def test_finds_the_file_even_when_the_extension_differs(make_context, storage_dir):
    FakeYoutubeDL.produce_file = False
    (storage_dir / "entrada" / "youtube" / "song1.m4a").write_text("audio")
    context = youtube_context(make_context)

    download.run(context)

    assert context.downloaded_file == storage_dir / "entrada" / "youtube" / "song1.m4a"


def test_calculates_the_percentage_from_known_or_estimated_totals():
    assert download.calculate_percent({"downloaded_bytes": 50, "total_bytes": 200}) == 25
    assert download.calculate_percent({"downloaded_bytes": 50, "total_bytes_estimate": 100}) == 50
    assert download.calculate_percent({"downloaded_bytes": 50}) is None
    assert download.calculate_percent({"total_bytes": 100}) is None
