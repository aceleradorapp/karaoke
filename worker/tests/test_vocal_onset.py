import numpy as np
import pytest

from caraoke_worker import vocal_onset
from caraoke_worker.vocal_onset import (
    HOP_SECONDS,
    compute_envelope,
    detect_vocal_onset,
    find_onset,
    suggest_offset_ms,
)

RATE = vocal_onset.SAMPLE_RATE


def tone(seconds: float, amplitude: float) -> np.ndarray:
    time = np.arange(int(seconds * RATE)) / RATE
    return (amplitude * np.sin(2 * np.pi * 220 * time)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * RATE), dtype=np.float32)


def test_envelope_has_one_value_per_hop():
    envelope = compute_envelope(tone(2.0, 0.5))
    assert len(envelope) == int(2.0 / HOP_SECONDS)
    assert envelope[0] == pytest.approx(0.5 / np.sqrt(2), rel=0.05)


def test_envelope_of_empty_audio_is_empty():
    assert len(compute_envelope(np.zeros(0, dtype=np.float32))) == 0


def test_finds_where_the_voice_starts_after_silence():
    audio = np.concatenate([silence(12.0), tone(20.0, 0.4)])
    assert find_onset(compute_envelope(audio)) == pytest.approx(12.0, abs=0.1)


def test_ignores_leakage_far_below_the_voice_level():
    leakage = tone(10.0, 0.002)
    audio = np.concatenate([leakage, tone(20.0, 0.4)])
    assert find_onset(compute_envelope(audio)) == pytest.approx(10.0, abs=0.1)


def test_ignores_a_short_click_before_the_voice():
    click = tone(0.1, 0.8)
    audio = np.concatenate([silence(5.0), click, silence(5.0), tone(20.0, 0.4)])
    assert find_onset(compute_envelope(audio)) == pytest.approx(10.1, abs=0.15)


def test_returns_none_for_pure_silence_and_empty_envelope():
    assert find_onset(compute_envelope(silence(10.0))) is None
    assert find_onset(np.zeros(0, dtype=np.float32)) is None


def test_voice_from_the_very_first_second_starts_at_zero():
    assert find_onset(compute_envelope(tone(10.0, 0.4))) == pytest.approx(0.0, abs=0.05)


def test_suggests_a_delay_when_the_voice_comes_later_than_the_lyrics():
    assert suggest_offset_ms(19.24, 34.7) == 15460


def test_suggests_an_advance_when_the_voice_comes_earlier():
    assert suggest_offset_ms(20.0, 12.5) == -7500


@pytest.mark.parametrize("onset", [None, 19.8, 18.9, 200.0])
def test_does_not_touch_small_or_absurd_differences(onset):
    assert suggest_offset_ms(19.24, onset) == 0


def test_detect_returns_none_without_ffmpeg(monkeypatch, tmp_path):
    monkeypatch.setattr(vocal_onset, "find_ffmpeg", lambda: None)
    assert detect_vocal_onset(tmp_path / "voz.mp3") is None


def test_detect_returns_none_when_decoding_fails(monkeypatch, tmp_path):
    monkeypatch.setattr(vocal_onset, "find_ffmpeg", lambda: tmp_path / "ffmpeg")

    class Failed:
        returncode = 1
        stdout = b""

    monkeypatch.setattr(vocal_onset.subprocess, "run", lambda *args, **kwargs: Failed())
    assert detect_vocal_onset(tmp_path / "voz.mp3") is None
