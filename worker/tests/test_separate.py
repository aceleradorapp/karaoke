import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from caraoke_worker.errors import StepError
from caraoke_worker.steps import separate
from conftest import HARDWARE_BIG_GPU, HARDWARE_SMALL_GPU, FakeApi


class TestBuildCommand:
    SOURCE = Path("C:/music/song.mp3")
    OUTPUT = Path("C:/tmp/out")

    def test_runs_demucs_two_stems_with_mp3_output(self):
        command = separate.build_command(self.SOURCE, self.OUTPUT, "htdemucs", "cpu")

        assert command[:3] == [sys.executable, "-m", "demucs"]
        assert command[command.index("--two-stems") + 1] == "vocals"
        assert command[command.index("-n") + 1] == "htdemucs"
        assert "--mp3" in command
        assert command[command.index("--mp3-bitrate") + 1] == "192"
        assert command[command.index("-o") + 1] == str(self.OUTPUT)
        assert command[-1] == str(self.SOURCE)

    def test_limits_worker_jobs_on_the_cpu(self):
        command = separate.build_command(self.SOURCE, self.OUTPUT, "htdemucs", "cpu")
        assert command[command.index("-d") + 1] == "cpu"
        assert command[command.index("-j") + 1] == "2"
        assert "--segment" not in command

    def test_uses_small_segments_on_the_gpu(self):
        command = separate.build_command(self.SOURCE, self.OUTPUT, "htdemucs", "cuda")
        assert command[command.index("-d") + 1] == "cuda"
        assert command[command.index("--segment") + 1] == "4"
        assert "-j" not in command

    def test_uses_the_requested_model(self):
        command = separate.build_command(self.SOURCE, self.OUTPUT, "htdemucs_ft", "cpu")
        assert command[command.index("-n") + 1] == "htdemucs_ft"


class TestProgressParsing:
    SEPARATION_BAR = " 37%|###7      | 21.6/58.5 [00:08<00:14,  1.2seconds/s]"
    MODEL_DOWNLOAD_BAR = " 42%|####2     | 33.7M/80.2M [00:02<00:03, 15.0MB/s]"

    def test_reads_the_percentage_of_the_separation_bar(self):
        assert separate.parse_separation_percent(self.SEPARATION_BAR) == 37

    def test_ignores_the_model_download_bar_when_looking_for_separation_progress(self):
        assert separate.parse_separation_percent(self.MODEL_DOWNLOAD_BAR) is None

    def test_reads_the_percentage_of_the_model_download_bar(self):
        assert separate.parse_model_download_percent(self.MODEL_DOWNLOAD_BAR) == 42
        assert separate.parse_model_download_percent(self.SEPARATION_BAR) is None

    def test_ignores_text_that_is_not_a_progress_bar(self):
        line = "Selected model is a bag of 1 models."
        assert separate.parse_separation_percent(line) is None
        assert separate.parse_model_download_percent(line) is None

    def test_never_goes_above_one_hundred(self):
        assert separate.parse_separation_percent("999%|#| 1/1 [00:01<00:00, 1seconds/s]") == 100


class TestOutputSegments:
    def test_returns_only_complete_segments_and_keeps_the_rest(self):
        segments = separate.OutputSegments()

        assert segments.feed("first\rsecond\rthi") == ["first", "second"]
        assert segments.feed("rd\r\n") == ["third"]

    def test_skips_empty_segments(self):
        assert separate.OutputSegments().feed("a\r\n\r\nb\r") == ["a", "b"]


def test_recognizes_gpu_memory_failures():
    assert separate.is_gpu_memory_failure("RuntimeError: CUDA out of memory. Tried to allocate")
    assert separate.is_gpu_memory_failure("CUDA error: an illegal memory access")
    assert not separate.is_gpu_memory_failure("FileNotFoundError: song.mp3")


class FakeDemucs:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.devices: list[str] = []

    def __call__(self, context, source, device, model):
        self.devices.append(device)
        return_code, tail = self.outcomes.pop(0)
        if return_code == 0:
            stem_dir = context.tmp_dir / "demucs" / model / source.stem
            stem_dir.mkdir(parents=True, exist_ok=True)
            (stem_dir / "vocals.mp3").write_text("vocals")
            (stem_dir / "no_vocals.mp3").write_text("instrumental")
        return return_code, tail


@pytest.fixture
def source_file(storage_dir) -> Path:
    path = storage_dir / "entrada" / "upload" / "song.mp3"
    path.write_text("audio")
    return path


@pytest.fixture(autouse=True)
def stub_environment(monkeypatch):
    monkeypatch.setattr(separate, "find_ffmpeg", lambda: Path("ffmpeg"))
    monkeypatch.setattr(separate, "MP3", lambda path: SimpleNamespace(info=SimpleNamespace(length=215.4)))


def install_demucs(monkeypatch, *outcomes) -> FakeDemucs:
    fake = FakeDemucs(outcomes)
    monkeypatch.setattr(separate, "run_demucs", fake)
    return fake


def separation_context(make_context, source_file, **options):
    return make_context(source_path=str(source_file), steps=["SEPARATE"], **options)


def test_publishes_the_instrumental_and_vocals_and_records_the_duration(make_context, source_file, monkeypatch):
    install_demucs(monkeypatch, (0, ""))
    context = separation_context(make_context, source_file)

    separate.run(context)

    assert (context.song_dir / "instrumental.mp3").read_text() == "instrumental"
    assert (context.song_dir / "voz.mp3").read_text() == "vocals"
    assert context.result["hasInstrumental"] is True
    assert context.result["hasVocals"] is True
    assert context.result["durationSec"] == 215


def test_reports_completion(make_context, source_file, monkeypatch):
    install_demucs(monkeypatch, (0, ""))
    api = FakeApi()

    separate.run(separation_context(make_context, source_file, api=api))

    assert api.progress_calls[-1]["step"] == "SEPARATE"
    assert api.progress_calls[-1]["progress"] == 100


def test_uses_the_cpu_on_a_small_gpu_in_automatic_mode(make_context, source_file, monkeypatch):
    fake = install_demucs(monkeypatch, (0, ""))

    separate.run(separation_context(make_context, source_file, hardware=HARDWARE_SMALL_GPU))

    assert fake.devices == ["cpu"]


def test_uses_the_gpu_when_forced_or_when_it_has_enough_memory(make_context, source_file, monkeypatch):
    forced = install_demucs(monkeypatch, (0, ""))
    separate.run(
        separation_context(
            make_context, source_file, hardware=HARDWARE_SMALL_GPU, settings={"processing.device": "gpu"}
        )
    )
    assert forced.devices == ["cuda"]

    big = install_demucs(monkeypatch, (0, ""))
    separate.run(separation_context(make_context, source_file, hardware=HARDWARE_BIG_GPU))
    assert big.devices == ["cuda"]


def test_uses_the_model_from_the_settings(make_context, source_file, monkeypatch):
    seen = []

    def spy(context, source, device, model):
        seen.append(model)
        return FakeDemucs([(0, "")])(context, source, device, model)

    monkeypatch.setattr(separate, "run_demucs", spy)

    separate.run(separation_context(make_context, source_file, settings={"processing.demucsModel": "htdemucs_ft"}))

    assert seen == ["htdemucs_ft"]


def test_falls_back_to_the_cpu_when_the_gpu_runs_out_of_memory(make_context, source_file, monkeypatch):
    fake = install_demucs(monkeypatch, (1, "RuntimeError: CUDA out of memory"), (0, ""))
    api = FakeApi()
    context = separation_context(
        make_context, source_file, api=api, hardware=HARDWARE_SMALL_GPU, settings={"processing.device": "gpu"}
    )

    separate.run(context)

    assert fake.devices == ["cuda", "cpu"]
    assert context.result["hasInstrumental"] is True
    assert any("continuando na CPU" in (call["message"] or "") for call in api.progress_calls)


def test_does_not_retry_on_the_cpu_for_other_failures(make_context, source_file, monkeypatch):
    fake = install_demucs(monkeypatch, (1, "Some other failure"))
    context = separation_context(
        make_context, source_file, hardware=HARDWARE_SMALL_GPU, settings={"processing.device": "gpu"}
    )

    with pytest.raises(StepError, match="Some other failure"):
        separate.run(context)

    assert fake.devices == ["cuda"]


def test_fails_with_the_demucs_output_when_the_cpu_run_fails(make_context, source_file, monkeypatch):
    install_demucs(monkeypatch, (2, "boom: model could not be loaded"))

    with pytest.raises(StepError, match="código 2.*model could not be loaded"):
        separate.run(separation_context(make_context, source_file))


def test_fails_when_demucs_does_not_produce_the_expected_files(make_context, source_file, monkeypatch):
    monkeypatch.setattr(separate, "run_demucs", lambda *args: (0, ""))

    with pytest.raises(StepError, match="não gerou"):
        separate.run(separation_context(make_context, source_file))


def test_fails_when_the_source_file_is_missing(make_context, storage_dir):
    context = make_context(source_path=str(storage_dir / "entrada" / "upload" / "gone.mp3"), steps=["SEPARATE"])

    with pytest.raises(StepError, match="origem"):
        separate.run(context)


def test_fails_when_there_is_no_source_at_all(make_context):
    with pytest.raises(StepError, match="origem"):
        separate.run(make_context(steps=["SEPARATE"]))


def test_fails_with_install_instructions_when_ffmpeg_is_missing(make_context, source_file, monkeypatch):
    monkeypatch.setattr(separate, "find_ffmpeg", lambda: None)

    with pytest.raises(StepError, match="winget install"):
        separate.run(separation_context(make_context, source_file))


REAL_DEMUCS_OUTPUT = (
    'Downloading: "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th"\r\n'
    "\r  0%|          | 0.00/80.2M [00:00<?, ?B/s]"
    "\r 50%|#####     | 40.1M/80.2M [00:02<00:02, 15.0MB/s]"
    "\r100%|##########| 80.2M/80.2M [00:05<00:00, 16.0MB/s]\r\n"
    "Selected model is a bag of 1 models. You will see that many progress bars per track.\r\n"
    "\r  0%|          | 0.0/58.5 [00:00<?, ?seconds/s]"
    "\r 10%|#         | 5.85/58.5 [00:17<02:38,  3.01s/seconds]"
    "\r 50%|#####     | 29.2/58.5 [00:30<00:30,  1.00s/seconds]"
    "\r100%|##########| 58.5/58.5 [00:50<00:00,  1.59seconds/s]\r\n"
)


class FakeStream:
    def __init__(self, data: bytes, chunk_size: int) -> None:
        self._data = data
        self._chunk_size = chunk_size

    def read1(self, size: int) -> bytes:
        chunk, self._data = self._data[: self._chunk_size], self._data[self._chunk_size :]
        return chunk


class FakeProcess:
    returncode = 0

    def __init__(self, data: bytes, chunk_size: int) -> None:
        self.stdout = FakeStream(data, chunk_size)

    def wait(self):
        return self.returncode

    def poll(self):
        return self.returncode

    def kill(self):
        pass


class KillTrackingProcess(FakeProcess):
    def __init__(self, data: bytes, chunk_size: int) -> None:
        super().__init__(data, chunk_size)
        self.killed = False
        self.returncode = None

    def poll(self):
        return 1 if self.killed else None

    def kill(self):
        self.killed = True
        self.returncode = 1

    def wait(self):
        return self.returncode


def test_kills_the_demucs_process_as_soon_as_the_job_is_canceled(make_context, source_file, monkeypatch):
    from caraoke_worker.errors import JobCanceled

    process = KillTrackingProcess(REAL_DEMUCS_OUTPUT.encode(), 64)
    monkeypatch.setattr(separate.subprocess, "Popen", lambda *args, **kwargs: process)
    context = make_context(
        FakeApi(cancel_on_call=2), source_path=str(source_file), steps=["SEPARATE"], clock_override=ticking_clock()
    )

    with pytest.raises(JobCanceled):
        separate.run_demucs(context, source_file, "cpu", "htdemucs")

    assert process.killed is True
    assert context.process is None


def ticking_clock():
    ticks = iter(range(0, 10_000, 2))
    return lambda: next(ticks)


@pytest.mark.parametrize("chunk_size", [4096, 64, 7])
def test_reads_real_demucs_output_without_confusing_the_model_download_with_the_separation(
    make_context, source_file, monkeypatch, chunk_size
):
    monkeypatch.setattr(
        separate.subprocess, "Popen", lambda *args, **kwargs: FakeProcess(REAL_DEMUCS_OUTPUT.encode(), chunk_size)
    )
    api = FakeApi()
    context = make_context(api, source_path=str(source_file), steps=["SEPARATE"], clock_override=ticking_clock())

    return_code, _ = separate.run_demucs(context, source_file, "cpu", "htdemucs")

    assert return_code == 0
    separating = [call["progress"] for call in api.progress_calls if "Separando" in (call["message"] or "")]
    downloading = [call["message"] for call in api.progress_calls if "Baixando o modelo" in (call["message"] or "")]
    assert separating == sorted(separating)
    assert separating[0] == 0 and 10 in separating and 50 in separating
    assert any("só na primeira vez" in message for message in downloading)
    assert all(
        call["progress"] == 0 for call in api.progress_calls if "Baixando o modelo" in (call["message"] or "")
    )
