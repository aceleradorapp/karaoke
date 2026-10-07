import re
from typing import Any

LAST_LINE_DURATION_SECONDS = 4.0
SECONDS_PER_MINUTE = 60
MILLISECONDS_PER_SECOND = 1000

TIMESTAMP_PATTERN = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")
LEADING_TIMESTAMPS_PATTERN = re.compile(r"^(?:\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+")
OFFSET_TAG_PATTERN = re.compile(r"^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$", re.IGNORECASE)


def _to_seconds(minutes: str, seconds: str, fraction: str | None) -> float:
    fraction_seconds = float(f"0.{fraction}") if fraction else 0.0
    return int(minutes) * SECONDS_PER_MINUTE + int(seconds) + fraction_seconds


def _read_offset_seconds(content: str) -> float:
    for raw_line in content.splitlines():
        match = OFFSET_TAG_PATTERN.match(raw_line)
        if match:
            return int(match.group(1)) / MILLISECONDS_PER_SECOND
    return 0.0


def _read_entries(content: str, offset_seconds: float) -> list[tuple[float, str]]:
    entries: list[tuple[float, str]] = []
    for raw_line in content.splitlines():
        prefix = LEADING_TIMESTAMPS_PATTERN.match(raw_line)
        if not prefix:
            continue
        text = raw_line[prefix.end() :].strip()
        for match in TIMESTAMP_PATTERN.finditer(prefix.group(0)):
            start = _to_seconds(match.group(1), match.group(2), match.group(3)) - offset_seconds
            entries.append((max(0.0, start), text))
    return sorted(entries, key=lambda entry: entry[0])


def parse_lrc(content: str) -> list[dict[str, Any]]:
    entries = _read_entries(content, _read_offset_seconds(content))
    lines: list[dict[str, Any]] = []
    for index, (start, text) in enumerate(entries):
        if not text:
            continue
        end = entries[index + 1][0] if index + 1 < len(entries) else start + LAST_LINE_DURATION_SECONDS
        lines.append({"start": round(start, 2), "end": round(max(end, start), 2), "text": text})
    return lines


def to_lrc(lines: list[dict[str, Any]]) -> str:
    def stamp(seconds: float) -> str:
        total = int(round(max(0.0, seconds) * 100))
        minutes, remainder = divmod(total, 6000)
        whole_seconds, centiseconds = divmod(remainder, 100)
        return f"{minutes:02d}:{whole_seconds:02d}.{centiseconds:02d}"

    return "\n".join(f"[{stamp(line['start'])}]{line['text']}" for line in lines)


def plain_text_lines(text: str) -> list[dict[str, Any]]:
    stripped = (line.strip() for line in text.splitlines())
    return [{"start": 0, "end": 0, "text": line} for line in stripped if line]


INTERNAL_LINE_KEYS = {"anchor"}


def build_document(source: str, synced: bool, lines: list[dict[str, Any]]) -> dict[str, Any]:
    clean = [{key: value for key, value in line.items() if key not in INTERNAL_LINE_KEYS} for line in lines]
    return {"version": 1, "source": source, "synced": synced, "lines": clean}
