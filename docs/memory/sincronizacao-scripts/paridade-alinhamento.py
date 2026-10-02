import json
from pathlib import Path

from caraoke_worker.lyric_alignment import align_lines_with_vocals, fit_shift
from caraoke_worker.vocal_onset import analyze_vocals, find_phrase_onsets
import numpy as np

root = Path("D:/Projetos/caraoke-michael")
song = root / "storage/biblioteca/cmupw7a4q0001u0v0facactnd"
lines = json.loads((song / "letra.json").read_text(encoding="utf-8"))["lines"]
ai = json.loads((root / "worker/align_small.json").read_text(encoding="utf-8"))
words = [w for seg in ai["segments"] for w in seg["words"]]

envelope = analyze_vocals(song / "voz.mp3")
onsets = find_phrase_onsets(envelope)
starts = np.array([l["start"] for l in lines])
print("fitted shift:", fit_shift(starts, onsets))
aligned = align_lines_with_vocals(lines, envelope)

cursor = 0
print(" i   lrc+15.75  aligned   whisper   aligned-whisper")
for index, line in enumerate(lines):
    count = len(line["text"].split())
    whisper = words[cursor]["start"]
    cursor += count
    print(f"{index:2d}   {line['start'] + 15.75:8.2f}  {aligned[index]['start']:8.2f}  {whisper:8.2f}   {aligned[index]['start'] - whisper:+7.2f}")
