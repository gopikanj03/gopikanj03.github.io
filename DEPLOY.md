# Publishing the portfolio

You need a public URL before the site can go on LinkedIn or a resume. The
site itself is static, so hosting is free. The RAG service is optional —
without it the assistant falls back to the in-browser search engine and
keeps answering.

---

## 1. Put the site online

### GitHub Pages (recommended)

You already have a GitHub account, and it gives you a clean, permanent URL.

```bash
cd C:\Portfolio
git add -A
git commit -m "Portfolio site"
```

Create a **public** repo named `gopikanj03.github.io` on GitHub, then:

```bash
git remote add origin https://github.com/gopikanj03/gopikanj03.github.io.git
git push -u origin main
```

In the repo: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

Live in a minute or two at:

```
https://gopikanj03.github.io
```

Naming the repo `<username>.github.io` gets you the short URL. Any other
name works too but gives you `gopikanj03.github.io/<repo-name>`, which is
longer to write on a resume.

### Netlify (no git needed)

Drag the `C:\Portfolio` folder onto <https://app.netlify.com/drop>. You get
a URL immediately, and can rename it to something like
`gopika-nair.netlify.app` in Site settings.

### A custom domain

`gopikanair.com` or similar costs a few dollars a year and looks markedly
better on a resume than a subdomain. Both hosts above support it —
Settings → Custom domain, then point the DNS at them.

---

## 2. The résumé assistant, once deployed

The chat has two engines. The Python service gives generated answers; the
browser fallback answers from the same corpus using BM25.

**If you deploy only the static site**, the assistant still works — it uses
the fallback. Nobody sees an error. This is the zero-effort option, and it
is a perfectly good demo.

**For the full generative version**, host `rag/` somewhere that runs Python:

| Host | Free tier | Note |
|---|---|---|
| Hugging Face Spaces | yes | Best fit — ML-friendly, no sleep on free tier |
| Render | yes | Sleeps after inactivity; first request is slow |
| Railway | trial credit | Fast, no sleep |

Then three changes:

1. Set `GROQ_API_KEY` as a **secret in the host's dashboard** — never in a
   committed file.
2. Run `python ingest.py` at boot, or commit `rag/chroma_db/` (remove it
   from `.gitignore` first).
3. In `js/chat.js`, point `API_URL` at the deployed service and bump the
   `?v=` numbers in `index.html`:

```js
var API_URL = "https://your-service.hf.space/ask";
```

Also narrow `allow_origins` in `rag/app.py` from `["*"]` to your real
domain, so only your site can call it.

---

## 3. Adding it to LinkedIn

Four places, in order of how much they get seen:

**Featured section** — the most visible. Profile → Add profile section →
Recommended → Add featured → Add a link. Paste the URL. It renders as a
card with a preview image, sitting near the top of your profile.

**Contact info** — Profile → Contact info (pencil icon) → Website → add the
URL, type "Portfolio". Appears whenever someone opens your contact card.

**About section** — one line at the end, e.g.
*"Portfolio and AI resume assistant: gopikanj03.github.io"*.

**Experience entries** — your Raabyt role can carry the link as media,
which is worth doing since the ERP AI work is described on the site.

---

## 4. Adding it to your resume

Put it in the **header line**, next to your email and phone:

```
Kerala, India | +91 99616 65142 | nairjgopika@gmail.com
LinkedIn: /in/gopika-nair-j  |  Portfolio: gopikanj03.github.io
```

Three things that matter:

- **Make it a real hyperlink** in the PDF, not just text. In Word, select
  the text → Ctrl+K → paste the URL. Recruiters click; they do not type.
- **Drop the `https://`** in the visible text. `gopikanj03.github.io` reads
  cleaner than `https://gopikanj03.github.io/`.
- **Keep it short.** A long URL wraps awkwardly and looks worse than no URL.

Worth adding a line under the Projects section too, since the site has the
repos and the capability diagram that the résumé has no room for.

---

## 5. After publishing

- Open the live URL on a phone. The layout is responsive, but check it.
- Ask the assistant three questions, to be sure `knowledge.js` deployed.
- Re-check the résumé PDF downloads — `assets/Gopika_Nair_J_Resume.pdf`.
- Remember the site publishes your phone number and email. That is a
  deliberate choice for a job search, but it does expose them to scrapers.
  Removing the phone number and keeping email is a common middle ground.
