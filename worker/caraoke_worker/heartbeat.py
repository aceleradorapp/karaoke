import logging
import threading
import uuid
from typing import Any

from .api import Api
from .device import DEVICE_AUTO, resolve_device

SETTINGS_DEVICE_KEY = "processing.device"

logger = logging.getLogger(__name__)


def read_ytdlp_version() -> str | None:
    try:
        from yt_dlp.version import __version__
    except ImportError:
        return None
    return __version__


class HeartbeatThread(threading.Thread):
    def __init__(self, api: Api, hardware: dict[str, Any], interval_seconds: float) -> None:
        super().__init__(name="heartbeat", daemon=True)
        self._api = api
        self._hardware = hardware
        self._interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self.instance_id = uuid.uuid4().hex

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.wait(self._interval_seconds):
            self.send_once()

    def send_once(self) -> bool:
        try:
            mode = self._api.settings().get(SETTINGS_DEVICE_KEY, DEVICE_AUTO)
            self._api.heartbeat(self._build_payload(mode))
            return True
        except Exception as error:
            logger.warning("Heartbeat failed: %s", error)
            return False

    def _build_payload(self, mode: str) -> dict[str, Any]:
        return {
            "instanceId": self.instance_id,
            "device": resolve_device(mode, self._hardware),
            "ytdlpVersion": read_ytdlp_version(),
            **self._hardware,
        }
