import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_API_URL = "http://127.0.0.1:3333"
POLL_INTERVAL_SECONDS = 3.0
HEARTBEAT_INTERVAL_SECONDS = 10.0
BACKEND_RETRY_SECONDS = 5.0


@dataclass(frozen=True)
class Config:
    api_url: str
    worker_token: str
    poll_interval_seconds: float = POLL_INTERVAL_SECONDS
    heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS

    @staticmethod
    def load() -> "Config":
        load_dotenv(REPO_ROOT / ".env")
        worker_token = os.environ.get("WORKER_TOKEN", "")
        if not worker_token:
            raise RuntimeError("WORKER_TOKEN is missing from the .env file")
        return Config(
            api_url=os.environ.get("API_URL", DEFAULT_API_URL).rstrip("/"),
            worker_token=worker_token,
        )
