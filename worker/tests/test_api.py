from unittest.mock import MagicMock

import pytest
import requests

from caraoke_worker.api import Api


def build_api(status_code: int, json_body=None) -> tuple[Api, MagicMock]:
    session = MagicMock(spec=requests.Session)
    session.headers = {}
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    response.raise_for_status.side_effect = (
        requests.HTTPError(f"{status_code}") if status_code >= 400 else None
    )
    session.request.return_value = response
    return Api("http://api.test", "secret-token", session), session


def test_sends_the_worker_token_header():
    _, session = build_api(204)
    assert session.headers["X-Worker-Token"] == "secret-token"


def test_claim_returns_none_when_the_queue_is_empty():
    api, _ = build_api(204)
    assert api.claim() is None


def test_claim_returns_the_job_payload():
    payload = {"job": {"id": "abc"}}
    api, session = build_api(200, payload)
    assert api.claim() == payload
    assert session.request.call_args.args[:2] == ("POST", "http://api.test/api/internal/jobs/claim")


def test_raises_on_http_errors():
    api, _ = build_api(401)
    with pytest.raises(requests.HTTPError):
        api.claim()
