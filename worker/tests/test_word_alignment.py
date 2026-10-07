import numpy as np
import pytest

from caraoke_worker import word_alignment
from caraoke_worker.vocal_onset import HOP_SECONDS
from caraoke_worker.word_alignment import (
    WordSpan,
    add_word_timings,
    align_line_words,
    align_song_words,
    fill_missing,
    normalize_word,
    trim_to_voice,
)

RATE = word_alignment.ALIGN_SAMPLE_RATE


class FakeAligner:
    """Places word i of each call at 0.6 + 0.5 * i seconds inside the chunk, lasting 0.4 s."""

    def __init__(self, score: float = 0.9, step: float = 0.5, length: float = 0.4) -> None:
        self.calls: list[tuple[int, list[str]]] = []
        self.score = score
        self.step = step
        self.length = length

    def align(self, samples: np.ndarray, words: list[str]) -> list[WordSpan]:
        self.calls.append((len(samples), words))
        return [
            WordSpan(0.6 + index * self.step, 0.6 + index * self.step + self.length, self.score)
            for index in range(len(words))
        ]


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * RATE), dtype=np.float32)


def loud_between(total: float, *ranges: tuple[float, float]) -> np.ndarray:
    loud = np.zeros(int(total / HOP_SECONDS), dtype=bool)
    for start, end in ranges:
        loud[int(start / HOP_SECONDS) : int(end / HOP_SECONDS)] = True
    return loud


def line(start: float, end: float, text: str) -> dict:
    return {"start": start, "end": end, "text": text}


class TestNormalizeWord:
    @pytest.mark.parametrize(
        ("word", "expected"),
        [
            ("Braços", "bracos"),
            ("À", "a"),
            ("você,", "voce"),
            ("Atrás!", "atras"),
            ("d'água", "d'agua"),
            ("2", ""),
            ("—", ""),
        ],
    )
    def test_keeps_only_plain_letters(self, word, expected):
        assert normalize_word(word) == expected


class TestAlignLineWords:
    def test_sends_only_the_words_that_can_be_aligned(self):
        aligner = FakeAligner()

        spans = align_line_words(aligner, silence(3), ["Eu", "—", "você"])

        assert aligner.calls[0][1] == ["eu", "voce"]
        assert spans[1] is None
        assert spans[0] is not None and spans[2] is not None

    def test_gives_nothing_when_no_word_can_be_aligned(self):
        aligner = FakeAligner()
        assert align_line_words(aligner, silence(3), ["2", "—"]) == [None, None]
        assert aligner.calls == []


def test_fill_missing_places_a_missing_word_right_after_the_previous_one():
    filled = fill_missing([WordSpan(1, 2, 0.9), None, WordSpan(3, 4, 0.8)])
    assert filled[1] == WordSpan(2, 2, 0.0)


def test_fill_missing_places_a_missing_first_word_at_the_next_one():
    filled = fill_missing([None, WordSpan(3, 4, 0.8)])
    assert filled[0] == WordSpan(3, 3, 0.0)


def test_fill_missing_gives_up_when_nothing_was_found():
    assert fill_missing([None, None]) is None


class TestTrimToVoice:
    def test_cuts_the_end_where_the_voice_stops(self):
        loud = loud_between(10, (1.0, 3.0))
        assert trim_to_voice(1.0, 6.0, loud) == pytest.approx(3.0 + 0.1, abs=0.06)

    def test_stops_at_the_first_real_silence_even_if_the_voice_comes_back_later(self):
        loud = loud_between(10, (1.0, 2.0), (4.0, 5.0))
        assert trim_to_voice(1.0, 4.6, loud) == pytest.approx(2.1, abs=0.06)

    def test_ignores_a_short_breath_inside_the_word(self):
        loud = loud_between(10, (1.0, 2.0), (2.15, 3.0))
        assert trim_to_voice(1.0, 6.0, loud) == pytest.approx(3.1, abs=0.06)

    def test_waits_for_the_voice_when_the_word_starts_a_bit_early(self):
        loud = loud_between(10, (1.5, 2.5))
        assert trim_to_voice(1.0, 6.0, loud) == pytest.approx(2.6, abs=0.06)

    def test_never_makes_a_word_longer(self):
        loud = loud_between(10, (1.0, 8.0))
        assert trim_to_voice(1.0, 2.0, loud) == 2.0

    def test_leaves_the_word_alone_when_there_is_no_voice_inside_it(self):
        loud = loud_between(10, (5.0, 6.0))
        assert trim_to_voice(1.0, 2.0, loud) == 2.0

    def test_keeps_a_minimum_length(self):
        loud = loud_between(10, (0.0, 0.05))
        assert trim_to_voice(1.0, 2.0, loud) == 2.0
        assert trim_to_voice(0.0, 2.0, loud) >= 0.05

    def test_works_without_a_voice_map(self):
        assert trim_to_voice(1.0, 2.0, None) == 2.0


class TestAddWordTimings:
    def test_gives_each_word_its_time_in_the_song(self):
        audio = silence(30)
        lines = [line(10.0, 14.0, "Eu sei que"), line(20.0, 24.0, "vou te amar")]

        timed, count = add_word_timings(lines, audio, None, FakeAligner())

        assert count == 2
        first = timed[0]["words"]
        assert [word["text"] for word in first] == ["Eu", "sei", "que"]
        assert [word["start"] for word in first] == [10.0, 10.5, 11.0]
        assert first[0]["end"] == pytest.approx(10.4)

    def test_ends_the_line_when_its_last_word_ends(self):
        timed, _ = add_word_timings([line(10.0, 19.0, "Eu sei"), line(20.0, 24.0, "Fim")], silence(30), None, FakeAligner())
        assert timed[0]["end"] == pytest.approx(10.9)

    def test_cuts_a_held_word_where_the_voice_stops(self):
        aligner = FakeAligner(length=5.0)
        loud = loud_between(30, (10.0, 11.2))

        timed, _ = add_word_timings([line(10.0, 19.0, "amor"), line(20.0, 24.0, "Fim")], silence(30), loud, aligner)

        assert timed[0]["words"][0]["end"] == pytest.approx(11.3, abs=0.06)

    def test_never_lets_a_word_run_into_the_next_line(self):
        aligner = FakeAligner(length=9.0)
        timed, _ = add_word_timings([line(10.0, 14.0, "amor"), line(15.0, 18.0, "Fim")], silence(30), None, aligner)
        assert timed[0]["words"][0]["end"] <= 15.0
        assert timed[0]["end"] <= 15.0

    def test_moves_the_line_start_back_when_the_first_word_comes_earlier(self):
        lines = [line(5.0, 8.0, "Antes"), line(10.0, 14.0, "Eu sei")]
        aligner_early = FakeAligner()
        aligner_early.align = lambda samples, words: [WordSpan(0.2 + i * 0.5, 0.6 + i * 0.5, 0.9) for i in range(len(words))]

        timed, _ = add_word_timings(lines, silence(30), None, aligner_early)

        assert timed[1]["start"] == pytest.approx(9.6)

    def test_moves_the_line_start_forward_when_the_first_word_comes_later(self):
        lines = [line(5.0, 8.0, "Olhei"), line(10.0, 14.0, "De ver")]
        late = FakeAligner()
        late.align = lambda samples, words: [WordSpan(2.2 + i * 0.4, 2.5 + i * 0.4, 0.9) for i in range(len(words))]

        timed, _ = add_word_timings(lines, silence(30), None, late)

        assert timed[1]["start"] == pytest.approx(11.6)
        assert timed[1]["words"][0]["start"] == pytest.approx(11.6)

    def test_also_searches_where_the_line_was_before_the_magnet(self):
        snapped_late = {**line(12.0, 14.0, "Há flores"), "anchor": 10.5}
        aligner = FakeAligner()

        timed, _ = add_word_timings([snapped_late], silence(30), None, aligner)

        assert aligner.calls[0][0] / RATE == pytest.approx(12.0 + 12.0 - 9.9, abs=0.01)
        assert "anchor" not in timed[0]

    def test_reaches_until_where_the_next_line_was_before_the_magnet(self):
        current = line(14.0, 18.0, "sempre tão linda")
        pulled_early = {**line(18.4, 26.0, "Contemplar"), "anchor": 20.1}
        aligner = FakeAligner()

        add_word_timings([current, pulled_early], silence(40), None, aligner)

        assert aligner.calls[0][0] / RATE == pytest.approx(20.1 + 0.3 - 13.4, abs=0.01)

    def test_never_keeps_the_anchor_on_a_line_without_words(self):
        unsure = {**line(12.0, 14.0, "Há flores"), "anchor": 10.5}
        timed, _ = add_word_timings([unsure], silence(30), None, FakeAligner(score=0.0))
        assert "anchor" not in timed[0]

    def test_tells_which_line_it_is_working_on(self):
        seen = []
        add_word_timings([line(10.0, 14.0, "Eu"), line(20.0, 24.0, "vou")], silence(60), None, FakeAligner(), on_line=lambda i, n: seen.append((i, n)))
        assert seen == [(0, 2), (1, 2)]

    def test_never_moves_a_line_start_before_the_previous_line(self):
        lines = [line(9.5, 9.8, "A"), line(10.0, 14.0, "Eu sei")]
        early = FakeAligner()
        early.align = lambda samples, words: [WordSpan(0.0, 0.3, 0.9) for _ in words]

        timed, _ = add_word_timings(lines, silence(30), None, early)

        assert timed[1]["start"] >= timed[0]["start"] + 0.3 - 1e-9

    def test_keeps_a_line_without_words_when_the_alignment_is_unsure(self):
        lines = [line(10.0, 14.0, "Eu sei"), line(20.0, 24.0, "vou")]

        timed, count = add_word_timings(lines, silence(30), None, FakeAligner(score=0.05))

        assert count == 0
        assert timed == lines

    def test_replaces_old_words_of_a_line(self):
        old = {**line(10.0, 14.0, "Eu"), "words": [{"start": 1, "end": 2, "text": "x"}]}
        unsure, _ = add_word_timings([old], silence(30), None, FakeAligner(score=0.0))
        assert "words" not in unsure[0]

    def test_uses_a_window_around_each_line(self):
        aligner = FakeAligner()
        add_word_timings([line(10.0, 14.0, "Eu"), line(20.0, 24.0, "vou")], silence(60), None, aligner)

        first_window = aligner.calls[0][0] / RATE
        last_window = aligner.calls[1][0] / RATE
        assert first_window == pytest.approx(20.3 - 9.4, abs=0.01)
        assert last_window == pytest.approx(32.0 - 19.4, abs=0.01)

    def test_skips_a_line_without_text(self):
        timed, count = add_word_timings([line(10.0, 14.0, "   ")], silence(30), None, FakeAligner())
        assert count == 0 and "words" not in timed[0]


class TestAlignSongWords:
    def test_gives_nothing_when_the_audio_cannot_be_read(self, monkeypatch, tmp_path):
        monkeypatch.setattr(word_alignment, "decode_samples", lambda *args, **kwargs: None)
        assert align_song_words(tmp_path / "voz.mp3", [line(1, 2, "Eu")], FakeAligner()) is None

    def test_returns_the_lines_with_words(self, monkeypatch, tmp_path):
        monkeypatch.setattr(word_alignment, "decode_samples", lambda *args, **kwargs: silence(20))

        timed = align_song_words(tmp_path / "voz.mp3", [line(5.0, 8.0, "Eu sei")], FakeAligner())

        assert timed is not None and [word["text"] for word in timed[0]["words"]] == ["Eu", "sei"]

    def test_gives_nothing_when_no_line_got_words(self, monkeypatch, tmp_path):
        monkeypatch.setattr(word_alignment, "decode_samples", lambda *args, **kwargs: silence(20))
        assert align_song_words(tmp_path / "voz.mp3", [line(5.0, 8.0, "Eu")], FakeAligner(score=0.0)) is None
