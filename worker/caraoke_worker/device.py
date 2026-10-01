from typing import Any

MIN_VRAM_FOR_AUTO_MB = 3500
BYTES_PER_MB = 1024 * 1024

DEVICE_AUTO = "auto"
DEVICE_GPU = "gpu"
DEVICE_CPU = "cpu"


def detect_hardware() -> dict[str, Any]:
    import torch

    hardware: dict[str, Any] = {
        "cudaAvailable": torch.cuda.is_available(),
        "gpuName": None,
        "vramMb": None,
    }
    if hardware["cudaAvailable"]:
        properties = torch.cuda.get_device_properties(0)
        hardware["gpuName"] = properties.name
        hardware["vramMb"] = properties.total_memory // BYTES_PER_MB
    return hardware


def resolve_device(mode: str, hardware: dict[str, Any]) -> str:
    if mode == DEVICE_CPU or not hardware["cudaAvailable"]:
        return "cpu"
    if mode == DEVICE_GPU:
        return "cuda"
    has_enough_memory = (hardware["vramMb"] or 0) >= MIN_VRAM_FOR_AUTO_MB
    return "cuda" if has_enough_memory else "cpu"
