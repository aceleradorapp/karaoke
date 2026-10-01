from caraoke_worker.lrc import build_document, parse_lrc, plain_text_lines, to_lrc

SAMPLE = """[ar: Artista]
[ti: Música]
[00:12.34]Primeira linha
[00:15.80]Segunda linha
[00:20.00]
[00:25.50]Terceira linha"""


def texts(lines):
    return [line["text"] for line in lines]


def test_reads_timed_lines_and_ignores_metadata_tags():
    lines = parse_lrc(SAMPLE)

    assert texts(lines) == ["Primeira linha", "Segunda linha", "Terceira linha"]
    assert (lines[0]["start"], lines[0]["end"]) == (12.34, 15.8)


def test_ends_a_line_where_the_next_entry_starts_including_instrumental_pauses():
    assert parse_lrc(SAMPLE)[1]["end"] == 20.0


def test_gives_the_last_line_a_default_duration():
    last = parse_lrc(SAMPLE)[2]
    assert (last["start"], last["end"]) == (25.5, 29.5)


def test_expands_multiple_timestamps_and_sorts_by_time():
    lines = parse_lrc("[00:30.00]Refrão\n[00:10.00][00:50.00]Refrão repetido\n[00:20.00]Meio")

    assert [(line["start"], line["text"]) for line in lines] == [
        (10.0, "Refrão repetido"),
        (20.0, "Meio"),
        (30.0, "Refrão"),
        (50.0, "Refrão repetido"),
    ]


def test_understands_timestamps_with_and_without_fractions():
    lines = parse_lrc("[01:02]Sem fração\n[01:03.5]Um dígito\n[01:04.250]Milésimos")
    assert [line["start"] for line in lines] == [62.0, 63.5, 64.25]


def test_applies_the_offset_tag_and_never_goes_negative():
    assert parse_lrc("[offset:+500]\n[00:10.00]Linha")[0]["start"] == 9.5
    assert parse_lrc("[offset:+5000]\n[00:01.00]Linha")[0]["start"] == 0.0


def test_handles_windows_line_endings_and_plain_text():
    assert texts(parse_lrc("[00:01.00]A\r\n[00:02.00]B\r\n")) == ["A", "B"]
    assert parse_lrc("Só texto\nsem tempos") == []


def test_writes_mm_ss_cc_timestamps_and_round_trips():
    lines = [{"start": 12.34, "end": 15, "text": "A"}, {"start": 75.5, "end": 80, "text": "B"}]

    assert to_lrc(lines) == "[00:12.34]A\n[01:15.50]B"
    assert [(line["start"], line["text"]) for line in parse_lrc(to_lrc(lines))] == [(12.34, "A"), (75.5, "B")]


def test_rolls_centisecond_rounding_over_to_the_next_second():
    assert to_lrc([{"start": 59.999, "end": 61, "text": "A"}]) == "[01:00.00]A"


def test_builds_unsynced_lines_from_plain_text_skipping_blanks():
    lines = plain_text_lines("Linha um\n\n  Linha dois  \n")

    assert texts(lines) == ["Linha um", "Linha dois"]
    assert all(line["start"] == 0 and line["end"] == 0 for line in lines)


def test_builds_the_document_shape_the_frontend_expects():
    document = build_document("LRCLIB", True, [{"start": 1, "end": 2, "text": "A"}])
    assert document == {"version": 1, "source": "LRCLIB", "synced": True, "lines": [{"start": 1, "end": 2, "text": "A"}]}
