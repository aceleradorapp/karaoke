import re
from contextlib import ExitStack
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import requests

REQUEST_TIMEOUT_SECONDS = 15
TRANSFER_TIMEOUT_SECONDS = 600
CHUNK_BYTES = 1024 * 1024
FILENAME_PATTERN = re.compile(r'filename="([^"]+)"')
NO_CONTENT = 204


class Api:
    def __init__(self, base_url: str, worker_token: str, session: requests.Session | None = None) -> None:
        self._base_url = base_url
        self._session = session or requests.Session()
        self._session.headers.update({"X-Worker-Token": worker_token})

    def heartbeat(self, payload: dict[str, Any]) -> None:
        self._request("POST", "/api/internal/worker/heartbeat", json=payload)

    def settings(self) -> dict[str, Any]:
        response = self._request("GET", "/api/internal/settings")
        return response.json()

    def claim(self) -> dict[str, Any] | None:
        response = self._request("POST", "/api/internal/jobs/claim")
        if response.status_code == NO_CONTENT:
            return None
        return response.json()

    def progress(
        self, job_id: str, step: str, progress: int, message: str | None, device: str | None = None
    ) -> bool:
        payload: dict[str, Any] = {"step": step, "progress": progress, "message": message}
        if device:
            payload["device"] = device
        response = self._request("PATCH", f"/api/internal/jobs/{job_id}/progress", json=payload)
        return bool(response.json().get("cancel"))

    def complete(self, job_id: str, result: dict[str, Any]) -> None:
        self._request("POST", f"/api/internal/jobs/{job_id}/complete", json=result)

    def fail(self, job_id: str, error: str, step: str | None = None) -> None:
        payload: dict[str, Any] = {"error": error}
        if step:
            payload["step"] = step
        self._request("POST", f"/api/internal/jobs/{job_id}/fail", json=payload)

    def download_source(self, job_id: str, destination_dir: Path) -> Path:
        response = self._request(
            "GET", f"/api/internal/jobs/{job_id}/source", stream=True, timeout=TRANSFER_TIMEOUT_SECONDS
        )
        match = FILENAME_PATTERN.search(response.headers.get("Content-Disposition", ""))
        filename = Path(unquote(match.group(1))).name if match else f"{job_id}.audio"
        target = destination_dir / filename
        with target.open("wb") as output:
            for chunk in response.iter_content(CHUNK_BYTES):
                output.write(chunk)
        return target

    def upload_files(self, song_id: str, files: list[Path]) -> None:
        with ExitStack() as stack:
            parts = [("files", (path.name, stack.enter_context(path.open("rb")))) for path in files]
            self._request(
                "POST", f"/api/internal/songs/{song_id}/files", files=parts, timeout=TRANSFER_TIMEOUT_SECONDS
            )

    def mark_melody(self, song_id: str) -> None:
        self._request("POST", f"/api/internal/songs/{song_id}/melody")

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        kwargs.setdefault("timeout", REQUEST_TIMEOUT_SECONDS)
        response = self._session.request(method, f"{self._base_url}{path}", **kwargs)
        response.raise_for_status()
        return response
