# Resume RAG service

The retrieval-augmented question answering backend for the portfolio's
resume assistant. Ask it something about Gopika's resume and it retrieves
the relevant passages, then has an LLM phrase an answer grounded in them.

```
question ──► embed (all-MiniLM-L6-v2)
                  │
                  ▼
          ChromaDB vector search  ──► top 3 passages within distance 0.72
                  │
                  ▼
          Groq LLM                ──► answer + the sections it came from
```

## Setup

```bash
cd rag
pip install -r requirements.txt
cp .env.example .env        # then edit if you want to change the model
python ingest.py            # builds chroma_db/ — run once
uvicorn app:app --port 8000
```

`ingest.py` downloads the embedding model (~90 MB) on first run.

Check it came up:

```bash
curl http://127.0.0.1:8000/health
# {"ok":true,"passages":26,"model":"qwen/qwen3.8-27b","key_loaded":true}
```

## Model

Generation runs on Groq. Put your key in `.env`:

```
GROQ_API_KEY=gsk_...
GROQ_MODEL=qwen/qwen3.8-27b
```

Answers come back in roughly a second.

> **Model availability varies by account.** `llama-3.1-8b-instant` and
> `llama-3.3-70b-versatile` currently return 404 on this key, which is why
> the default is `qwen/qwen3.8-27b`. Once Llama is enabled, change
> `GROQ_MODEL` in `.env` — nothing else needs touching. List what your key
> can reach with:
>
> ```python
> from groq import Groq
> print([m.id for m in Groq(api_key=KEY).models.list().data])
> ```

> **If you get a 401 with a valid key,** check for a stale `GROQ_API_KEY`
> exported in your shell or system environment. `load_dotenv(..., override=True)`
> in `app.py` makes `.env` win, which is what you want — but the exported one
> will still confuse any other tool you run.

## Endpoints

`GET /health` — store size, model in use, and whether the key loaded.

`POST /ask`

```json
{ "question": "What does she do at Raabyt?" }
```

```json
{
  "answer": "At Raabyt, Gopika works as a Junior Generative AI Engineer…",
  "sources": ["Experience"],
  "generated": true
}
```

`generated: false` means the LLM was unreachable and the retrieved
passages were returned directly. The service never fails outright —
retrieval is the part that has to be right, generation only rephrases it.

## Editing the resume content

`knowledge.json` is the single source of truth. Each entry is one passage:

```json
{
  "id": "raabyt-chat",
  "section": "Experience",
  "tags": ["chatbot", "conversational", "langgraph"],
  "text": "At Raabyt, Gopika built a conversational search agent…"
}
```

Keep passages small and single-topic — retrieval returns whole passages,
so one that covers two subjects answers both badly. `tags` are embedded
alongside the text, so put the words people would actually type there.

**Every category needs an overview passage.** If each project lives in its
own chunk, "what are her projects?" has nothing to match — it asks about the
*set*, and only chunks about *individual* projects exist. The result is a
near-tie among unrelated passages and a wrong answer. `projects-overview`,
`skills-overview`, `experience-overview` and `certs-overview` exist to catch
these list-shaped questions. Add one whenever you add a new category.

After editing:

```bash
python sync_knowledge.py    # regenerates ../js/knowledge.js
python ingest.py            # re-embeds into chroma_db/
```

Both matter. `ingest.py` updates what the API searches; `sync_knowledge.py`
updates the browser fallback.

## The browser fallback

`js/chat.js` calls this service first. If it is unreachable — not running,
asleep on a free tier, or the page opened straight off disk — it falls back
to a BM25 index built in the browser over `js/knowledge.js`. The assistant
keeps answering either way, which is why the portfolio never shows a broken
chat widget.

To point the page at a deployed instance, change `API_URL` at the top of
`js/chat.js`. Set it to `null` to force local-only.

## Deploying

The service needs a host that can run Python and hold ~500 MB for the
embedding model — Render, Railway, or Hugging Face Spaces all have free
tiers that work. Commit `chroma_db/` or run `ingest.py` at boot.

Two things to change for production:

- Narrow `allow_origins` in `app.py` from `["*"]` to your actual domain.
- Set `GROQ_API_KEY` as a secret in the host's dashboard, not in a committed
  file. `.env` is gitignored for this reason.

## Tuning

`MAX_DISTANCE` (default `0.72`) is how far a passage can be from the
question before it is treated as unrelated. It was measured, not guessed:
on-topic questions against this corpus score 0.39–0.66, off-topic ones
("capital of France") score 0.79–0.95. Raise it and unrelated questions
start getting confident wrong answers; lower it and real questions start
falling through to the "I could not find that" reply.

Re-measure after significantly changing `knowledge.json`:

```python
col.query(query_texts=["your question"], n_results=3)["distances"]
```
