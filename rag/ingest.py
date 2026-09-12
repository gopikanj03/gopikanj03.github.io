"""
Build the vector store from knowledge.json.

Run once before starting the API, and again whenever knowledge.json changes:

    python ingest.py

Embeddings use all-MiniLM-L6-v2 — small, fast on CPU, and the same model
used in the Mini RAG System project. Vectors are persisted to ./chroma_db
so the API does not re-embed on every boot.
"""

import json
import pathlib
import shutil
import sys

import chromadb
from chromadb.utils import embedding_functions

HERE = pathlib.Path(__file__).parent
KNOWLEDGE = HERE / "knowledge.json"
STORE = HERE / "chroma_db"
COLLECTION = "resume"
MODEL = "all-MiniLM-L6-v2"


def load_passages():
    if not KNOWLEDGE.exists():
        sys.exit(f"knowledge.json not found at {KNOWLEDGE}")

    passages = json.loads(KNOWLEDGE.read_text(encoding="utf-8"))
    if not passages:
        sys.exit("knowledge.json is empty — nothing to index.")

    ids = [p["id"] for p in passages]
    if len(set(ids)) != len(ids):
        dupes = {i for i in ids if ids.count(i) > 1}
        sys.exit(f"Duplicate ids in knowledge.json: {sorted(dupes)}")

    return passages


def main():
    passages = load_passages()
    print(f"Loaded {len(passages)} passages from knowledge.json")

    # Rebuild from scratch so removed passages actually disappear.
    if STORE.exists():
        shutil.rmtree(STORE)
        print("Cleared previous store")

    client = chromadb.PersistentClient(path=str(STORE))
    embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=MODEL
    )
    collection = client.create_collection(
        name=COLLECTION,
        embedding_function=embedder,
        metadata={"hnsw:space": "cosine"},
    )

    # Tags are folded into the embedded text so informal phrasings
    # ("what's her degree", "where did she study") land near the passage.
    documents, metadatas, ids = [], [], []
    for p in passages:
        tags = ", ".join(p.get("tags", []))
        documents.append(f"{p['section']}. {p['text']} Keywords: {tags}")
        metadatas.append({"section": p["section"], "text": p["text"]})
        ids.append(p["id"])

    collection.add(documents=documents, metadatas=metadatas, ids=ids)
    print(f"Indexed {collection.count()} passages into '{COLLECTION}'")
    print(f"Store written to {STORE}")


if __name__ == "__main__":
    main()
