import subprocess
from pathlib import Path

import numpy as np

from .tools import find_ffmpeg

SAMPLE_RATE = 8000
HOP_SECONDS = 0.05
ANALYZED_SECONDS = 600
REFERENCE_PERCENTILE = 90
THRESHOLD_RATIO = 0.15
SUSTAIN_SECONDS = 0.5
SUSTAIN_MIN_FRACTION = 0.8
MIN_REFERENCE_LEVEL = 1e-4
PHRASE_GAP_SECONDS = 0.5


def compute_envelope(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    hop = int(sample_rate * HOP_SECONDS)
    frames = len(samples) // hop
    if frames == 0:
        return np.zeros(0, dtype=np.float32)
    trimmed = samples[: frames * hop].astype(np.float64).reshape(frames, hop)
    return np.sqrt((trimmed**2).mean(axis=1)).astype(np.float32)


def loud_mask(envelope: np.ndarray) -> np.ndarray | None:
    if len(envelope) == 0:
        return None
    audible = envelope[envelope > MIN_REFERENCE_LEVEL]
    if len(audible) == 0:
        return None
    reference = float(np.percentile(audible, REFERENCE_PERCENTILE))
    return envelope > reference * THRESHOLD_RATIO


def find_onset(envelope: np.ndarray) -> float | None:
    loud = loud_mask(envelope)
    if loud is None:
        return None

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


def find_phrase_onsets(envelope: np.ndarray) -> np.ndarray:
    loud = loud_mask(envelope)
    if loud is None:
        return np.zeros(0)

    gap = int(round(PHRASE_GAP_SECONDS / HOP_SECONDS))
    onsets = [
        index * HOP_SECONDS
        for index in range(len(loud))
        if loud[index] and not loud[max(0, index - gap) : index].any()
    ]
    return np.array(onsets)


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


def analyze_vocals(path: Path) -> np.ndarray | None:
    samples = decode_samples(path)
    if samples is None:
        return None
    return compute_envelope(samples)
