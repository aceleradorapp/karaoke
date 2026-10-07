import json

import numpy as np
import pytest

from caraoke_worker.errors import StepError
from caraoke_worker.steps import resync

ORIGINAL = {
    "version": 1,
    "source": "LRCLIB",
    "synced": True,
    "lines": [{"start": 10.0, "end": 12.0, "text": "Olhei até ficar cansado"}, {"start": 13.0, "end": 15.0, "text": "De ver"}],
}


def song_dir(context, original=ORIGINAL, current=None, vocals=True):
    context.song_dir.mkdir(parents=True, exist_ok=True)
    if original is not None:
        (context.song_dir / "letra.original.json").write_text(json.dumps(original), encoding="utf-8")
    if current is not None:
        (context.song_dir / "letra.json").write_text(json.dumps(current), encoding="utf-8")
    if vocals:
        (context.song_dir / "voz.mp3").write_bytes(b"voz")


@pytest.fixture
def aligned(monkeypatch, clock):
    calls = {}

    def lines_with_voice(lines, envelope):
        calls["lines"] = lines
        return [{**line, "start": line["start"] + 1.0} for line in lines]

    def words(vocals, lines, on_line=None):
        calls["words"] = lines
        for index in range(len(lines)):
            clock.advance(2)
            if on_line:
                on_line(index, len(lines))
        return [{**line, "words": [{"start": line["start"], "end": line["end"], "text": line["text"]}]} for line in lines]

    monkeypatch.setattr(resync, "analyze_vocals", lambda path: np.ones(10))
    monkeypatch.setattr(resync, "align_lines_with_vocals", lines_with_voice)
    monkeypatch.setattr(resync, "align_song_words", words)
    return calls


def stored(context, name="letra.json"):
    return json.loads((context.song_dir / name).read_text(encoding="utf-8"))


def test_starts_again_from_the_original_lyrics_and_aligns_lines_then_words(make_context, aligned):
    context = make_context(steps=["RESYNC"])
    edited = {**ORIGINAL, "source": "MANUAL", "lines": [{"start": 50.0, "end": 51.0, "text": "editada à mão", "words": []}]}
    song_dir(context, current=edited)

    resync.run(context)

    assert [line["start"] for line in aligned["lines"]] == [10.0, 13.0]
    document = stored(context)
    assert document["source"] == "ALIGNED"
    assert [line["start"] for line in document["lines"]] == [11.0, 14.0]
    assert all(line["words"] for line in document["lines"])
    assert (context.song_dir / "letra.lrc").exists()
    assert stored(context, "letra.original.json") == ORIGINAL
    assert context.result["lyricsSource"] == "ALIGNED"
    assert context.result["lyricsOffsetMs"] == 0
    messages = [call["message"] for call in context.api.progress_calls]
    assert "Alinhando as palavras com a voz… linha 1 de 2" in messages
    assert messages[-1] == "Sincronização refeita (2 de 2 linhas com palavras)"


def test_uses_the_current_lyrics_and_keeps_them_as_the_original_when_there_is_none(make_context, aligned):
    context = make_context(steps=["RESYNC"])
    song_dir(context, original=None, current=ORIGINAL)

    resync.run(context)

    assert stored(context, "letra.original.json") == ORIGINAL
    assert stored(context)["source"] == "ALIGNED"


def test_keeps_the_aligned_lines_when_the_words_cannot_be_found(make_context, aligned, monkeypatch):
    def broken(vocals, lines, on_line=None):
        raise RuntimeError("sem internet para baixar o modelo")

    monkeypatch.setattr(resync, "align_song_words", broken)
    context = make_context(steps=["RESYNC"])
    song_dir(context)

    resync.run(context)

    assert [line["start"] for line in stored(context)["lines"]] == [11.0, 14.0]


def test_refuses_without_voice_or_without_timed_lyrics(make_context, aligned):
    without_voice = make_context(steps=["RESYNC"])
    song_dir(without_voice, vocals=False)
    with pytest.raises(StepError, match="voz"):
        resync.run(without_voice)

    without_times = make_context(steps=["RESYNC"])
    song_dir(without_times, original={**ORIGINAL, "synced": False})
    with pytest.raises(StepError, match="tempos"):
        resync.run(without_times)
