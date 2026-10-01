import pytest

from caraoke_worker import runner
from caraoke_worker.errors import JobCanceled, StepError
from conftest import FakeApi, build_claim

HARDWARE = {"cudaAvailable": False, "gpuName": None, "vramMb": None}


@pytest.fixture
def calls():
    return []


@pytest.fixture
def fake_steps(monkeypatch, calls):
    def recording(name, effect=None):
        def handler(context):
            calls.append(name)
            context.current_step = name
            if effect:
                effect(context)

        return handler

    handlers = {name: recording(name) for name in ("DOWNLOAD", "SEPARATE", "LYRICS", "COVER", "FINALIZE")}
    monkeypatch.setattr(runner, "STEP_HANDLERS", handlers)
    return handlers


def run(storage_dir, api, **claim_options):
    runner.run_job(api, build_claim(storage_dir, **claim_options), HARDWARE)


def test_runs_every_step_in_order_and_completes(storage_dir, fake_steps, calls):
    api = FakeApi()

    run(storage_dir, api, steps=['DOWNLOAD', 'SEPARATE', 'LYRICS', 'COVER', 'FINALIZE'])

    assert calls == ['DOWNLOAD', 'SEPARATE', 'LYRICS', 'COVER', 'FINALIZE']
    assert api.failed == []
    assert [job_id for job_id, _ in api.completed] == ['job1']


def test_completes_with_what_the_steps_collected(storage_dir, fake_steps):
    api = FakeApi()

    def produce(context):
        context.result.update(durationSec=215, hasInstrumental=True)

    fake_steps['SEPARATE'] = produce

    run(storage_dir, api)

    _, result = api.completed[0]
    assert result['durationSec'] == 215
    assert result['hasInstrumental'] is True
    assert result['lyricsSource'] == 'NONE'


def test_reports_the_failing_step_and_does_not_complete(storage_dir, fake_steps, calls):
    api = FakeApi()

    def explode(context):
        context.current_step = "SEPARATE"
        raise StepError("O Demucs falhou")

    fake_steps["SEPARATE"] = explode

    run(storage_dir, api)

    assert api.completed == []
    assert api.failed == [("job1", "StepError: O Demucs falhou", "SEPARATE")]
    assert "LYRICS" not in calls


def test_truncates_very_long_error_messages(storage_dir, fake_steps):
    api = FakeApi()

    def explode(context):
        raise RuntimeError("x" * 5000)

    fake_steps["SEPARATE"] = explode

    run(storage_dir, api)

    assert len(api.failed[0][1]) == 2000


def test_acknowledges_a_cancellation_instead_of_reporting_a_failure(storage_dir, fake_steps):
    api = FakeApi()

    def canceled(context):
        context.current_step = "SEPARATE"
        raise JobCanceled()

    fake_steps["SEPARATE"] = canceled

    run(storage_dir, api)

    assert api.completed == []
    assert api.failed == [("job1", "CANCELED", "SEPARATE")]


def test_skips_steps_that_are_not_implemented_yet(storage_dir, fake_steps, calls):
    api = FakeApi()

    run(storage_dir, api, steps=["SEPARATE", "MELODY", "FINALIZE"])

    assert calls == ["SEPARATE", "FINALIZE"]
    assert len(api.completed) == 1


def test_removes_the_temporary_folder_on_success_and_on_failure(storage_dir, fake_steps):
    tmp_job_dir = storage_dir / "tmp" / "job1"

    def leave_files(context):
        context.tmp_dir.mkdir(parents=True, exist_ok=True)
        (context.tmp_dir / "leftover.bin").write_text("x")

    fake_steps["SEPARATE"] = leave_files
    run(storage_dir, FakeApi())
    assert not tmp_job_dir.exists()

    def leave_files_then_fail(context):
        leave_files(context)
        raise StepError("boom")

    fake_steps["SEPARATE"] = leave_files_then_fail
    run(storage_dir, FakeApi())
    assert not tmp_job_dir.exists()


def test_deletes_the_youtube_download_after_finalizing(storage_dir, monkeypatch):
    downloaded = storage_dir / "entrada" / "youtube" / "song1.webm"
    downloaded.write_text("audio")

    def download(context):
        context.downloaded_file = downloaded

    monkeypatch.setattr(runner, "STEP_HANDLERS", {"DOWNLOAD": download, "FINALIZE": runner.finalize})

    run(storage_dir, FakeApi(), steps=["DOWNLOAD", "FINALIZE"], source="YOUTUBE", youtube_id="abc")

    assert not downloaded.exists()


def test_deletes_the_youtube_download_when_the_job_fails(storage_dir, monkeypatch):
    downloaded = storage_dir / "entrada" / "youtube" / "song1.webm"
    downloaded.write_text("audio")

    def download(context):
        context.downloaded_file = downloaded

    def fail(context):
        raise StepError("separation failed")

    monkeypatch.setattr(runner, "STEP_HANDLERS", {"DOWNLOAD": download, "SEPARATE": fail})

    run(storage_dir, FakeApi(), steps=["DOWNLOAD", "SEPARATE"], source="YOUTUBE", youtube_id="abc")

    assert not downloaded.exists()


def test_never_touches_the_original_upload_when_the_job_fails(storage_dir, monkeypatch):
    original = storage_dir / "entrada" / "upload" / "song.mp3"
    original.write_text("audio")

    def fail(context):
        raise StepError("separation failed")

    monkeypatch.setattr(runner, "STEP_HANDLERS", {"SEPARATE": fail})

    run(storage_dir, FakeApi(), steps=["SEPARATE"], source_path=str(original))

    assert original.exists()
