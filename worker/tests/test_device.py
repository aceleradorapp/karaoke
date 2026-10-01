import pytest

from caraoke_worker.device import resolve_device

SMALL_GPU = {"cudaAvailable": True, "gpuName": "GeForce GT 1030", "vramMb": 2048}
BIG_GPU = {"cudaAvailable": True, "gpuName": "GeForce RTX 3060", "vramMb": 12288}
NO_GPU = {"cudaAvailable": False, "gpuName": None, "vramMb": None}


@pytest.mark.parametrize(
    ("mode", "hardware", "expected"),
    [
        ("auto", SMALL_GPU, "cpu"),
        ("auto", BIG_GPU, "cuda"),
        ("auto", NO_GPU, "cpu"),
        ("gpu", SMALL_GPU, "cuda"),
        ("gpu", NO_GPU, "cpu"),
        ("cpu", BIG_GPU, "cpu"),
    ],
)
def test_resolve_device(mode, hardware, expected):
    assert resolve_device(mode, hardware) == expected
