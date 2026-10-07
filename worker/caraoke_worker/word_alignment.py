import logging
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Callable
from typing import Any, Protocol

import numpy as np

from .vocal_onset import HOP_SECONDS, compute_envelope, decode_samples, loud_mask

logger = logging.getLogger(__name__)

ALIGN_SAMPLE_RATE = 16000
MAX_SONG_SECONDS = 900
WINDOW_BEFORE_SECONDS = 0.6
WINDOW_AFTER_SECONDS = 0.3
LAST_LINE_WINDOW_SECONDS = 12.0
MIN_LINE_SCORE = 0.2
END_PADDING_SECONDS = 0.1
MIN_WORD_SECONDS = 0.05
MIN_LINE_GAP_SECONDS = 0.3
SILENCE_GAP_SECONDS = 0.25
ALLOWED_CHARACTERS = set("abcdefghijklmnopqrstuvwxyz'")


@dataclass
class WordSpan:
    start: float
    end: float
    score: float


class Aligner(Protocol):
    def align(self, samples: np.ndarray, words: list[str]) -> list[WordSpan]: ...


def normalize_word(word: str) -> str:
    decomposed = unicodedata.normalize("NFKD", word.lower())
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return "".join(char for char in plain if char in ALLOWED_CHARACTERS)


class MmsAligner:
    def __init__(self) -> None:
        import torch
        from torchaudio.pipelines import MMS_FA

        self._torch = torch
        self._model = MMS_FA.get_model(with_star=True)
        self._model.eval()
        self._tokenizer = MMS_FA.get_tokenizer()
        self._aligner = MMS_FA.get_aligner()

    def align(self, samples: np.ndarray, words: list[str]) -> list[WordSpan]:
        waveform = self._torch.from_numpy(np.array(samples, dtype=np.float32)).unsqueeze(0)
        with self._torch.inference_mode():
            emission, _ = self._model(waveform)
        token_spans = self._aligner(emission[0], self._tokenizer(["*", *words, "*"]))
        seconds_per_frame = samples.shape[0] / emission.shape[1] / ALIGN_SAMPLE_RATE

        spans: list[WordSpan] = []
        for tokens in token_spans[1:-1]:
            frames = sum(token.end - token.start for token in tokens)
            score = sum(token.score * (token.end - token.start) for token in tokens) / max(frames, 1)
            spans.append(
                WordSpan(tokens[0].start * seconds_per_frame, tokens[-1].end * seconds_per_frame, float(score))
            )
        return spans


def align_line_words(aligner: Aligner, samples: np.ndarray, texts: list[str]) -> list[WordSpan | None]:
    normalized = [normalize_word(text) for text in texts]
    alignable = [word for word in normalized if word]
    if not alignable:
        return [None for _ in texts]

    spans = iter(aligner.align(samples, alignable))
    return [next(spans) if word else None for word in normalized]


def fill_missing(spans: list[WordSpan | None]) -> list[WordSpan] | None:
    known = [span for span in spans if span is not None]
    if not known:
        return None

    filled: list[WordSpan] = []
    for index, span in enumerate(spans):
        if span is not None:
            filled.append(span)
            continue
        anchor = filled[-1].end if filled else next(item for item in spans[index:] if item is not None).start
        filled.append(WordSpan(anchor, anchor, 0.0))
    return filled


def trim_to_voice(start: float, end: float, loud: np.ndarray | None) -> float:
    if loud is None or len(loud) == 0:
        return end
    first = max(0, int(start / HOP_SECONDS))
    last = min(len(loud) - 1, int(end / HOP_SECONDS))
    gap_frames = int(round(SILENCE_GAP_SECONDS / HOP_SECONDS))

    last_voiced: int | None = None
    silent_run = 0
    for index in range(first, last + 1):
        if loud[index]:
            last_voiced = index
            silent_run = 0
        elif last_voiced is not None:
            silent_run += 1
            if silent_run >= gap_frames:
                break

    if last_voiced is None:
        return end
    voice_end = (last_voiced + 1) * HOP_SECONDS + END_PADDING_SECONDS
    return max(min(end, voice_end), start + MIN_WORD_SECONDS)


def mean_score(spans: list[WordSpan | None]) -> float:
    scores = [span.score for span in spans if span is not None]
    return sum(scores) / len(scores) if scores else 0.0


def add_word_timings(
    lines: list[dict[str, Any]],
    audio: np.ndarray,
    loud: np.ndarray | None,
    aligner: Aligner,
    sample_rate: int = ALIGN_SAMPLE_RATE,
    on_line: Callable[[int, int], None] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    duration = len(audio) / sample_rate
    result: list[dict[str, Any]] = []
    aligned_count = 0

    for index, line in enumerate(lines):
        if on_line:
            on_line(index, len(lines))
        next_start = lines[index + 1]["start"] if index + 1 < len(lines) else None
        earliest = min(line["start"], line.get("anchor", line["start"]))
        window_start = max(0.0, earliest - WINDOW_BEFORE_SECONDS)
        window_end = min(
            duration,
            next_start + WINDOW_AFTER_SECONDS if next_start is not None else line["start"] + LAST_LINE_WINDOW_SECONDS,
        )
        texts = line["text"].split()
        chunk = audio[int(window_start * sample_rate) : int(window_end * sample_rate)]

        spans = align_line_words(aligner, chunk, texts) if len(chunk) and texts else []
        filled = fill_missing(spans) if spans and mean_score(spans) >= MIN_LINE_SCORE else None
        if filled is None:
            result.append({key: value for key, value in line.items() if key not in ("words", "anchor")})
            continue

        previous_start = result[-1]["start"] if result else None
        words: list[dict[str, Any]] = []
        for text, span in zip(texts, filled):
            start = window_start + span.start
            end = trim_to_voice(start, window_start + span.end, loud)
            if next_start is not None:
                end = min(end, next_start)
            words.append({"start": round(start, 2), "end": round(max(end, start), 2), "text": text})

        lower_bound = previous_start + MIN_LINE_GAP_SECONDS if previous_start is not None else 0.0
        line_start = max(words[0]["start"], lower_bound)
        line_end = words[-1]["end"] if next_start is None else min(words[-1]["end"], next_start)
        result.append(
            {"start": round(line_start, 2), "end": round(max(line_end, line_start), 2), "text": line["text"], "words": words}
        )
        aligned_count += 1

    return result, aligned_count


def align_song_words(
    vocals: Path,
    lines: list[dict[str, Any]],
    aligner: Aligner | None = None,
    on_line: Callable[[int, int], None] | None = None,
) -> list[dict[str, Any]] | None:
    audio = decode_samples(vocals, sample_rate=ALIGN_SAMPLE_RATE, max_seconds=MAX_SONG_SECONDS)
    if audio is None or len(audio) == 0:
        return None

    loud = loud_mask(compute_envelope(audio, ALIGN_SAMPLE_RATE))
    timed, aligned_count = add_word_timings(lines, audio, loud, aligner or MmsAligner(), on_line=on_line)
    logger.info("Word timings found for %d of %d lines", aligned_count, len(lines))
    return timed if aligned_count > 0 else None
