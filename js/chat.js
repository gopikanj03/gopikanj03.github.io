/* ============================================================
   Resume assistant — client-side retrieval over the knowledge base.

   HOW IT WORKS
   ------------
   1. Every passage in window.GNJ_KNOWLEDGE is tokenised and indexed
      once, on first open (not on page load — it costs nothing until
      someone actually asks something).
   2. A question is scored against every passage using BM25, the same
      ranking function Elasticsearch and Lucene use. Tag matches carry
      extra weight because tags hold the words people actually type.
   3. The best-scoring passages are returned as the answer, with the
      section they came from shown as provenance.

   TWO ENGINES
   -----------
   The real one lives in ../rag (Python: FastAPI + ChromaDB +
   sentence-transformers + Groq). When it is reachable, questions go
   there and answers come back generated and grounded in the resume,
   in roughly a second.

   The BM25 index below is the fallback. It runs entirely in the browser
   so the assistant still answers when the Python service is asleep,
   unreachable, or the site is opened straight off disk. Both read the
   same corpus — rag/knowledge.json is the source, js/knowledge.js is
   generated from it by rag/sync_knowledge.py.
   ============================================================ */
(function () {
  "use strict";

  // Python RAG service endpoints.
  //
  // On a deployed site "127.0.0.1" means the VISITOR's machine, not yours —
  // pointing there in production makes every question fire a request that
  // can only fail. So the local service is used only when the page itself
  // is being served locally.
  var LOCAL_API = "http://127.0.0.1:8000/ask";

  // Set this once rag/ is hosted somewhere public, e.g.
  //   var PROD_API = "https://your-space.hf.space/ask";
  // Left null, the deployed site answers from the in-browser index instead,
  // which needs no backend at all.
  var PROD_API = null;

  var isLocal = location.protocol === "file:" ||
                /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  var API_URL = isLocal ? LOCAL_API : PROD_API;
  // Groq answers in about a second; 20s is slack for a cold start. If it is
  // exceeded the local BM25 index answers instead, so the chat never hangs.
  var API_TIMEOUT = 20000;

  var $ = function (s, c) { return (c || document).querySelector(s); };

  var KB = window.GNJ_KNOWLEDGE || [];
  if (!KB.length) return;

  /* ---------- Tokenising ---------- */

  // Words carrying no retrieval signal in questions of this shape.
  var STOP = {
    a:1, an:1, and:1, are:1, as:1, at:1, be:1, but:1, by:1, can:1, did:1, do:1,
    does:1, for:1, from:1, had:1, has:1, have:1, he:1, her:1, hers:1, how:1,
    i:1, in:1, is:1, it:1, its:1, me:1, my:1, of:1, on:1, or:1, she:1, so:1,
    tell:1, that:1, the:1, their:1, them:1, then:1, there:1, these:1, they:1,
    this:1, to:1, was:1, were:1, what:1, when:1, where:1, which:1, who:1,
    whom:1, why:1, will:1, with:1, would:1, you:1, your:1, about:1, please:1,
    give:1, get:1, know:1, want:1, any:1, some:1, more:1
  };

  // Crude suffix stripping — enough to tie "projects"/"project" together
  // without pulling in a full stemmer.
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 3 && /(sses|shes|ches)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    return w;
  }

  function tokenise(text, keepStop) {
    var raw = String(text).toLowerCase().replace(/[^a-z0-9+#.\- ]/g, " ").split(/\s+/);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i].replace(/^[.\-]+|[.\-]+$/g, "");
      if (!w || w.length < 2) continue;
      if (!keepStop && STOP[w]) continue;
      out.push(stem(w));
    }
    return out;
  }

  /* ---------- Index ---------- */

  var index = null;   // built lazily

  function buildIndex() {
    var docs = KB.map(function (entry) {
      var bodyTokens = tokenise(entry.text);
      var tagTokens  = tokenise((entry.tags || []).join(" "));
      var sectTokens = tokenise(entry.section || "");

      // Tags and section name repeated so they weigh more in the term
      // frequencies without needing a separate scoring pass.
      var all = bodyTokens
        .concat(tagTokens, tagTokens, tagTokens)
        .concat(sectTokens, sectTokens);

      var tf = {};
      all.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });

      return { entry: entry, tf: tf, len: all.length };
    });

    var df = {};
    docs.forEach(function (d) {
      Object.keys(d.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });

    var avgLen = docs.reduce(function (s, d) { return s + d.len; }, 0) / docs.length;
    return { docs: docs, df: df, N: docs.length, avgLen: avgLen };
  }

  /* ---------- BM25 ---------- */

  var K1 = 1.4;   // term-frequency saturation
  var B  = 0.72;  // length normalisation

  function search(query, limit) {
    if (!index) index = buildIndex();
    var qTokens = tokenise(query);
    if (!qTokens.length) return [];

    var scored = index.docs.map(function (d) {
      var score = 0;
      qTokens.forEach(function (t) {
        var f = d.tf[t];
        if (!f) return;
        var dfT = index.df[t] || 0;
        var idf = Math.log(1 + (index.N - dfT + 0.5) / (dfT + 0.5));
        score += idf * (f * (K1 + 1)) /
                 (f + K1 * (1 - B + B * (d.len / index.avgLen)));
      });
      return { entry: d.entry, score: score };
    });

    return scored
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || 3);
  }

  /* ---------- Answering ---------- */

  var FALLBACK = "I don't have that information.";

  /* Courtesy messages are answered directly, never sent to retrieval — "hi"
     scored against a resume corpus otherwise matches something random. The
     patterns are anchored to the whole message, so "hi, what does she do at
     Raabyt?" still goes through as a real question. */
  var SMALL_TALK = [
    {
      re: /^(?:(?:hi+|hey+|hello+|heya|hiya|yo|greetings|namaste|hola)(?: there)?|good (?:morning|afternoon|evening))$/,
      reply: "Hello! Ask me anything about Gopika's resume."
    },
    {
      re: /^(?:thanks|thank you|thankyou|thanks a lot|thank you so much|thx|ty|many thanks|appreciate it|cheers)$/,
      reply: "You're welcome!"
    },
    {
      re: /^(?:bye|goodbye|good bye|see you|see ya|cya|take care)$/,
      reply: "Goodbye — good luck!"
    }
  ];

  function smallTalk(question) {
    var cleaned = question.toLowerCase().replace(/[^a-z ]/g, " ")
                          .replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.split(" ").length > 4) return null;
    for (var i = 0; i < SMALL_TALK.length; i++) {
      if (SMALL_TALK[i].re.test(cleaned)) return SMALL_TALK[i].reply;
    }
    return null;
  }

  /* Local BM25 answer — used when the Python service is unreachable. */
  function answerLocally(query) {
    var hits = search(query, 3);

    // Require a real margin over noise before claiming a match.
    if (!hits.length || hits[0].score < 1.2) {
      return { text: FALLBACK, sources: [], engine: "local" };
    }

    // Include a second passage only when it is nearly tied AND from the same
    // section. BM25 scores bunch tightly on short queries — a bare "projects"
    // scored the soft-skills passage at 0.85 of the top hit purely on keyword
    // overlap — so a ratio test alone waves through unrelated material.
    var use = [hits[0]];
    if (hits[1] &&
        hits[1].score >= hits[0].score * 0.9 &&
        hits[1].entry.section === hits[0].entry.section) {
      use.push(hits[1]);
    }

    var sections = [];
    use.forEach(function (h) {
      if (sections.indexOf(h.entry.section) === -1) sections.push(h.entry.section);
    });

    return {
      text: use.map(function (h) { return h.entry.text; }).join(" "),
      sources: sections,
      engine: "local"
    };
  }

  /* Ask the Python RAG service, falling back to local on any failure. */
  function answer(query, done) {
    var courtesy = smallTalk(query);
    if (courtesy) { done({ text: courtesy, sources: [], engine: "small-talk" }); return; }

    if (!API_URL) { done(answerLocally(query)); return; }

    var settled = false;
    function finish(res) { if (!settled) { settled = true; done(res); } }

    // Browsers can hang a fetch for far longer than a visitor will wait.
    var timer = window.setTimeout(function () {
      finish(answerLocally(query));
    }, API_TIMEOUT);

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        window.clearTimeout(timer);
        if (!d || !d.answer) throw new Error("empty response");
        finish({
          text: d.answer,
          sources: d.sources || [],
          engine: d.generated ? "rag" : "rag-extractive"
        });
      })
      .catch(function () {
        window.clearTimeout(timer);
        finish(answerLocally(query));
      });
  }

  // Exposed so the retrieval can be exercised without the UI —
  // handy in the console: GNJ_RESUME_QA.search("langgraph")
  window.GNJ_RESUME_QA = { search: search, ask: answer };

  /* ---------- UI ---------- */

  var panel   = $("#chatPanel");
  var launch  = $("#chatLaunch");
  var closeEl = $("#chatClose");
  var log     = $("#chatLog");
  var form    = $("#chatForm");
  var input   = $("#chatInput");
  if (!panel || !launch || !form) return;

  var lastFocused = null;

  function addMessage(role, text, sources) {
    var wrap = document.createElement("div");
    wrap.className = "chat__msg chat__msg--" + role;

    var bubble = document.createElement("div");
    bubble.className = "chat__bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);

    if (sources && sources.length) {
      var src = document.createElement("div");
      src.className = "chat__sources";
      // De-duplicate: two passages often share a section.
      sources.filter(function (s, i) { return sources.indexOf(s) === i; })
        .forEach(function (s) {
          var chip = document.createElement("span");
          chip.textContent = s;
          src.appendChild(chip);
        });
      wrap.appendChild(src);
    }

    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function ask(question) {
    addMessage("user", question);

    var thinking = addMessage("bot", "Searching the resume and drafting an answer…");
    thinking.classList.add("is-thinking");

    // A beat of latency so the answer does not snap in before the
    // question has visually landed.
    window.setTimeout(function () {
      answer(question, function (res) {
        thinking.remove();
        addMessage("bot", res.text, res.sources);
      });
    }, 260);
  }

  function openPanel() {
    lastFocused = document.activeElement;
    panel.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    if (!log.children.length) {
      addMessage("bot", "Ask me anything about Gopika's resume");
    }
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel() {
    panel.hidden = true;
    launch.setAttribute("aria-expanded", "false");
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  launch.addEventListener("click", function () {
    if (panel.hidden) openPanel(); else closePanel();
  });
  if (closeEl) closeEl.addEventListener("click", closePanel);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.value = "";
    ask(q);
  });

  // Suggested questions get people past the blank-input problem.
  Array.prototype.forEach.call(panel.querySelectorAll("[data-ask]"), function (btn) {
    btn.addEventListener("click", function () { ask(btn.getAttribute("data-ask")); });
  });
})();
