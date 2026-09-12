"""
Regenerate js/knowledge.js from knowledge.json.

knowledge.json is the single source of truth. The Python service reads it
directly; the browser fallback needs it as a JS global, which this writes.

Run after any edit to knowledge.json:

    python sync_knowledge.py
    python ingest.py          # re-embed as well
"""

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
SOURCE = HERE / "knowledge.json"
TARGET = HERE.parent / "js" / "knowledge.js"

HEADER = """/* ============================================================
   Knowledge base — the corpus the assistant retrieves over.

   GENERATED FILE — do not edit by hand.
   Source: rag/knowledge.json
   Regenerate: cd rag && python sync_knowledge.py
   ============================================================ */
window.GNJ_KNOWLEDGE = """


def main():
    if not SOURCE.exists():
        sys.exit(f"knowledge.json not found at {SOURCE}")

    passages = json.loads(SOURCE.read_text(encoding="utf-8"))

    ids = [p["id"] for p in passages]
    if len(set(ids)) != len(ids):
        dupes = {i for i in ids if ids.count(i) > 1}
        sys.exit(f"Duplicate ids: {sorted(dupes)}")

    for p in passages:
        missing = {"id", "section", "text"} - set(p)
        if missing:
            sys.exit(f"Passage {p.get('id', '?')} missing keys: {sorted(missing)}")

    body = json.dumps(passages, indent=2, ensure_ascii=False)
    TARGET.write_text(HEADER + body + ";\n", encoding="utf-8")

    print(f"Wrote {len(passages)} passages to {TARGET.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
