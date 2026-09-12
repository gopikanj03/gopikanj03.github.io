# Gopika Nair J — Portfolio

A personal portfolio site built with plain HTML, CSS and JavaScript. No build step,
no frameworks, no dependencies — open `index.html` and it works.

## Structure

```
Portfolio/
├── index.html                      # All page content
├── css/styles.css                  # Styles + theme tokens + responsive rules
├── js/main.js                      # Theme, nav, scroll-spy, reveals, counters
├── assets/
│   └── Gopika_Nair_J_Resume.pdf    # Linked by the "Download resume" buttons
└── README.md
```

## Running it locally

Double-click `index.html`, or serve it (recommended, so paths behave exactly as they
will in production):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## What's in it

- **Dark / light theme** — follows the OS preference on first visit, remembers your
  choice in `localStorage` after that. Toggle is in the nav.
- **Scroll-spy nav** that highlights the section you're reading, plus a reading
  progress bar under the header.
- **Reveal-on-scroll** animations via `IntersectionObserver`, with staggered groups.
- **Animated stat counters** in the About section.
- **Fully responsive** down to ~360px, with a mobile drawer menu.
- **Accessible**: skip link, focus-visible rings, ARIA on the menu and theme toggle,
  and a full `prefers-reduced-motion` fallback that disables every animation.
- **Print stylesheet** — the page prints cleanly as a one-off CV.

## Editing your content

Everything is in `index.html`, in plain readable sections marked by comments
(`<!-- ===== PROJECTS ===== -->` and so on). Common edits:

| What | Where |
|---|---|
| Name, role, intro | `<section class="hero">` |
| Bio paragraphs | `<section id="about">` |
| Jobs | `<ol class="timeline">` — copy an `<li class="tl reveal">` block |
| Projects | `<div class="projects">` — copy an `<article class="card reveal">` block |
| Skills | `<div class="skills">` — each `.skillset` is one category |
| Education, certs, volunteering | `<section id="education">` |
| Certifications | `<div class="prog">` — one block per program |
| Email / phone / LinkedIn | Hero socials + the contact section (both places) |

### Certifications

21 credentials are grouped into two `.prog` blocks — one per program. Each has a
visible header (the professional certificate) and a native `<details>` element
holding the component course certificates, so the page stays short until a visitor
expands it. No JavaScript involved.

To add a credential, drop a `<li><span>Name</span><em>Date</em></li>` into the right
`.cert-list`, then bump the two counts by hand: the `.panel__count` badge in the
section heading and the `.prog__n` count in that program's header.

Colours live at the top of `css/styles.css` as CSS custom properties. Change
`--accent`, `--accent-2` and `--grad` in `:root` (dark) and `[data-theme="light"]`
to re-skin the whole site.

## Links wired up

- GitHub profile — [gopikanj03](https://github.com/gopikanj03) (hero socials + contact)
- Mini RAG System — [Answer-Generator-](https://github.com/gopikanj03/Answer-Generator-)
- Smart Travel Planner — [travel_planner](https://github.com/gopikanj03/travel_planner)

## Things worth adding

- **DeepHire repo link** — the only project card without one. Copy the
  `<a class="card__link">` block from another card and swap the URL.
- **Live demos** — if any project gets deployed, add a second `card__link` beside the repo.
- **A photo** — drop one in `assets/` and add it to the hero if you want a face on the page.

## Cache busting

`index.html` loads CSS and JS with a version query string:

```html
<link rel="stylesheet" href="css/styles.css?v=2" />
<script src="js/chat.js?v=2"></script>
```

**Bump every `?v=` number after changing a CSS or JS file.** Browsers cache
those files hard, and without a new URL a visitor — or you — keeps running
the old copy. This is the usual cause of "I changed it but nothing happened".

## Deploying

It's static, so anything works:

- **GitHub Pages** — push to a repo, then Settings → Pages → deploy from `main` / root.
- **Netlify / Vercel** — drag the folder onto their dashboard.
- **Cloudflare Pages** — connect the repo, leave the build command empty.
