import re
import unicodedata

STRONG_NOISE_WORDS = {
    "karaoke",
    "instrumental",
    "playback",
    "backing",
    "official",
    "oficial",
    "video",
    "videoclipe",
    "clipe",
    "lyric",
    "lyrics",
    "letra",
    "legendado",
    "audio",
    "hd",
    "4k",
    "version",
    "versao",
}
FILLER_NOISE_WORDS = {"music", "musica", "track", "com", "sem", "with", "no", "vocal", "vocals", "and", "e", "a"}

BRACKET_GROUP = re.compile(r"[(\[{][^)\]}]*[)\]}]")
SEGMENT_SEPARATOR = re.compile(r"\s+[-–—|]\s+")
WHITESPACE = re.compile(r"\s+")


def _normalize_word(word: str) -> str:
    decomposed = unicodedata.normalize("NFD", word)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]", "", without_marks.lower())


def _is_noise(text: str) -> bool:
    words = [word for word in (_normalize_word(part) for part in text.split()) if word]
    known = all(word in STRONG_NOISE_WORDS or word in FILLER_NOISE_WORDS for word in words)
    return bool(words) and known and any(word in STRONG_NOISE_WORDS for word in words)


def clean_title(title: str) -> str:
    without_groups = BRACKET_GROUP.sub(lambda group: "" if _is_noise(group.group(0)[1:-1]) else group.group(0), title)
    collapsed = WHITESPACE.sub(" ", without_groups).strip()
    segments = [segment.strip() for segment in SEGMENT_SEPARATOR.split(collapsed)]
    meaningful = [segment for segment in segments if segment and not _is_noise(segment)]
    return " - ".join(meaningful) if meaningful else title.strip()
