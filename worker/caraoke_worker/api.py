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

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        response = self._session.request(
            method, f"{self._base_url}{path}", timeout=REQUEST_TIMEOUT_SECONDS, **kwargs
        )
        response.raise_for_status()
        return response
