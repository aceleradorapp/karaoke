from pathlib import Path
from typing import Any

import pytest

from caraoke_worker.context import JobContext

HARDWARE_CPU_ONLY = {"cudaAvailable": False, "gpuName": None, "vramMb": None}
HARDWARE_SMALL_GPU = {"cudaAvailable": True, "gpuName": "NVIDIA GeForce GT 1030", "vramMb": 2047}
HARDWARE_BIG_GPU = {"cudaAvailable": True, "gpuName": "RTX 3060", "vramMb": 12288}


class FakeApi:
    def __init__(self, cancel_on_call: int | None = None, settings: dict[str, Any] | None = None) -> None:
        self.progress_calls: list[dict[str, Any]] = []
        self.completed: list[tuple[str, dict[str, Any]]] = []
        self.failed: list[tuple[str, str, str | None]] = []
        self._settings = settings or {}
        self._cancel_on_call = cancel_on_call

    def settings(self) -> dict[str, Any]:
        return self._settings

    def progress(self, job_id: str, step: str, progress: int, message: str | None, device: str | None = None) -> bool:
        self.progress_calls.append(
            {"job_id": job_id, "step": step, "progress": progress, "message": message, "device": device}
        )
        return self._cancel_on_call is not None and len(self.progress_calls) >= self._cancel_on_call

    def complete(self, job_id: str, result: dict[str, Any]) -> None:
        self.completed.append((job_id, result))

    def fail(self, job_id: str, error: str, step: str | None = None) -> None:
        self.failed.append((job_id, error, step))


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def build_claim(
    storage_dir: Path,
    steps: list[str] | None = None,
    source: str = "UPLOAD",
    source_path: str | None = None,
    artist: str = "Chitãozinho & Xororó",
    title: str = "Evidências",
    youtube_id: str | None = None,
) -> dict[str, Any]:
    return {
        "job": {
            "id": "job1",
            "steps": steps or ["SEPARATE", "LYRICS", "COVER", "FINALIZE"],
            "sourcePath": source_path,
            "song": {"id": "song1", "title": title, "artist": artist, "source": source, "youtubeId": youtube_id},
        },
        "paths": {
            "storageDir": str(storage_dir),
            "songDir": str(storage_dir / "biblioteca" / "song1"),
            "tmpDir": str(storage_dir / "tmp"),
        },
    }


@pytest.fixture
def storage_dir(tmp_path: Path) -> Path:
    for relative in ("entrada/youtube", "entrada/upload", "biblioteca", "erro", "tmp"):
        (tmp_path / relative).mkdir(parents=True)
    return tmp_path


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def make_context(storage_dir: Path, clock: FakeClock):
    def factory(
        api: FakeApi | None = None,
        hardware: dict[str, Any] = HARDWARE_CPU_ONLY,
        settings: dict[str, Any] | None = None,
        **claim_options: Any,
    ) -> JobContext:
        fake_api = api or FakeApi()
        return JobContext(
            fake_api,  # type: ignore[arg-type]
            build_claim(storage_dir, **claim_options),
            settings or {},
            hardware,
            clock,
        )

    return factory
