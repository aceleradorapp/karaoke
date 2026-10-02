import json
from pathlib import Path

root = Path("D:/Projetos/caraoke-michael")
doc = json.loads((root / "storage/biblioteca/cmupw7a4q0001u0v0facactnd/letra.json").read_text(encoding="utf-8"))
aligned = json.loads((root / "worker/align_small.json").read_text(encoding="utf-8"))

words = [w for seg in aligned["segments"] for w in seg["words"]]
print("words:", len(words), "text words:", sum(len(l["text"].split()) for l in doc["lines"]))

onsets = [34.8, 41.7, 51.6, 60.7, 69.4, 78.1, 104.2, 112.8, 121.8, 130.4, 156.7, 165.4, 173.9, 182.6, 191.6, 200.2]
cursor = 0
print(" line  lrc+15.75  ai_start  ai_end   ai-onset   text")
for index, line in enumerate(doc["lines"]):
    count = len(line["text"].split())
    chunk = words[cursor : cursor + count]
    cursor += count
    start, end = chunk[0]["start"], chunk[-1]["end"]
    onset = onsets[index]
    print(f"{index:4d}  {line['start'] + 15.75:9.2f}  {start:8.2f}  {end:7.2f}  {start - onset:+8.2f}   {line['text'][:30]}")
    if index in (5, 6):
        print("      words:", [(w['text'], w['start'], w['end']) for w in chunk])
