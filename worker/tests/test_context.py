import pytest

from caraoke_worker.errors import JobCanceled
from conftest import HARDWARE_BIG_GPU, HARDWARE_SMALL_GPU, FakeApi


def test_reports_the_first_call_immediately(make_context):
    api = FakeApi()
    context = make_context(api)

    context.report("SEPARATE", 10, "Separando")

    assert api.progress_calls == [
        {"job_id": "job1", "step": "SEPARATE", "progress": 10, "message": "Separando", "device": None}
    ]


def test_sends_at_most_one_update_per_second_for_the_same_step(make_context, clock):
    api = FakeApi()
    context = make_context(api)

    context.report("SEPARATE", 10)
    clock.advance(0.4)
    context.report("SEPARATE", 11)
    clock.advance(0.5)
    context.report("SEPARATE", 12)
    assert len(api.progress_calls) == 1

    clock.advance(0.1)
    context.report("SEPARATE", 13)
    assert [call["progress"] for call in api.progress_calls] == [10, 13]


def test_always_sends_on_a_step_change_and_at_one_hundred_percent(make_context, clock):
    api = FakeApi()
    context = make_context(api)

    context.report("DOWNLOAD", 10)
    clock.advance(0.1)
    context.report("SEPARATE", 0)
    clock.advance(0.1)
    context.report("SEPARATE", 100)

    assert [(call["step"], call["progress"]) for call in api.progress_calls] == [
        ("DOWNLOAD", 10),
        ("SEPARATE", 0),
        ("SEPARATE", 100),
    ]


def test_clamps_the_percentage(make_context, clock):
    api = FakeApi()
    context = make_context(api)

    context.report("SEPARATE", -5)
    clock.advance(2)
    context.report("SEPARATE", 250)

    assert [call["progress"] for call in api.progress_calls] == [0, 100]


def test_raises_when_the_backend_asks_to_cancel(make_context):
    context = make_context(FakeApi(cancel_on_call=1))

    with pytest.raises(JobCanceled):
        context.report("SEPARATE", 10)


def test_remembers_the_current_step_even_when_the_update_is_skipped(make_context, clock):
    context = make_context(FakeApi())
    context.report("DOWNLOAD", 10)
    clock.advance(0.1)

    context.report("DOWNLOAD", 11)

    assert context.current_step == "DOWNLOAD"


def test_truncates_long_device_labels(make_context):
    api = FakeApi()
    context = make_context(api)

    context.report("SEPARATE", 5, device="cuda:" + "X" * 80)

    assert len(api.progress_calls[0]["device"]) == 40


def test_labels_the_device_in_use(make_context):
    assert make_context(hardware=HARDWARE_SMALL_GPU).device_label("cuda") == "cuda:NVIDIA GeForce GT 1030"
    assert make_context().device_label("cpu") == "cpu"


@pytest.mark.parametrize(
    ("hardware", "mode", "expected"),
    [
        (HARDWARE_SMALL_GPU, "auto", "cpu"),
        (HARDWARE_BIG_GPU, "auto", "cuda"),
        (HARDWARE_SMALL_GPU, "gpu", "cuda"),
        (HARDWARE_BIG_GPU, "cpu", "cpu"),
    ],
)
def test_resolves_the_device_from_the_settings(make_context, hardware, mode, expected):
    context = make_context(hardware=hardware, settings={"processing.device": mode})
    assert context.resolved_device == expected


def test_defaults_to_automatic_device_selection(make_context):
    assert make_context(hardware=HARDWARE_BIG_GPU).resolved_device == "cuda"


def test_derives_its_folders_from_the_claim(make_context, storage_dir):
    context = make_context()

    assert context.song_dir == storage_dir / "biblioteca" / "song1"
    assert context.tmp_dir == storage_dir / "tmp" / "job1"
    assert context.youtube_dir == storage_dir / "entrada" / "youtube"


def test_source_file_prefers_the_downloaded_file(make_context, storage_dir):
    upload = make_context(source_path=str(storage_dir / "entrada" / "upload" / "a.mp3"))
    assert upload.source_file == storage_dir / "entrada" / "upload" / "a.mp3"

    upload.downloaded_file = storage_dir / "entrada" / "youtube" / "song1.webm"
    assert upload.source_file == storage_dir / "entrada" / "youtube" / "song1.webm"

    assert make_context().source_file is None
