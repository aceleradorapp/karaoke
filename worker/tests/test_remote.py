from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import requests

from caraoke_worker import runner
from caraoke_worker.api import Api
from caraoke_worker.config import Config
from caraoke_worker.remote import with_local_paths
from conftest import FakeApi, build_claim

HARDWARE = {"cudaAvailable": True, "gpuName": "RTX", "vramMb": 8000}


class RemoteApi(FakeApi):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[str] = []
        self.uploaded: list[tuple[str, list[str]]] = []
        self.downloaded: list[str] = []

    def download_source(self, job_id: str, destination_dir: Path) -> Path:
        self.downloaded.append(job_id)
        target = destination_dir / "original.mp3"
        target.write_bytes(b"audio")
        return target

    def upload_files(self, song_id: str, files: list[Path]) -> None:
        self.events.append("upload")
        self.uploaded.append((song_id, [path.name for path in files]))

    def complete(self, job_id: str, result: dict[str, Any]) -> None:
        self.events.append("complete")
        super().complete(job_id, result)


def write_results(context) -> None:
    context.song_dir.mkdir(parents=True, exist_ok=True)
    for name in ("instrumental.mp3", "voz.mp3", "letra.json", "rascunho.tmp"):
        (context.song_dir / name).write_bytes(b"x")


def test_uses_its_own_folders_instead_of_the_server_ones(tmp_path):
    claim = build_claim(Path("D:/servidor/storage"))
    local = with_local_paths(claim, tmp_path)

    assert local["paths"]["songDir"] == str(tmp_path / "biblioteca" / "song1")
    assert claim["paths"]["storageDir"] == str(Path("D:/servidor/storage"))


def test_fetches_the_upload_sends_the_results_and_cleans_up(tmp_path, monkeypatch):
    seen_sources: list[Path | None] = []

    def separate(context):
        seen_sources.append(context.source_file)
        write_results(context)

    monkeypatch.setattr(runner, "STEP_HANDLERS", {"SEPARATE": separate, "FINALIZE": lambda context: None})
    api = RemoteApi()
    claim = build_claim(Path("D:/servidor/storage"), steps=["SEPARATE", "FINALIZE"], source_path="D:/servidor/x.mp3")

    runner.run_job(api, claim, HARDWARE, tmp_path)

    assert api.downloaded == ["job1"]
    assert seen_sources == [tmp_path / "entrada" / "upload" / "original.mp3"]
    assert api.uploaded == [("song1", ["instrumental.mp3", "voz.mp3", "letra.json"])]
    assert api.events == ["upload", "complete"]
    assert not (tmp_path / "biblioteca" / "song1").exists()
    assert api.failed == []


def test_downloads_youtube_songs_by_itself(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "STEP_HANDLERS", {"DOWNLOAD": write_results})
    api = RemoteApi()
    claim = build_claim(Path("D:/servidor"), steps=["DOWNLOAD"], source="YOUTUBE", youtube_id="abcdefghijk")

    runner.run_job(api, claim, HARDWARE, tmp_path)

    assert api.downloaded == []
    assert api.events == ["upload", "complete"]


def test_does_not_complete_when_sending_the_files_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "STEP_HANDLERS", {"SEPARATE": write_results})
    api = RemoteApi()

    def broken_upload(song_id, files):
        raise requests.ConnectionError("karaokê desligado")

    api.upload_files = broken_upload  # type: ignore[method-assign]
    runner.run_job(api, build_claim(Path("D:/servidor"), steps=["SEPARATE"]), HARDWARE, tmp_path)

    assert api.completed == []
    assert "karaokê desligado" in api.failed[0][1]
    assert not (tmp_path / "biblioteca" / "song1").exists()


def test_local_worker_keeps_writing_straight_to_the_library(storage_dir, monkeypatch):
    monkeypatch.setattr(runner, "STEP_HANDLERS", {"SEPARATE": write_results})
    api = FakeApi()

    runner.run_job(api, build_claim(storage_dir, steps=["SEPARATE"]), HARDWARE)

    assert (storage_dir / "biblioteca" / "song1" / "voz.mp3").exists()


def test_remote_mode_comes_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKER_TOKEN", "cw_token")
    monkeypatch.setenv("CARAOKE_REMOTE", "1")
    monkeypatch.setenv("CARAOKE_WORK_DIR", str(tmp_path))
    assert Config.load().work_dir == tmp_path

    monkeypatch.delenv("CARAOKE_REMOTE")
    assert Config.load().work_dir is None


def test_api_streams_the_source_and_sends_the_files_as_a_form(tmp_path):
    session = MagicMock(spec=requests.Session)
    session.headers = {}
    response = MagicMock()
    response.headers = {"Content-Disposition": 'attachment; filename="m%C3%BAsica.mp3"'}
    response.iter_content.return_value = [b"au", b"dio"]
    session.request.return_value = response
    api = Api("http://karaoke:3333", "cw_token", session)

    target = api.download_source("job1", tmp_path)

    assert target == tmp_path / "música.mp3"
    assert target.read_bytes() == b"audio"
    assert session.request.call_args.kwargs["stream"] is True

    voice = tmp_path / "voz.mp3"
    voice.write_bytes(b"v")
    api.upload_files("song1", [voice])
    method, url = session.request.call_args.args
    assert (method, url) == ("POST", "http://karaoke:3333/api/internal/songs/song1/files")
    assert session.request.call_args.kwargs["files"][0][1][0] == "voz.mp3"
