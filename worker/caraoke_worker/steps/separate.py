import re
import shutil
import subprocess
import sys
from pathlib import Path

from mutagen.mp3 import MP3

from ..context import JobContext
from ..errors import StepError
from ..tools import find_ffmpeg, subprocess_environment

DEFAULT_MODEL = "htdemucs"
MP3_BITRATE_KBPS = "192"
GPU_SEGMENT_SECONDS = 4
CPU_WORKER_JOBS = 2
READ_CHUNK_BYTES = 4096
OUTPUT_TAIL_CHARS = 4000
VOCALS_FILE = "vocals.mp3"
INSTRUMENTAL_FILE = "no_vocals.mp3"
GPU_MEMORY_ERRORS = ("out of memory", "cuda error")
PROGRESS_PATTERN = re.compile(r"(\d{1,3})%")


def build_command(source: Path, output_dir: Path, model: str, device: str) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems",
        "vocals",
        "-n",
        model,
        "-d",
        device,
        "--mp3",
        "--mp3-bitrate",
        MP3_BITRATE_KBPS,
        "-o",
        str(output_dir),
    ]
    if device == "cuda":
        command += ["--segment", str(GPU_SEGMENT_SECONDS)]
    else:
        command += ["-j", str(CPU_WORKER_JOBS)]
    command.append(str(source))
    return command


def parse_progress(text: str) -> int | None:
    matches = PROGRESS_PATTERN.findall(text)
    return min(100, int(matches[-1])) if matches else None


def is_gpu_memory_failure(output_tail: str) -> bool:
    lowered = output_tail.lower()
    return any(marker in lowered for marker in GPU_MEMORY_ERRORS)


def run_demucs(context: JobContext, source: Path, device: str, model: str) -> tuple[int, str]:
    label = context.device_label(device)
    output_dir = context.tmp_dir / "demucs"
    output_dir.mkdir(parents=True, exist_ok=True)

    context.report("SEPARATE", 0, f"Carregando o modelo de IA ({label})…", label)
    process = subprocess.Popen(
        build_command(source, output_dir, model, device),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=subprocess_environment(),
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    context.process = process

    output_tail = ""
    try:
        assert process.stdout is not None
        while chunk := process.stdout.read1(READ_CHUNK_BYTES):
            text = chunk.decode("utf-8", errors="replace")
            output_tail = (output_tail + text)[-OUTPUT_TAIL_CHARS:]
            percent = parse_progress(text)
            if percent is not None:
                context.report("SEPARATE", percent, f"Separando voz ({label})… {percent}%", label)
        process.wait()
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        context.process = None

    return process.returncode, output_tail


def collect_outputs(context: JobContext, source: Path, model: str) -> tuple[Path, Path]:
    stem_dir = context.tmp_dir / "demucs" / model / source.stem
    vocals = stem_dir / VOCALS_FILE
    instrumental = stem_dir / INSTRUMENTAL_FILE
    if not vocals.exists() or not instrumental.exists():
        raise StepError("O Demucs terminou, mas não gerou os arquivos esperados")
    return vocals, instrumental


def publish_outputs(context: JobContext, vocals: Path, instrumental: Path) -> int:
    context.song_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(vocals), context.song_dir / "voz.mp3")
    shutil.move(str(instrumental), context.song_dir / "instrumental.mp3")
    return int(round(MP3(context.song_dir / "instrumental.mp3").info.length))


def run(context: JobContext) -> None:
    source = context.source_file
    if source is None or not source.exists():
        raise StepError("O arquivo de origem não foi encontrado")
    if find_ffmpeg() is None:
        raise StepError("FFmpeg não encontrado. Instale com: winget install --id Gyan.FFmpeg")

    model = context.settings.get("processing.demucsModel", DEFAULT_MODEL)
    device = context.resolved_device

    return_code, output_tail = run_demucs(context, source, device, model)
    if return_code != 0 and device == "cuda" and is_gpu_memory_failure(output_tail):
        context.report("SEPARATE", 0, "Pouca memória na GPU; continuando na CPU…")
        device = "cpu"
        return_code, output_tail = run_demucs(context, source, device, model)

    if return_code != 0:
        raise StepError(f"O Demucs falhou (código {return_code}): {output_tail.strip()[-600:]}")

    vocals, instrumental = collect_outputs(context, source, model)
    duration = publish_outputs(context, vocals, instrumental)
    context.result.update(hasInstrumental=True, hasVocals=True, durationSec=duration)
    context.report("SEPARATE", 100, "Voz separada")
