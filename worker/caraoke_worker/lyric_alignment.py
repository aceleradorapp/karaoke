from typing import Any

import numpy as np

from .vocal_onset import find_onset, find_phrase_onsets

SHIFT_LIMIT_SECONDS = 60.0
SHIFT_STEP_SECONDS = 0.05
TRUNCATION_SECONDS = 2.0
MATCH_TOLERANCE_SECONDS = 0.5
MIN_MATCHED_FRACTION = 0.3
MIN_LINES_FOR_FIT = 3
SNAP_TOLERANCE_SECONDS = 1.8
MIN_LINE_GAP_SECONDS = 0.3
MIN_SHIFT_SECONDS = 1.0


def nearest_distance(points: np.ndarray, onsets: np.ndarray) -> np.ndarray:
    positions = np.searchsorted(onsets, points)
    before = onsets[np.clip(positions - 1, 0, len(onsets) - 1)]
    after = onsets[np.clip(positions, 0, len(onsets) - 1)]
    return np.minimum(np.abs(points - before), np.abs(points - after))


def fit_shift(starts: np.ndarray, onsets: np.ndarray) -> float | None:
    if len(starts) < MIN_LINES_FOR_FIT or len(onsets) == 0:
        return None

    shifts = np.arange(-SHIFT_LIMIT_SECONDS, SHIFT_LIMIT_SECONDS + SHIFT_STEP_SECONDS, SHIFT_STEP_SECONDS)
    candidates = starts[None, :] + shifts[:, None]
    distances = nearest_distance(candidates.ravel(), onsets).reshape(candidates.shape)
    costs = np.minimum(distances, TRUNCATION_SECONDS).mean(axis=1)

    best_cost = costs.min()
    tied = np.flatnonzero(costs <= best_cost + 1e-9)
    best = int(tied[np.argmin(np.abs(shifts[tied]))])

    matched = int((distances[best] <= MATCH_TOLERANCE_SECONDS).sum())
    matchable = min(len(starts), len(onsets))
    if matched < max(2, MIN_MATCHED_FRACTION * matchable):
        return None
    return float(shifts[best])


def snap_starts(starts: np.ndarray, onsets: np.ndarray) -> np.ndarray:
    snapped = starts.copy()
    used: set[int] = set()
    previous = -np.inf

    for index, start in enumerate(starts):
        position = int(np.argmin(np.abs(onsets - start))) if len(onsets) else -1
        can_snap = (
            position >= 0
            and position not in used
            and abs(onsets[position] - start) <= SNAP_TOLERANCE_SECONDS
            and onsets[position] > previous + MIN_LINE_GAP_SECONDS
        )
        if can_snap:
            snapped[index] = onsets[position]
            used.add(position)
        snapped[index] = max(snapped[index], previous + MIN_LINE_GAP_SECONDS)
        previous = snapped[index]
    return snapped


def first_onset_shift(first_start: float, envelope: np.ndarray) -> float | None:
    onset = find_onset(envelope)
    if onset is None:
        return None
    shift = onset - first_start
    return shift if abs(shift) >= MIN_SHIFT_SECONDS and abs(shift) <= SHIFT_LIMIT_SECONDS else None


def rebuild_lines(lines: list[dict[str, Any]], starts: np.ndarray) -> list[dict[str, Any]]:
    rebuilt: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        start = float(starts[index])
        duration = max(0.0, line["end"] - line["start"])
        next_start = float(starts[index + 1]) if index + 1 < len(lines) else None
        end = start + duration
        if next_start is not None:
            end = min(end, next_start)
        rebuilt.append({"start": round(start, 2), "end": round(max(end, start), 2), "text": line["text"]})
    return rebuilt


def align_lines_with_vocals(lines: list[dict[str, Any]], envelope: np.ndarray) -> list[dict[str, Any]] | None:
    if not lines:
        return None

    starts = np.array([line["start"] for line in lines], dtype=np.float64)
    onsets = find_phrase_onsets(envelope)
    shift = fit_shift(starts, onsets)

    if shift is None:
        shift = first_onset_shift(float(starts[0]), envelope)
        if shift is None:
            return None
        return rebuild_lines(lines, np.maximum(starts + shift, 0.0))

    shifted = np.maximum(starts + shift, 0.0)
    return rebuild_lines(lines, snap_starts(shifted, onsets))
