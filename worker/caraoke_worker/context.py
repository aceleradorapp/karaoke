import subprocess
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .api import Api
from .device import DEVICE_AUTO, resolve_device
from .errors import JobCanceled

MIN_REPORT_INTERVAL_SECONDS = 1.0
MAX_PERCENT = 100
DEVICE_LABEL_MAX_LENGTH = 40
SETTINGS_DEVICE_KEY = "processing.device"


def clamp_percent(value: float) -> int:
    return max(0, min(MAX_PERCENT, int(round(value))))


class JobContext:
    def __init__(
        self,
        api: Api,
        claim: dict[str, Any],
        settings: dict[str, Any],
        hardware: dict[str, Any],
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.api = api
        self.job: dict[str, Any] = claim["job"]
        self.song: dict[str, Any] = claim["job"]["song"]
        self.settings = settings
        self.hardware = hardware
        self.result: dict[str, Any] = {
            "durationSec": None,
            "hasInstrumental": False,
            "hasVocals": False,
            "hasCover": False,
            "hasMelody": False,
            "lyricsSource": "NONE",
            "lyricsNeedsReview": False,
            "lyricsOffsetMs": 0,
        }
        self.current_step: str | None = None
        self.process: subprocess.Popen | None = None
        self.downloaded_file: Path | None = None

        paths = claim["paths"]
        self.storage_dir = Path(paths["storageDir"])
        self.song_dir = Path(paths["songDir"])
        self.tmp_dir = Path(paths["tmpDir"]) / self.job["id"]
        self.youtube_dir = self.storage_dir / "entrada" / "youtube"

        self._clock = clock
        self._last_report_at: float | None = None
        self._last_reported_step: str | None = None

    @property
    def source_file(self) -> Path | None:
        if self.downloaded_file:
            return self.downloaded_file
        source_path = self.job.get("sourcePath")
        return Path(source_path) if source_path else None

    @property
    def device_mode(self) -> str:
        return self.settings.get(SETTINGS_DEVICE_KEY, DEVICE_AUTO)

    @property
    def resolved_device(self) -> str:
        return resolve_device(self.device_mode, self.hardware)

    def device_label(self, device: str) -> str:
        if device == "cuda":
            return f"cuda:{self.hardware.get('gpuName') or 'GPU'}"
        return "cpu"

    def report(self, step: str, percent: float, message: str | None = None, device: str | None = None) -> None:
        self.current_step = step
        percent_value = clamp_percent(percent)

        now = self._clock()
        is_due = self._last_report_at is None or now - self._last_report_at >= MIN_REPORT_INTERVAL_SECONDS
        is_forced = step != self._last_reported_step or percent_value >= MAX_PERCENT
        if not (is_due or is_forced):
            return

        self._last_report_at = now
        self._last_reported_step = step
        label = device[:DEVICE_LABEL_MAX_LENGTH] if device else None
        if self.api.progress(self.job["id"], step, percent_value, message, label):
            raise JobCanceled()
