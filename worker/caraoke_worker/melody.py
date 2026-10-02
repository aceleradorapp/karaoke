import json
import math
from pathlib import Path

import numpy as np

from .vocal_onset import decode_samples

MELODY_FILE = "melodia.json"
MELODY_VERSION = 1
SAMPLE_RATE = 16000
MAX_SECONDS = 1200
TIME_STEP = 0.02
PITCH_FLOOR_HZ = 75
PITCH_CEILING_HZ = 1000
MIN_VOICED_FRAMES = 5
A4_HZ = 440.0
A4_MIDI = 69


def frequency_to_midi(frequency: float) -> float | None:
    if frequency <= 0 or math.isnan(frequency):
        return None
    return round(A4_MIDI + 12 * math.log2(frequency / A4_HZ), 1)


def drop_short_runs(midi: list[float | None], min_frames: int = MIN_VOICED_FRAMES) -> list[float | None]:
    cleaned = list(midi)
    index = 0
    while index < len(cleaned):
        if cleaned[index] is None:
            index += 1
            continue
        end = index
        while end < len(cleaned) and cleaned[end] is not None:
            end += 1
        if end - index < min_frames:
            cleaned[index:end] = [None] * (end - index)
        index = end
    return cleaned


def pitch_track(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> tuple[float, list[float | None]]:
    import parselmouth

    sound = parselmouth.Sound(samples.astype(np.float64), sampling_frequency=sample_rate)
    pitch = sound.to_pitch(time_step=TIME_STEP, pitch_floor=PITCH_FLOOR_HZ, pitch_ceiling=PITCH_CEILING_HZ)
    frequencies = pitch.selected_array["frequency"]
    midi = drop_short_runs([frequency_to_midi(float(frequency)) for frequency in frequencies])
    return float(pitch.xs()[0]) if len(frequencies) else 0.0, midi


def build_melody(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> dict:
    start, midi = pitch_track(samples, sample_rate)
    return {"version": MELODY_VERSION, "step": TIME_STEP, "start": round(start, 3), "midi": midi}


def extract_melody(vocals: Path, song_dir: Path) -> bool:
    samples = decode_samples(vocals, sample_rate=SAMPLE_RATE, max_seconds=MAX_SECONDS)
    if samples is None or len(samples) == 0:
        return False
    melody = build_melody(samples)
    if not any(value is not None for value in melody["midi"]):
        return False
    (song_dir / MELODY_FILE).write_text(json.dumps(melody, separators=(",", ":")), encoding="utf-8")
    return True
