from typing import Any

import requests

REQUEST_TIMEOUT_SECONDS = 15
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

    def mark_melody(self, song_id: str) -> None:
        self._request("POST", f"/api/internal/songs/{song_id}/melody")

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        response = self._session.request(
            method, f"{self._base_url}{path}", timeout=REQUEST_TIMEOUT_SECONDS, **kwargs
        )
        response.raise_for_status()
        return response
