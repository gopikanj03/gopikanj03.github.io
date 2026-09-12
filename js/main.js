/* ============================================================
   Gopika Nair J — Portfolio
   No dependencies. Theme, nav, scroll-spy, reveals, counters.
   ============================================================ */
(function () {
  "use strict";

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Theme ---------- */
  var root        = document.documentElement;
  var themeToggle = $("#themeToggle");
  var STORE_KEY   = "portfolio-theme";

  function readStoredTheme() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  function storeTheme(value) {
    try { localStorage.setItem(STORE_KEY, value); } catch (e) { /* private mode — ignore */ }
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (themeToggle) {
      themeToggle.setAttribute("aria-label",
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }
  }

  var stored = readStoredTheme();
  if (stored === "light" || stored === "dark") {
    applyTheme(stored);
  } else {
    // Ivory is the brand default; only an explicit OS dark preference overrides it.
    applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      storeTheme(next);
    });
  }

  /* ---------- Mobile nav ---------- */
  var burger   = $("#burger");
  var navLinks = $("#navLinks");

  function closeMenu() {
    if (!navLinks || !burger) return;
    navLinks.classList.remove("is-open");
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
  }

  if (burger && navLinks) {
    burger.addEventListener("click", function () {
      var open = navLinks.classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    $$("a", navLinks).forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 760) closeMenu();
    });
  }

  /* ---------- Scroll: sticky nav, progress bar, back-to-top ---------- */
  var nav      = $("#nav");
  var progress = $("#scrollProgress");
  var ticking  = false;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;

    if (nav) nav.classList.toggle("is-stuck", y > 12);

    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    }

    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });

  onScroll();


  /* ---------- Lightbox ----------
     Opens the full photograph from the hero portrait. The large file is
     only fetched on first open, so it costs nothing on page load. */
  var lightbox    = $("#lightbox");
  var lbImg       = $("#lightboxImg");
  var lbClose     = $("#lightboxClose");
  var portraitBtn = $("#portraitOpen");
  var FULL_SRC    = "assets/gopika-full.jpg";
  var lastFocused = null;

  function openLightbox() {
    if (!lightbox) return;
    if (!lbImg.getAttribute("src")) lbImg.setAttribute("src", FULL_SRC);
    // Fall back to the portrait button — activeElement is <body> when the
    // open is triggered programmatically, and focusing that would strand
    // focus on the hidden close button when we shut the dialog.
    lastFocused = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement
      : portraitBtn;
    lightbox.hidden = false;
    document.body.classList.add("is-locked");
    if (lbClose) lbClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("is-locked");
    // Send focus back where it came from rather than to the top of the page.
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  if (lightbox && portraitBtn) {
    portraitBtn.addEventListener("click", openLightbox);
    if (lbClose) lbClose.addEventListener("click", closeLightbox);

    // Click the backdrop (but not the photo itself) to dismiss.
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", function (e) {
      if (lightbox.hidden) return;
      if (e.key === "Escape") { closeLightbox(); return; }
      // Only the close button is focusable inside, so keep Tab on it.
      if (e.key === "Tab") { e.preventDefault(); if (lbClose) lbClose.focus(); }
    });
  }

  /* ---------- Custom cursor ----------
     Dot tracks the pointer 1:1; ring eases toward it a frame behind, which
     is what gives the trailing feel. Skipped entirely on touch devices and
     when the visitor has asked for reduced motion. */
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (finePointer && !reducedMotion) {
    var dot  = $("#cursorDot");
    var ring = $("#cursorRing");

    if (dot && ring) {
      root.classList.add("has-cursor");

      var mx = window.innerWidth / 2,  my = window.innerHeight / 2;  // pointer
      var rx = mx,                     ry = my;                      // ring, lagging
      var moved = false;

      document.addEventListener("mousemove", function (e) {
        mx = e.clientX;
        my = e.clientY;
        if (!moved) {
          // Jump the ring to the pointer on first move so it does not
          // fly in from the middle of the screen.
          rx = mx; ry = my; moved = true;
        }
        dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
      }, { passive: true });

      (function follow() {
        // Ease 13% of the remaining distance each frame — a longer tail
        // than a hard ring would want, which suits the soft bloom.
        rx += (mx - rx) * 0.13;
        ry += (my - ry) * 0.13;
        ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
        window.requestAnimationFrame(follow);
      })();

      // Grow over anything clickable.
      var INTERACTIVE = "a, button, summary, input, textarea, select, [role='button']";
      document.addEventListener("mouseover", function (e) {
        if (e.target.closest && e.target.closest(INTERACTIVE)) {
          ring.classList.add("is-active");
        }
      });
      document.addEventListener("mouseout", function (e) {
        if (e.target.closest && e.target.closest(INTERACTIVE)) {
          ring.classList.remove("is-active");
        }
      });

      document.addEventListener("mousedown", function () { ring.classList.add("is-down"); });
      document.addEventListener("mouseup",   function () { ring.classList.remove("is-down"); });

      // Hide when the pointer leaves the window.
      document.addEventListener("mouseleave", function () {
        dot.classList.add("is-out"); ring.classList.add("is-out");
      });
      document.addEventListener("mouseenter", function () {
        dot.classList.remove("is-out"); ring.classList.remove("is-out");
      });
    }
  }

  var toTop = $("#toTop");
  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealables = $$(".reveal");

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    revealables.forEach(function (el, i) {
      // Stagger siblings slightly so groups cascade rather than pop at once.
      var prev = el.previousElementSibling;
      var step = prev && prev.classList.contains("reveal") ? 90 : 0;
      if (step) el.style.transitionDelay = Math.min(i % 6, 5) * step + "ms";
      revealObserver.observe(el);
    });
  }

  /* ---------- Animated stat counters ---------- */
  var counters = $$(".stat__num");

  function formatValue(value, decimals) {
    return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  }

  function runCounter(el) {
    var target   = parseFloat(el.getAttribute("data-count"));
    var decimals = parseInt(el.getAttribute("data-decimals"), 10) || 0;

    if (isNaN(target)) return;

    if (reducedMotion) {
      el.textContent = formatValue(target, decimals);
      return;
    }

    var duration = 1500;
    var start    = null;

    function tick(now) {
      if (start === null) start = now;
      var p    = Math.min((now - start) / duration, 1);
      var ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = formatValue(target * ease, decimals);
      if (p < 1) window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
  }

  if (!("IntersectionObserver" in window)) {
    counters.forEach(runCounter);
  } else {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    counters.forEach(function (el) { counterObserver.observe(el); });
  }

  /* ---------- Scroll spy ---------- */
  var sections = $$("main section[id]");
  var linkFor  = {};

  $$(".nav__links a").forEach(function (link) {
    var id = link.getAttribute("href");
    if (id && id.charAt(0) === "#") linkFor[id.slice(1)] = link;
  });

  function setActive(id) {
    $$(".nav__links a").forEach(function (link) { link.classList.remove("is-active"); });
    if (linkFor[id]) linkFor[id].classList.add("is-active");
  }

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      // Pick the entry closest to the top of the viewport among those on screen.
      var best = null;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (!best || entry.boundingClientRect.top < best.boundingClientRect.top) best = entry;
      });
      if (best) setActive(best.target.id);
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    sections.forEach(function (s) { spy.observe(s); });
  }
})();
