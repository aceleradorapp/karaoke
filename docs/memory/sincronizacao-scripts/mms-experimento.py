import json
import os
import subprocess
import time
import unicodedata
from pathlib import Path

import numpy as np
import torch
import torchaudio
from torchaudio.pipelines import MMS_FA as bundle

SONG = Path("D:/Projetos/caraoke-michael/storage/biblioteca/cmupw7a4q0001u0v0facactnd")
FF = os.environ["FF"]
RATE = bundle.sample_rate


def decode(path: Path) -> torch.Tensor:
    raw = subprocess.run(
        [FF, "-v", "quiet", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return torch.from_numpy(np.frombuffer(raw, dtype=np.float32).copy())


def normalize(word: str) -> str:
    plain = unicodedata.normalize("NFKD", word.lower())
    plain = "".join(char for char in plain if not unicodedata.combining(char))
    return "".join(char for char in plain if char in "abcdefghijklmnopqrstuvwxyz'")


started = time.time()
model = bundle.get_model(with_star=True)
model.eval()
tokenizer = bundle.get_tokenizer()
aligner = bundle.get_aligner()
loaded = time.time()

audio = decode(SONG / "voz.mp3")
lines = json.loads((SONG / "letra.json").read_text(encoding="utf-8"))["lines"]
print(f"model load {loaded - started:.1f}s; audio {len(audio) / RATE:.1f}s; lines {len(lines)}")

results = []
align_started = time.time()
for index, line in enumerate(lines):
    next_start = lines[index + 1]["start"] if index + 1 < len(lines) else line["start"] + 12
    window_start = max(0.0, line["start"] - 0.6)
    window_end = min(len(audio) / RATE, next_start + 0.3)
    chunk = audio[int(window_start * RATE) : int(window_end * RATE)]

    words = line["text"].split()
    normalized = [normalize(word) for word in words]
    transcript = ["*"] + normalized + ["*"]

    with torch.inference_mode():
        emission, _ = model(chunk.unsqueeze(0))
    token_spans = aligner(emission[0], tokenizer(transcript))
    frames = emission.shape[1]
    seconds_per_frame = chunk.shape[0] / frames / RATE

    word_spans = token_spans[1:-1]
    aligned = []
    for word, spans in zip(words, word_spans):
        start = window_start + spans[0].start * seconds_per_frame
        end = window_start + spans[-1].end * seconds_per_frame
        score = float(sum(span.score * (span.end - span.start) for span in spans) / sum(span.end - span.start for span in spans))
        aligned.append({"text": word, "start": round(start, 2), "end": round(end, 2), "score": round(score, 3)})
    results.append({"line": index, "lineStart": line["start"], "words": aligned})
    print(f"{index:2d} {line['start']:7.2f} | " + " ".join(f"{w['text']}[{w['start']:.2f}-{w['end']:.2f} {w['score']:.2f}]" for w in aligned))

print(f"align total {time.time() - align_started:.1f}s")
Path("D:/Projetos/caraoke-michael/worker/mms_words.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
