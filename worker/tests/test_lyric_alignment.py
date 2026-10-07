import numpy as np
import pytest

from caraoke_worker import lyric_alignment
from caraoke_worker.lyric_alignment import (
    align_lines_with_vocals,
    fit_shift,
    snap_starts,
)
from caraoke_worker.vocal_onset import HOP_SECONDS

RATE = 8000


def voice_envelope(phrases: list[tuple[float, float]], total: float) -> np.ndarray:
    envelope = np.zeros(int(total / HOP_SECONDS), dtype=np.float32)
    for start, end in phrases:
        envelope[int(start / HOP_SECONDS) : int(end / HOP_SECONDS)] = 0.4
    return envelope


def lyric_lines(starts: list[float], length: float = 4.0) -> list[dict]:
    return [{"start": start, "end": start + length, "text": f"Linha {index}"} for index, start in enumerate(starts)]


ONSETS = np.array([30.0, 38.0, 47.0, 60.0, 68.0, 80.0])


class TestFitShift:
    def test_finds_the_constant_delay_between_the_lyrics_and_the_voice(self):
        starts = ONSETS - 15.0

        assert fit_shift(starts, ONSETS) == pytest.approx(15.0, abs=0.06)

    def test_finds_an_advance_too(self):
        assert fit_shift(ONSETS + 8.0, ONSETS) == pytest.approx(-8.0, abs=0.06)

    def test_ignores_a_line_that_has_no_voice_at_all(self):
        starts = np.append(ONSETS - 15.0, 500.0)

        assert fit_shift(starts, ONSETS) == pytest.approx(15.0, abs=0.06)

    def test_is_not_fooled_by_a_few_lines_that_are_far_off(self):
        starts = np.array([15.0, 23.0, 32.0, 45.0, 53.0, 71.0])

        assert fit_shift(starts, ONSETS) == pytest.approx(15.0, abs=0.06)

    def test_prefers_the_smaller_shift_when_two_fit_equally(self):
        onsets = np.array([10.0, 20.0, 30.0, 40.0, 50.0, 60.0])

        assert fit_shift(onsets.copy(), onsets) == pytest.approx(0.0, abs=0.06)

    def test_gives_up_with_too_few_lines_or_no_voice(self):
        assert fit_shift(np.array([10.0, 20.0]), ONSETS) is None
        assert fit_shift(ONSETS, np.zeros(0)) is None

    def test_accepts_a_fit_when_the_voice_has_fewer_pauses_than_the_lyrics_has_lines(self):
        starts = 10.0 + 4.0 * np.arange(20)
        onsets = np.array([14.0, 30.0, 46.0, 62.0, 78.0])

        assert fit_shift(starts, onsets) == pytest.approx(0.0, abs=0.06)

    def test_gives_up_when_almost_no_line_matches_a_phrase(self):
        starts = np.array([1.0, 3.7, 6.1, 9.3, 12.9, 15.3, 18.7, 21.1, 24.9, 27.7])
        onsets = np.array([100.0, 150.0, 200.0])

        assert fit_shift(starts, onsets) is None


class TestSnapStarts:
    def test_pulls_each_line_to_the_phrase_that_starts_near_it(self):
        snapped = snap_starts(np.array([30.4, 37.5, 47.9]), ONSETS)

        assert snapped == pytest.approx([30.0, 38.0, 47.0])

    def test_leaves_a_line_alone_when_no_phrase_is_close(self):
        snapped = snap_starts(np.array([30.0, 53.0, 60.0]), ONSETS)

        assert snapped == pytest.approx([30.0, 53.0, 60.0])

    def test_uses_each_phrase_only_once(self):
        snapped = snap_starts(np.array([37.6, 38.4]), ONSETS)

        assert snapped[0] == pytest.approx(38.0)
        assert snapped[1] > snapped[0]

    def test_keeps_the_lines_in_order_even_when_snapping_would_cross_them(self):
        snapped = snap_starts(np.array([47.0, 46.0]), ONSETS)

        assert snapped[1] > snapped[0]

    def test_works_without_any_phrase(self):
        assert snap_starts(np.array([5.0, 9.0]), np.zeros(0)) == pytest.approx([5.0, 9.0])


class TestAlignLines:
    def test_shifts_and_snaps_the_lines_to_the_voice(self):
        envelope = voice_envelope([(30, 36), (38, 44), (47, 53), (60, 66), (68, 74), (80, 86)], 100)
        lines = lyric_lines([15.0, 23.0, 32.2, 45.0, 52.0, 65.0])

        aligned = align_lines_with_vocals(lines, envelope)

        assert [line["start"] for line in aligned] == pytest.approx([30.0, 38.0, 47.0, 60.0, 68.0, 80.0], abs=0.06)
        assert [line["text"] for line in aligned] == [f"Linha {index}" for index in range(6)]

    def test_keeps_the_length_of_each_line_but_never_past_the_next_one(self):
        envelope = voice_envelope([(30, 36), (38, 44), (47, 53)], 60)
        lines = [
            {"start": 15.0, "end": 19.0, "text": "A"},
            {"start": 23.0, "end": 40.0, "text": "B"},
            {"start": 32.0, "end": 36.0, "text": "C"},
        ]

        aligned = align_lines_with_vocals(lines, envelope)

        assert aligned[0]["end"] == pytest.approx(aligned[0]["start"] + 4.0, abs=0.01)
        assert aligned[1]["end"] <= aligned[2]["start"] + 1e-9
        assert aligned[2]["end"] == pytest.approx(aligned[2]["start"] + 4.0, abs=0.01)

    def test_with_too_few_lines_it_aligns_the_first_line_with_the_first_voice(self):
        envelope = voice_envelope([(30, 40)], 60)
        lines = lyric_lines([10.0, 18.0])

        aligned = align_lines_with_vocals(lines, envelope)

        assert [line["start"] for line in aligned] == pytest.approx([30.0, 38.0], abs=0.06)

    def test_leaves_alone_a_small_difference_when_falling_back_to_the_first_voice(self):
        envelope = voice_envelope([(30.5, 40)], 60)

        assert align_lines_with_vocals(lyric_lines([30.0, 38.0]), envelope) is None

    def test_does_not_invent_times_when_there_is_no_voice(self):
        assert align_lines_with_vocals(lyric_lines([10.0, 20.0, 30.0]), np.zeros(1000, dtype=np.float32)) is None

    def test_does_nothing_without_lines(self):
        assert align_lines_with_vocals([], voice_envelope([(1, 2)], 5)) is None

    def test_never_produces_negative_times(self):
        envelope = voice_envelope([(1, 5), (8, 12), (15, 19), (22, 26)], 40)
        lines = lyric_lines([12.0, 20.0, 27.0, 34.0])

        aligned = align_lines_with_vocals(lines, envelope)

        assert min(line["start"] for line in aligned) >= 0

    def test_the_search_limit_is_one_minute(self):
        assert lyric_alignment.SHIFT_LIMIT_SECONDS == 60.0
