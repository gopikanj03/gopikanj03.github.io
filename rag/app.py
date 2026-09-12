"""
Resume RAG API.

    uvicorn app:app --reload --port 8000

Pipeline: embed the question -> retrieve the nearest resume passages from
Chroma -> hand them to Groq as grounding context -> return the answer with
the sections it came from.

Generation requires GROQ_API_KEY in .env. If the call fails for any reason
the service still answers, returning the retrieved passages directly rather
than erroring — retrieval is the part that has to be right, generation only
rephrases it. Check the uvicorn output for the reason when that happens.
"""

import os
import pathlib
import re

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HERE = pathlib.Path(__file__).parent

# Reads rag/.env so the key never has to be exported by hand.
#
# override=True matters: without it a stale GROQ_API_KEY already exported in
# the shell silently wins over the one in .env, which surfaces as a confusing
# 401 even though the file holds a valid key. The file is the config.
load_dotenv(HERE / ".env", override=True)

STORE = HERE / "chroma_db"
COLLECTION = "resume"
EMBED_MODEL = "all-MiniLM-L6-v2"

TOP_K = 3
# Cosine distance above which a passage is treated as unrelated. Chroma
# returns distance, not similarity, so lower is closer.
#
# Measured against this corpus: on-topic questions land at 0.39-0.66,
# off-topic ones ("capital of France", "pizza topping") at 0.79-0.95.
# 0.72 sits in the gap, so unrelated questions get the fallback instead
# of a confidently wrong passage.
MAX_DISTANCE = 0.72

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()

# Model availability differs per Groq account — the llama-3.1 and 3.3 ids
# currently return 404 on this key. Switch GROQ_MODEL in .env once they are
# enabled on the account; nothing else needs changing.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")
GROQ_TIMEOUT = float(os.environ.get("GROQ_TIMEOUT", "30"))

SYSTEM_PROMPT = (
    "You answer questions about Gopika Nair J using only the resume extracts "
    "provided. Rules:\n"
    "- Use only the extracts. Never invent employers, dates, tools or numbers.\n"
    "- If the extracts do not answer the question, reply with exactly: "
    "I don't have that information.\n"
    "- Answer in two or three sentences, in a warm professional tone.\n"
    "- Refer to her as Gopika. Do not mention 'extracts' or 'context'."
)

FALLBACK = "I don't have that information."

# Courtesy messages answered directly, without touching retrieval — "hi"
# embedded against a resume corpus otherwise matches something random.
# Anchored to the whole message, so "hi, what does she do at Raabyt?"
# still goes through retrieval as a real question.
SMALL_TALK = [
    (
        r"(hi+|hey+|hello+|heya|hiya|yo|greetings|namaste|hola)( there)?"
        r"|good (morning|afternoon|evening)",
        "Hello! Ask me anything about Gopika's resume.",
    ),
    (
        r"(thanks|thank you|thankyou|thanks a lot|thank you so much|thx|ty"
        r"|many thanks|appreciate it|cheers)",
        "You're welcome!",
    ),
    (
        r"(bye|goodbye|good bye|see you|see ya|cya|take care)",
        "Goodbye — good luck!",
    ),
]


def small_talk(question: str) -> str | None:
    """Return a courtesy reply if the whole message is just that, else None."""
    cleaned = re.sub(r"[^a-z ]", " ", question.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned or len(cleaned.split()) > 4:
        return None
    for pattern, reply in SMALL_TALK:
        if re.fullmatch(pattern, cleaned):
            return reply
    return None


app = FastAPI(title="Gopika Nair J — Resume RAG", version="1.0")

# The portfolio is served from a different origin (localhost while developing,
# your domain once deployed), so the browser needs permission to call this.
# Narrow allow_origins to the real domain before going live.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

_collection = None


def get_collection():
    """Opened lazily so an unbuilt store gives a clear error, not a crash on boot."""
    global _collection
    if _collection is None:
        if not STORE.exists():
            raise RuntimeError("Vector store missing — run `python ingest.py` first.")
        client = chromadb.PersistentClient(path=str(STORE))
        embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBED_MODEL
        )
        _collection = client.get_collection(name=COLLECTION, embedding_function=embedder)
    return _collection


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class Answer(BaseModel):
    answer: str
    sources: list[str] = []
    generated: bool = False


def retrieve(question: str) -> list[dict]:
    result = get_collection().query(query_texts=[question], n_results=TOP_K)

    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    return [
        {"section": m["section"], "text": m["text"], "distance": d}
        for m, d in zip(metadatas, distances)
        if d <= MAX_DISTANCE
    ]


def focus(hits: list[dict]) -> list[dict]:
    """Narrow to the passages close enough to the best one to actually inform
    the answer.

    TOP_K is deliberately wide so a near-miss is not lost, but passing all of
    it to the LLM — and listing all of it as sources — attributes the answer
    to sections it never used. A question about projects was citing Skills and
    Experience purely because those ranked 2nd and 3rd.

    Measured on this corpus: a genuinely second-relevant passage sits within
    ~8% of the top distance. Beyond that it is a different subject. At 1.15 a
    CGPA question started citing Leadership as well as Education.
    """
    if not hits:
        return hits
    limit = hits[0]["distance"] * 1.08
    return [h for h in hits if h["distance"] <= limit]


def build_prompt(question: str, hits: list[dict]) -> str:
    blocks = [f"[{i}] ({h['section']}) {h['text']}" for i, h in enumerate(hits, 1)]
    context = "\n\n".join(blocks)
    return f"Resume extracts:\n{context}\n\nQuestion: {question}"


def generate(question: str, hits: list[dict]) -> str | None:
    """Ask Groq to phrase an answer. None means fall back to extractive."""
    if not GROQ_API_KEY:
        print("[generate] GROQ_API_KEY is not set — answering extractively")
        return None

    try:
        from groq import Groq

        completion = Groq(
            api_key=GROQ_API_KEY, timeout=GROQ_TIMEOUT
        ).chat.completions.create(
            model=GROQ_MODEL,
            temperature=0.2,
            max_tokens=300,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_prompt(question, hits)},
            ],
        )
        return completion.choices[0].message.content.strip() or None
    except Exception as exc:  # noqa: BLE001 - degrade to extractive, never 500
        print(f"[generate] Groq call failed, answering extractively: {exc}")
        return None


@app.get("/health")
def health():
    try:
        count = get_collection().count()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "passages": count,
        "model": GROQ_MODEL,
        "key_loaded": bool(GROQ_API_KEY),
    }


@app.post("/ask", response_model=Answer)
def ask(payload: Question):
    courtesy = small_talk(payload.question)
    if courtesy:
        return Answer(answer=courtesy, sources=[], generated=False)

    hits = retrieve(payload.question.strip())
    if not hits:
        return Answer(answer=FALLBACK, sources=[], generated=False)

    # Only the passages close enough to the top hit inform the answer — and
    # only those are cited.
    hits = focus(hits)
    sources = list(dict.fromkeys(h["section"] for h in hits))

    text = generate(payload.question, hits)
    if text:
        return Answer(answer=text, sources=sources, generated=True)

    return Answer(
        answer=" ".join(h["text"] for h in hits),
        sources=sources,
        generated=False,
    )
