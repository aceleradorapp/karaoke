import json
import os
import sys
import time
from pathlib import Path

import stable_whisper

model_name = sys.argv[1] if len(sys.argv) > 1 else "small"
song_dir = Path("D:/Projetos/caraoke-michael/storage/biblioteca/cmupw7a4q0001u0v0facactnd")
os.environ["PATH"] = str(Path(os.environ["FF"]).parent) + os.pathsep + os.environ["PATH"]

doc = json.loads((song_dir / "letra.json").read_text(encoding="utf-8"))
lines = [line["text"] for line in doc["lines"]]
text = "\n".join(lines)

started = time.time()
model = stable_whisper.load_model(model_name, device="cpu")
loaded = time.time()
result = model.align(str(song_dir / "voz.mp3"), text, language="pt", vad=True)
finished = time.time()

out = {
    "model": model_name,
    "load_seconds": round(loaded - started, 1),
    "align_seconds": round(finished - loaded, 1),
    "segments": [
        {
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
            "words": [
                {"start": round(w.start, 2), "end": round(w.end, 2), "text": w.word.strip()}
                for w in seg.words
            ],
        }
        for seg in result.segments
    ],
}
Path(f"D:/Projetos/caraoke-michael/worker/align_{model_name}.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
)
print("lines in text:", len(lines), "segments:", len(out["segments"]))
print("load", out["load_seconds"], "s; align", out["align_seconds"], "s")
for seg in out["segments"]:
    print(f"{seg['start']:7.2f} {seg['end']:7.2f}  {seg['text'][:50]}")
