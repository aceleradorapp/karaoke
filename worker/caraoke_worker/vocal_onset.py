import subprocess
from pathlib import Path

import numpy as np

from .tools import find_ffmpeg

SAMPLE_RATE = 8000
HOP_SECONDS = 0.05
ANALYZED_SECONDS = 150
REFERENCE_PERCENTILE = 90
THRESHOLD_RATIO = 0.15
SUSTAIN_SECONDS = 0.5
SUSTAIN_MIN_FRACTION = 0.8
MIN_REFERENCE_LEVEL = 1e-4

MIN_SHIFT_SECONDS = 1.0
MAX_SHIFT_SECONDS = 60.0
MILLISECONDS_PER_SECOND = 1000


def compute_envelope(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    hop = int(sample_rate * HOP_SECONDS)
    frames = len(samples) // hop
    if frames == 0:
        return np.zeros(0, dtype=np.float32)
    trimmed = samples[: frames * hop].astype(np.float64).reshape(frames, hop)
    return np.sqrt((trimmed**2).mean(axis=1)).astype(np.float32)


def find_onset(envelope: np.ndarray) -> float | None:
    if len(envelope) == 0:
        return None
    reference = float(np.percentile(envelope, REFERENCE_PERCENTILE))
    if reference < MIN_REFERENCE_LEVEL:
        return None

    loud = envelope > reference * THRESHOLD_RATIO
    window = max(1, int(round(SUSTAIN_SECONDS / HOP_SECONDS)))
    if len(loud) < window:
        return None

    counts = np.convolve(loud.astype(np.int32), np.ones(window, dtype=np.int32), mode="valid")
    sustained = np.flatnonzero(counts >= window * SUSTAIN_MIN_FRACTION)
    if sustained.size == 0:
        return None
    first = int(sustained[0])
    while not loud[first]:
        first += 1
    return first * HOP_SECONDS


def decode_samples(path: Path) -> np.ndarray | None:
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        return None
    command = [
        str(ffmpeg), "-v", "quiet", "-i", str(path), "-t", str(ANALYZED_SECONDS),
        "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-",
    ]  # fmt: skip
    completed = subprocess.run(command, capture_output=True, check=False)
    if completed.returncode != 0 or not completed.stdout:
        return None
    return np.frombuffer(completed.stdout, dtype=np.float32)


def detect_vocal_onset(path: Path) -> float | None:
    samples = decode_samples(path)
    if samples is None:
        return None
    return find_onset(compute_envelope(samples))


def suggest_offset_ms(first_line_start: float, onset: float | None) -> int:
    if onset is None:
        return 0
    shift = onset - first_line_start
    if abs(shift) < MIN_SHIFT_SECONDS or abs(shift) > MAX_SHIFT_SECONDS:
        return 0
    return int(round(shift * MILLISECONDS_PER_SECOND))
