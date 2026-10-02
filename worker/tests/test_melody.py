import json
import math

import numpy as np
import pytest

from caraoke_worker import melody, melody_backfill
from caraoke_worker.melody import SAMPLE_RATE, build_melody, drop_short_runs, frequency_to_midi
from caraoke_worker.steps import melody as melody_step
from tests.conftest import FakeApi

A3_HZ = 220.0
A3_MIDI = 57.0


def tone(frequency: float, seconds: float) -> np.ndarray:
    times = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.4 * np.sin(2 * math.pi * frequency * times)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)


def test_converts_frequencies_to_midi_and_ignores_unvoiced_frames():
    assert frequency_to_midi(440.0) == 69.0
    assert frequency_to_midi(A3_HZ) == A3_MIDI
    assert frequency_to_midi(0.0) is None
    assert frequency_to_midi(float("nan")) is None


def test_drops_voiced_runs_shorter_than_five_frames():
    midi = [None, 60.0, 60.1, None, 62.0, 62.0, 62.1, 62.0, 61.9, None, 64.0]
    assert drop_short_runs(midi) == [None, None, None, None, 62.0, 62.0, 62.1, 62.0, 61.9, None, None]


def test_follows_a_sung_note_and_stays_silent_in_the_pauses():
    samples = np.concatenate([silence(0.5), tone(A3_HZ, 1.0), silence(0.5), tone(A3_HZ * 2, 1.0)])

    result = build_melody(samples)

    assert result["version"] == 1
    assert result["step"] == 0.02
    voiced = [value for value in result["midi"] if value is not None]
    assert len(voiced) > 80
    first_note = [value for value in voiced if value < 63]
    second_note = [value for value in voiced if value >= 63]
    assert np.median(first_note) == pytest.approx(A3_MIDI, abs=0.3)
    assert np.median(second_note) == pytest.approx(A3_MIDI + 12, abs=0.3)
    start_index = int(round((0.2 - result["start"]) / result["step"]))
    assert result["midi"][start_index] is None


def test_writes_the_melody_file_next_to_the_song(tmp_path, monkeypatch):
    monkeypatch.setattr(melody, "decode_samples", lambda *args, **kwargs: tone(A3_HZ, 1.0))

    assert melody.extract_melody(tmp_path / "voz.mp3", tmp_path) is True

    saved = json.loads((tmp_path / "melodia.json").read_text(encoding="utf-8"))
    assert any(value is not None for value in saved["midi"])


def test_writes_nothing_when_the_vocals_are_silent_or_unreadable(tmp_path, monkeypatch):
    monkeypatch.setattr(melody, "decode_samples", lambda *args, **kwargs: silence(1.0))
    assert melody.extract_melody(tmp_path / "voz.mp3", tmp_path) is False

    monkeypatch.setattr(melody, "decode_samples", lambda *args, **kwargs: None)
    assert melody.extract_melody(tmp_path / "voz.mp3", tmp_path) is False
    assert not (tmp_path / "melodia.json").exists()


@pytest.fixture
def context(tmp_path):
    from caraoke_worker.context import JobContext
    from tests.conftest import HARDWARE_CPU_ONLY

    claim = {
        "job": {"id": "job1", "steps": ["MELODY"], "song": {"id": "song1", "title": "T", "artist": "A"}},
        "paths": {"storageDir": str(tmp_path), "songDir": str(tmp_path / "song1"), "tmpDir": str(tmp_path / "tmp")},
    }
    (tmp_path / "song1").mkdir()
    return JobContext(FakeApi(), claim, {}, HARDWARE_CPU_ONLY)


def test_step_marks_the_song_when_the_melody_was_extracted(context, monkeypatch):
    (context.song_dir / "voz.mp3").write_bytes(b"x")
    monkeypatch.setattr(melody_step, "extract_melody", lambda vocals, song_dir: True)

    melody_step.run(context)

    assert context.result["hasMelody"] is True
    assert context.api.progress_calls[-1]["message"] == "Melodia pronta"


def test_step_does_not_fail_the_job_without_vocals_or_when_extraction_breaks(context, monkeypatch):
    melody_step.run(context)
    assert context.result["hasMelody"] is False

    (context.song_dir / "voz.mp3").write_bytes(b"x")

    def broken(vocals, song_dir):
        raise RuntimeError("praat failed")

    monkeypatch.setattr(melody_step, "extract_melody", broken)
    melody_step.run(context)
    assert context.result["hasMelody"] is False


def test_backfill_only_processes_songs_with_vocals_and_without_melody(tmp_path, monkeypatch):
    for name, files in {
        "with_vocals": ["voz.mp3"],
        "already_done": ["voz.mp3", "melodia.json"],
        "without_vocals": ["capa.jpg"],
        "silent": ["voz.mp3"],
    }.items():
        (tmp_path / name).mkdir()
        for file in files:
            (tmp_path / name / file).write_bytes(b"x")
    monkeypatch.setattr(melody_backfill, "extract_melody", lambda vocals, song_dir: song_dir.name != "silent")
    marked: list[str] = []

    done, total = melody_backfill.backfill(tmp_path, marked.append)

    assert (done, total) == (1, 2)
    assert marked == ["with_vocals"]


def test_backfill_keeps_going_when_the_backend_does_not_know_a_song(tmp_path, monkeypatch):
    for name in ("deleted_song", "known_song"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "voz.mp3").write_bytes(b"x")
    monkeypatch.setattr(melody_backfill, "extract_melody", lambda vocals, song_dir: True)
    marked: list[str] = []

    def mark(song_id: str) -> None:
        if song_id == "deleted_song":
            raise RuntimeError("404")
        marked.append(song_id)

    assert melody_backfill.backfill(tmp_path, mark) == (1, 2)
    assert marked == ["known_song"]
