import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_API_URL = "http://127.0.0.1:3333"
POLL_INTERVAL_SECONDS = 3.0
HEARTBEAT_INTERVAL_SECONDS = 10.0
BACKEND_RETRY_SECONDS = 5.0


REMOTE_FLAG = "CARAOKE_REMOTE"
WORK_DIR_VARIABLE = "CARAOKE_WORK_DIR"
DEFAULT_REMOTE_FOLDER = "ProcessadorKaraoke"


def default_work_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / DEFAULT_REMOTE_FOLDER / "trabalho"


@dataclass(frozen=True)
class Config:
    api_url: str
    worker_token: str
    poll_interval_seconds: float = POLL_INTERVAL_SECONDS
    heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS
    work_dir: Path | None = None

    @staticmethod
    def load() -> "Config":
        load_dotenv(REPO_ROOT / ".env")
        worker_token = os.environ.get("WORKER_TOKEN", "")
        if not worker_token:
            raise RuntimeError("WORKER_TOKEN is missing from the .env file")
        is_remote = os.environ.get(REMOTE_FLAG) == "1"
        work_dir = Path(os.environ.get(WORK_DIR_VARIABLE) or default_work_dir()) if is_remote else None
        return Config(
            api_url=os.environ.get("API_URL", DEFAULT_API_URL).rstrip("/"),
            worker_token=worker_token,
            work_dir=work_dir,
        )
