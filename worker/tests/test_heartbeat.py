import requests

from caraoke_worker.heartbeat import HeartbeatThread
from conftest import HARDWARE_SMALL_GPU


class RecordingApi:
    def __init__(self, fail_times: int = 0, settings=None) -> None:
        self.heartbeats: list[dict] = []
        self._fail_times = fail_times
        self._settings = settings or {}

    def settings(self):
        if self._fail_times > 0:
            self._fail_times -= 1
            raise requests.ConnectionError("offline")
        return self._settings

    def heartbeat(self, payload):
        self.heartbeats.append(payload)


def test_sends_the_hardware_and_the_device_that_will_be_used():
    api = RecordingApi()
    thread = HeartbeatThread(api, HARDWARE_SMALL_GPU, 10)

    assert thread.send_once() is True

    payload = api.heartbeats[0]
    assert payload["gpuName"] == "NVIDIA GeForce GT 1030"
    assert payload["cudaAvailable"] is True
    assert payload["vramMb"] == 2047
    assert payload["device"] == "cpu"


def test_follows_the_device_chosen_in_the_settings():
    api = RecordingApi(settings={"processing.device": "gpu"})

    HeartbeatThread(api, HARDWARE_SMALL_GPU, 10).send_once()

    assert api.heartbeats[0]["device"] == "cuda"


def test_identifies_the_instance_with_a_stable_id_that_differs_between_processes():
    api = RecordingApi()
    first = HeartbeatThread(api, HARDWARE_SMALL_GPU, 10)
    second = HeartbeatThread(api, HARDWARE_SMALL_GPU, 10)

    first.send_once()
    first.send_once()
    second.send_once()

    ids = [payload["instanceId"] for payload in api.heartbeats]
    assert ids[0] == ids[1] != ids[2]
    assert len(ids[0]) == 32


def test_reports_failure_without_raising_when_the_backend_is_unreachable():
    api = RecordingApi(fail_times=1)
    thread = HeartbeatThread(api, HARDWARE_SMALL_GPU, 10)

    assert thread.send_once() is False
    assert thread.send_once() is True
    assert len(api.heartbeats) == 1
