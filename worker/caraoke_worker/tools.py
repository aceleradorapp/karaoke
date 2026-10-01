import os
import shutil
from pathlib import Path

FFMPEG_NAME = "ffmpeg"
WINGET_PACKAGES_RELATIVE = Path("Microsoft") / "WinGet" / "Packages"


def find_ffmpeg() -> Path | None:
    on_path = shutil.which(FFMPEG_NAME)
    if on_path:
        return Path(on_path)

    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return None
    packages = Path(local_app_data) / WINGET_PACKAGES_RELATIVE
    for candidate in packages.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"):
        return candidate
    return None


def subprocess_environment() -> dict[str, str]:
    environment = os.environ.copy()
    ffmpeg = find_ffmpeg()
    if ffmpeg:
        environment["PATH"] = f"{ffmpeg.parent}{os.pathsep}{environment.get('PATH', '')}"
    return environment
