/* mw-static-generator interactive layer.
   Vanilla ES, no jQuery. Trusted-Types-safe: builds DOM only via textContent,
   classList, createElement and setAttribute (non-handler attributes) plus
   clipboard.writeText -- no HTML-string DOM sinks -- so it needs no Trusted Types
   policy and runs under the strict CSP. Every feature degrades gracefully with JS
   disabled (event handlers are attached in code, never as markup attributes). */
"use strict";
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // Run non-paint-critical setup when the main thread is idle, so wiring the interaction-only
  // widgets does not block during load (cuts Total Blocking Time). requestIdleCallback is in
  // every modern engine; where it is absent (old browsers, and the jsdom test env, which has
  // no polyfill) we run SYNCHRONOUSLY -- identical to the previous eager behaviour, so there is
  // no regression and the js-tests need no change.
  function whenIdle(fn) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout: 2000 });
    } else {
      fn();
    }
  }

  // Single source of truth for every localStorage key this site may set. The
  // Browser Storage page enumerates THIS (no separate hardcoded list), and the
  // feature code below references the constants -- so each key name lives once.
  // (The hashed inline pre-paint script in <head> reads the theme key too; it must
  // stay in sync with LS_THEME by contract, as it runs before this file loads.)
  var LS_THEME = "theme";
  var LS_LEGAL_ACK = "legal-agreement-banner-dismissed";
  var LS_SITENOTICE = "sitenotice-dismissed";
  var LS_FLYIN = "flyin-last-dismissed";
  var LS_STAGE = "stage-notice-dismissed";
  var STORAGE_KEYS = [
    { key: LS_THEME, label: "Color theme (dark / light)" },
    { key: LS_LEGAL_ACK, label: "Legal agreement banner dismissed" },
    { key: LS_SITENOTICE, label: "Site-notice banner dismissed (stores the banner id)" },
    { key: LS_FLYIN, label: "Fly-in donate toast last-dismissed timestamp" },
    { key: LS_STAGE, label: "Staging-server notice dismissed" }
  ];

  // Graceful degradation for a drifted CSP: the hashed inline pre-paint script in
  // <head> gives flash-free theming, but if its sha256 ever mismatches the CSP the
  // browser blocks it. Re-apply the stored theme here (app.js is 'self', always
  // allowed) so dark mode still works -- only the flash-free-ness is lost, never
  // the theme or the rest of the page. Idempotent when the inline script did run.
  // Runs immediately (not deferred to DOMContentLoaded) to minimize any flash.
  function applyStoredTheme() {
    try {
      var t = localStorage.getItem(LS_THEME);
      var root = document.documentElement;
      if (t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches))
        root.setAttribute("data-theme", "dark");
      else if (t === "light")
        root.setAttribute("data-theme", "light");
    } catch (err) {}
  }
  applyStoredTheme();

  // Dark-mode toggle: flips <html data-theme> and persists to localStorage.
  function initDarkMode() {
    var links = document.querySelectorAll("[data-darkmode]");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (e) {
        e.preventDefault();
        var root = document.documentElement;
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem(LS_THEME, next); } catch (err) {}
      });
    }
  }

  // Copy-to-clipboard button on each code block (raw text from data-code or text),
  // plus production's CodeSelect behavior: clicking the block selects all its text so
  // a keyboard copy works even where the clipboard API is unavailable.
  function selectNodeText(node) {
    var sel = window.getSelection();
    if (!sel) return;
    var range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // Enrich each `.code-select` into the CodeSelect widget (matches the MediaWiki
  // gadget): an in-box copy icon + a "Click = Copy" tooltip that turns green
  // "Copied to clipboard!" on copy; clicking the code selects it. TT-safe: built
  // with createElement/textContent/classList only, no HTML-string sinks.
  function initCopyButtons() {
    var blocks = document.querySelectorAll(".code-select");
    for (var i = 0; i < blocks.length; i++) {
      (function (block) {
        if (block.classList.contains("js-fully-loaded")) return;
        var text = block.getAttribute("data-code");
        if (text === null) text = block.textContent;
        // A share copy-card carries a logo image src: the button is that logo (prod parity),
        // not the generic clone glyph, and the raw text is hidden (CSS .cs-image).
        var imgSrc = block.getAttribute("data-button-image-src");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", "Copy code to clipboard");
        if (imgSrc) {
          btn.className = "cbutton cbutton-logo";
          var bimg = document.createElement("img");
          bimg.className = "cbutton-img";
          bimg.alt = "";
          bimg.setAttribute("aria-hidden", "true");
          bimg.src = imgSrc;
          btn.appendChild(bimg);
        } else {
          btn.className = "fa-regular fa-clone fa-rotate-90 cbutton";
        }
        var tip = document.createElement("span");
        tip.className = "tooltip2 robots-nocontent";
        var hov = document.createElement("span");
        hov.className = "hover";
        hov.textContent = "Click = Copy";
        var cop = document.createElement("span");
        cop.className = "copied";
        var chk = document.createElement("i");
        chk.className = "fa-solid fa-check";
        chk.setAttribute("aria-hidden", "true");
        cop.appendChild(chk);
        cop.appendChild(document.createTextNode(" Copied to clipboard!"));
        tip.appendChild(hov);
        tip.appendChild(cop);
        var wrap = document.createElement("span");
        var vp = document.createElement("span");
        vp.className = "viewport";
        var code = document.createElement("span");
        code.className = "code";
        code.textContent = text;
        vp.appendChild(code);
        wrap.appendChild(vp);
        block.textContent = "";
        block.appendChild(btn);
        block.appendChild(tip);
        block.appendChild(wrap);
        block.classList.add("js-fully-loaded");
        var timer;
        function markCopied() {
          block.classList.add("copied");
          // the logo-button variant keeps its logo; only the glyph variant swaps to a check.
          if (!imgSrc) {
            btn.classList.remove("fa-regular", "fa-clone", "fa-rotate-90");
            btn.classList.add("fa-solid", "fa-check");
          }
          clearTimeout(timer);
          timer = setTimeout(function () {
            block.classList.remove("copied");
            if (!imgSrc) {
              btn.classList.remove("fa-solid", "fa-check");
              btn.classList.add("fa-regular", "fa-clone", "fa-rotate-90");
            }
          }, 3000);
        }
        btn.addEventListener("click", function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(markCopied, function () { selectNodeText(code); });
          } else {
            selectNodeText(code);
            markCopied();
          }
        });
        vp.addEventListener("click", function () { selectNodeText(code); });
      })(blocks[i]);
    }
  }

  // Generic copy button: any [data-copy] element copies its attribute to the clipboard and
  // flashes a `.copied` class for ~2s (the label's data-copied text is shown via CSS ::after).
  // Used by the header supermenu's Permalink button (share copy fields are .code-select).
  function initDataCopy() {
    var btns = document.querySelectorAll("[data-copy]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var text = btn.getAttribute("data-copy");
        var timer;
        function done() {
          btn.classList.add("copied");
          clearTimeout(timer);
          timer = setTimeout(function () { btn.classList.remove("copied"); }, 2000);
        }
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, done);
          } else { done(); }
        });
      })(btns[i]);
    }
  }

  // Print button: emitted `hidden` (no-JS users use native Ctrl+P, not a dead button), so
  // unhide it here and wire window.print() -- the only static-safe "printable view" (a print
  // stylesheet strips chrome).
  function initPagePrint() {
    var btns = document.querySelectorAll('[data-action="print"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].hidden = false;
      btns[i].addEventListener("click", function (e) {
        e.preventDefault();
        try { window.print(); } catch (err) {}
      });
    }
  }

  // Collapsibles are native <details class="mw-collapsible"> (render/collapsibles.py), so
  // they open/close with NO JS. #expandcollapseall is the only part needing JS: open all
  // boxes if any is closed, else close all.
  function initExpandCollapseAll() {
    var btns = document.querySelectorAll(".expand-or-collapse-all-button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var items = document.querySelectorAll("details.mw-collapsible");
        var anyClosed = false;
        for (var k = 0; k < items.length; k++) {
          if (!items[k].open) { anyClosed = true; break; }
        }
        for (var j = 0; j < items.length; j++) {
          items[j].open = anyClosed;
        }
      });
    }
  }

  // Open a collapsible <details> when the URL fragment targets it (or an element inside it),
  // so an in-page anchor to a closed box reveals its content instead of landing on a shut box.
  // Runs on load + hashchange. TT-safe: only sets .open.
  function openHashDetails() {
    var id;
    try { id = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { return; }
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var d = el.closest ? el.closest("details") : null;
    if (d) d.open = true;
    // A .cv-section (content-visibility:auto) estimates its height until rendered, so the native
    // fragment scroll can land ~a screen off the target. scrollIntoView renders the section and
    // lands precisely (it scrolls relative to the element, not an estimated absolute position).
    // Runs on load + hashchange (openHashDetails is wired to both), so TOC/section-link clicks
    // land exactly; no-JS keeps the native (approximate) scroll.
    if (el.scrollIntoView) el.scrollIntoView();
  }

  // The crypto-panel QR reveal and the "More Payment Options" grid collapse are now pure-CSS
  // checkbox-hacks (a hidden <input class="expand-checkbox"> + a <label>), so no JS wires
  // them -- they work (and stay collapsed) with JavaScript disabled, matching production.

  // A controller's DIRECT sections (nested controllers are handled by their own pass).
  function tabSections(ctrl) { return ctrl.querySelectorAll(":scope > .tcc-content > .tcc-section"); }
  // Activate section idx of ctrl: toggle the section + its pill, and keep the ARIA tablist
  // state in sync -- aria-selected on each tab and a roving tabindex (only the selected tab is
  // in the tab sequence, per the WAI-ARIA tabs pattern).
  function activateTab(ctrl, idx) {
    var secs = tabSections(ctrl);
    var pills = ctrl.querySelectorAll(":scope > .mininav > ul > li > .tcc-tab");
    for (var k = 0; k < secs.length; k++) secs[k].classList.toggle("active", k === idx);
    for (var b = 0; b < pills.length; b++) {
      var on = b === idx;
      pills[b].classList.toggle("active", on);
      pills[b].setAttribute("aria-selected", on ? "true" : "false");
      pills[b].tabIndex = on ? 0 : -1;
    }
  }

  // Tab controllers: build the mininav switcher (one pill per section, labelled by the
  // section title), default to the active/first tab, switch on click. No-JS shows all
  // sections. TT-safe: createElement/textContent/classList only.
  function initTabs() {
    var controllers = document.querySelectorAll(".tab-content-controller");
    var tabSeq = 0;  // unique ids for the tab <-> panel ARIA relationship
    for (var i = 0; i < controllers.length; i++) {
      (function (ctrl) {
        var sections = tabSections(ctrl);
        var nav = ctrl.querySelector(":scope > .mininav");
        if (!sections.length || !nav) return;
        nav.classList.add("mn-switcher");
        var ul = document.createElement("ul");
        for (var j = 0; j < sections.length; j++) {
          var sec = sections[j];
          var title = sec.querySelector(".tcc-title");
          var heading = title && title.querySelector("h1, h2, h3, h4, h5, h6");
          var hid = heading && heading.id;
          var li = document.createElement("li");
          // The <li> wrapper must be transparent to AT: a role=tablist may only contain role=tab
          // children, and a role=tab needs a tablist parent (APG). Without this, axe flags
          // aria-required-children / aria-required-parent, and the li (whose <ul> is now a
          // tablist, not a list) trips the listitem rule.
          li.setAttribute("role", "presentation");
          var a = document.createElement("a");
          a.className = "tcc-tab";
          // ARIA tabs pattern (injected only now that JS runs -- no-JS stays plain stacked
          // sections, never a false "tab" promise): the tab controls its panel (the section),
          // the panel is labelled back by the tab. Assign ids where missing.
          a.setAttribute("role", "tab");
          var uid = "tcc-" + (tabSeq++);
          a.id = uid + "-tab";
          if (!sec.id) sec.id = uid + "-panel";
          a.setAttribute("aria-controls", sec.id);
          sec.setAttribute("role", "tabpanel");
          sec.setAttribute("aria-labelledby", a.id);
          // A panel with no focusable descendant is itself made focusable so keyboard users can
          // reach its content (APG); a panel with focusable content needs no extra tab stop.
          if (!sec.querySelector("a[href], button, input, select, textarea, [tabindex]")) {
            sec.tabIndex = 0;
          }
          // encodeURIComponent so a raw %/space in the id survives an Open-in-new-tab / copy-link
          // (the href is the shared URL); syncTabsFromHash decodeURIComponent's it back on load.
          a.href = hid ? ("#" + encodeURIComponent(hid)) : "#";
          var img = sec.querySelector(".tcc-image img");
          if (img) a.appendChild(img);
          // Label from the title text ONLY -- a section title is also a real heading, so it
          // carries BOTH injected affordances (.share-tooltip permalink menu + .mw-editsection
          // edit-icon link); strip both by element so neither leaks into the tab label.
          var label = "Tab " + (j + 1);
          if (title) {
            var tclone = title.cloneNode(true);
            var strip = tclone.querySelectorAll(".share-tooltip, .mw-editsection");
            for (var s = 0; s < strip.length; s++) strip[s].parentNode.removeChild(strip[s]);
            var t = tclone.textContent.trim();
            if (t) label = t;
          }
          a.appendChild(document.createTextNode(label));
          (function (idx, secId) {
            a.addEventListener("click", function (e) {
              e.preventDefault();
              activateTab(ctrl, idx);
              // Anchor the URL to the chosen tab's section id so the tab is shareable and
              // restored on reload (syncTabsFromHash re-selects + scrolls then). replaceState,
              // not `location.hash=`, avoids a scroll jump + back-button history spam on click.
              if (secId) {
                // Percent-encode: a raw `%`/space in the id (e.g. "100%_Anonymous") must
                // round-trip through syncTabsFromHash's decodeURIComponent on reload, else that
                // throws URIError and the tab is not restored.
                var frag = "#" + encodeURIComponent(secId);
                try { history.replaceState(null, "", frag); }
                catch (e2) { location.hash = frag; }
              }
            });
          })(j, hid);
          li.appendChild(a);
          ul.appendChild(li);
        }
        nav.appendChild(ul);
        ul.setAttribute("role", "tablist");
        ul.setAttribute("aria-label", "Section tabs");
        // Roving-tabindex keyboard model (WAI-ARIA tabs): Arrow/Home/End move focus AND activate
        // (automatic activation -- the switch is an instant CSS toggle). Enter/Space fire the
        // native <a> click (which also updates the hash). Scoped to THIS controller's tablist so
        // a nested tablist's keys are not stolen by an ancestor (closest tablist wins).
        ul.addEventListener("keydown", function (e) {
          var k = e.key;
          if (k !== "ArrowRight" && k !== "ArrowLeft" && k !== "Home" && k !== "End") return;
          if (!e.target.closest || e.target.closest('[role="tablist"]') !== ul) return;
          e.preventDefault();
          var tabs = ul.querySelectorAll(":scope > li > .tcc-tab");
          if (!tabs.length) return;
          var cur = 0;
          for (var t = 0; t < tabs.length; t++) {
            if (tabs[t].getAttribute("aria-selected") === "true") { cur = t; break; }
          }
          var next = cur;
          if (k === "ArrowRight") next = (cur + 1) % tabs.length;
          else if (k === "ArrowLeft") next = (cur - 1 + tabs.length) % tabs.length;
          else if (k === "Home") next = 0;
          else if (k === "End") next = tabs.length - 1;
          activateTab(ctrl, next);
          tabs[next].focus();
        });
        ctrl.classList.add("mininav-ready");
        var def = 0;
        for (var d = 0; d < sections.length; d++) {
          if (sections[d].classList.contains("active")) { def = d; break; }
        }
        activateTab(ctrl, def);
      })(controllers[i]);
    }
    syncTabsFromHash();
  }

  // If the URL fragment targets an element inside an INACTIVE tab section, activate the
  // tab(s) containing it (outermost first, for nesting) and scroll it into view -- else
  // the anchor lands on hidden content (a "broken" in-page link). Runs on load + hashchange.
  function syncTabsFromHash() {
    var id;
    try { id = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { return; }
    if (!id) return;
    var el = document.getElementById(id);
    if (!el || !el.closest) return;
    var chain = [];
    var n = el.closest(".tcc-section");
    while (n) { chain.unshift(n); var p = n.parentElement; n = p && p.closest ? p.closest(".tcc-section") : null; }
    if (!chain.length) return;
    for (var c = 0; c < chain.length; c++) {
      var sec = chain[c];
      var ctrl = sec.closest(".tab-content-controller");
      if (!ctrl) continue;
      var secs = tabSections(ctrl);
      activateTab(ctrl, Array.prototype.indexOf.call(secs, sec));
    }
    if (el.scrollIntoView) el.scrollIntoView();
  }

  // Mobile nav menu is a pure-CSS checkbox toggle (#nav-toggle). With JS on, also
  // close it when the visitor taps free space outside the header or presses Escape
  // (a CSS-only toggle otherwise stays open until the label is tapped again -- the
  // reported mobile annoyance). Tapping a nav link closes it too (it navigates
  // anyway). TT-safe: only flips checkbox.checked, no DOM/HTML sinks.
  // Chevron supermenu (.tools): close the checkbox toggle on an outside tap or Escape,
  // and when a tools-item link is chosen; a tap inside the menu (copy buttons) stays open.
  function initToolsToggle() {
    var toggle = document.getElementById("tools-toggle");
    if (!toggle) return;
    var tools = toggle.closest(".tools");
    document.addEventListener("click", function (e) {
      if (!toggle.checked) return;
      var t = e.target;
      if (tools && tools.contains(t)) {
        if (t.closest && t.closest("a.tools-item")) toggle.checked = false;
        return;
      }
      toggle.checked = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.checked) toggle.checked = false;
    });
  }

  function initNavToggle() {
    var toggle = document.getElementById("nav-toggle");
    if (!toggle) return;
    var header = document.querySelector(".site-header");
    document.addEventListener("click", function (e) {
      if (!toggle.checked) return;
      var t = e.target;
      if (header && header.contains(t)) {
        // stay open for header interactions, but close when a nav link is chosen
        if (t.closest && t.closest(".site-nav a")) toggle.checked = false;
        return;
      }
      toggle.checked = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.checked) toggle.checked = false;
    });
  }

  // Back-to-top is STATIC HTML (page.py) so it works with no JS (<a href="#top"> + a CSS
  // scroll-reveal floor). JS enhances production's behavior on that same element: show past
  // a scroll threshold, auto-hide ~2s after scrolling stops, smooth-scroll (no #top hash) on
  // click. JS drives [hidden] (display); the CSS floor only governs the no-JS case.
  function initBackToTop() {
    var btn = document.querySelector(".back-to-top");
    if (!btn) return;
    btn.hidden = true;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    var idle = null;
    window.addEventListener("scroll", function () {
      if (window.scrollY < 400) { btn.hidden = true; return; }
      btn.hidden = false;
      clearTimeout(idle);
      idle = setTimeout(function () { btn.hidden = true; }, 2000);
    });
  }

  // Read a lazily-fetched payload's URL from its inert <link rel> carrier in the head. The
  // href was relativized + ?h=-fingerprinted at build time, so this is the final resolved URL
  // (works online at domain root AND offline under file://).
  function carrierHref(rel) {
    var link = document.querySelector('link[rel="' + rel + '"]');
    return link ? link.getAttribute("href") : "";
  }
  // Same-origin JSON fetch (connect-src 'self'), resolving null on any failure so the feature
  // degrades quietly (never throws). Inert DATA -- no <script> injection, so no Trusted-Types
  // script-URL policy is needed. Callers memoize so each payload is fetched at most once.
  function loadJSON(url) {
    if (!url || typeof fetch !== "function") return Promise.resolve(null);
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // Live search over the prebuilt index (search-index.min.json), fetched same-origin on first
  // focus (connect-src 'self'; inert JSON, no code execution). No-JS users get the Browse link.
  // Index URLs are stored relative to the site root ("wiki/Foo/"). Derive this
  // page's path-to-root from app.js's own (already per-page relativized) src, so
  // search links resolve both online (served at domain root) and offline (file://).
  function rootPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      // Match BOTH app.js (dev) and app.min.js (deployed/minified), AND tolerate the
      // post-build ?h=<hash> cache-buster (assets.py fingerprints the src) or a #fragment.
      // A $-anchored match (or one missing .min) returns "" on every deployed page, so search
      // links on a /wiki/ page resolve against /wiki/ and double (/wiki/wiki/<target>).
      var m = src.match(/^(.*?)app(?:\.min)?\.js(?:[?#].*)?$/);
      if (m) return m[1];
    }
    return "";
  }

  function initSearch() {
    var input = document.getElementById("search-input");
    if (!input) return;
    var root = rootPrefix();
    var results = document.createElement("ul");
    results.className = "search-results";
    results.hidden = true;
    input.parentNode.appendChild(results);
    // The index is DATA fetched on first focus, memoized single-flight: a page view with no
    // search pays nothing. Until it resolves, queries no-op (no-JS Browse link is the fallback);
    // a late arrival is still honored -- the input/keydown handlers run their body after the
    // fetch resolves, re-reading the current input value.
    var index = null, loading = null;
    function ensureIndex() {
      if (!loading) {
        loading = loadJSON(carrierHref("mw-search-index")).then(function (d) {
          index = d || [];
          return index;
        });
      }
      return loading;
    }
    input.addEventListener("focus", ensureIndex);   // prime before the first keystroke
    // A namespaced page (n:1, e.g. "Template:Foo") is a candidate only for a query that
    // TARGETS its namespace: the text before the query's first colon must equal the page's
    // namespace. A plain query (no colon) stays in the main namespace. So "template:" surfaces
    // Template pages, but "foo:bar" does NOT surface "Template:Foo:Bar". q is already lowercased.
    function nsEligible(e, q) {
      if (!e.n) return true;
      var ci = q.indexOf(":");
      if (ci === -1) return false;
      var ti = e.t.indexOf(":");
      return ti !== -1 && e.t.slice(0, ti).toLowerCase() === q.slice(0, ci);
    }
    // Best page for a query: an EXACT (case-insensitive) title match wins over a mere
    // substring hit, so "api" + Enter lands on the "API" page even when other titles
    // (e.g. "...API...") also contain the term. Scans the whole index, not just the
    // rendered top 20. Returns the root-relative href or "".
    function bestMatch(q) {
      // null (not "") is the no-match sentinel: the Homepage index entry has u="" and,
      // on the root page, root="" too, so a valid homepage href is the empty string --
      // treating "" as "no match" would skip it and mis-pick a later substring hit.
      var first = null;
      for (var i = 0; i < index.length; i++) {
        var e = index[i];
        if (!nsEligible(e, q)) continue;   // namespaced page: only for its own namespace query
        var t = e.t.toLowerCase();
        if (t === q) return root + e.u;
        if (first === null && t.indexOf(q) !== -1) first = root + e.u;
      }
      return first;
    }
    input.addEventListener("input", function () {
      // Render after the index resolves (a microtask once loaded); before then, no-op.
      ensureIndex().then(function () {
        var q = input.value.trim().toLowerCase();
        while (results.firstChild) results.removeChild(results.firstChild);
        if (q.length < 2) { results.hidden = true; return; }
        var shown = 0;
        for (var i = 0; i < index.length && shown < 20; i++) {
          var e = index[i];
          if (!nsEligible(e, q)) continue;   // namespaced page: only for its own namespace query
          if (e.t.toLowerCase().indexOf(q) === -1) continue;
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.setAttribute("href", root + e.u);
          a.textContent = e.t;
          li.appendChild(a);
          results.appendChild(li);
          shown++;
        }
        results.hidden = shown === 0;
        // The open field is an ABSOLUTE overlay at top:calc(100%+0.3rem); the results share
        // its offsetParent (.site-search), so anchor the panel just BELOW the field's rendered
        // box rather than at the ul's static top (which overlapped the field). CSSOM .style is
        // not gated by style-src, so this is CSP-safe (same as the bottom-stack spacer).
        if (!results.hidden) {
          results.style.top = (input.offsetTop + input.offsetHeight + 4) + "px";
        }
      });
    });
    // No <form> (CSP form-action 'none'), so Enter is inert by default: navigate to the
    // best-matching page ourselves. preventDefault keeps a stray implicit submit from firing.
    // location.assign (not a noreferrer anchor like the download path): search targets are
    // always internal "root + e.u" pages, so a same-origin Referer is normal and harmless.
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      // Ignore the Enter that CONFIRMS an IME candidate (CJK etc.), else a provisional
      // query navigates away mid-composition. isComposing covers most engines; keyCode
      // 229 is the Safari fallback where isComposing is not set on this keydown.
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) return;   // empty query matches everything via indexOf("")
      ensureIndex().then(function () {
        var href = bestMatch(q);
        if (href !== null) window.location.assign(href);
      });
    });
    // Close the box on an outside click / Escape (JS enhancement of the CSS :checked toggle):
    // uncheck the toggle AND clear/hide the live results so neither lingers. Scoped to the
    // search widget -- it does NOT cover the page, so the mobile nav's own outside-tap close
    // still fires. TT-safe: only checkbox.checked + removeChild, no HTML sinks.
    var toggle = document.getElementById("search-toggle");
    var box = input.closest(".site-search");
    function closeSearch() {
      if (toggle) toggle.checked = false;
      results.hidden = true;
      while (results.firstChild) results.removeChild(results.firstChild);
    }
    document.addEventListener("click", function (e) {
      if (toggle && !toggle.checked && results.hidden) return;
      if (box && box.contains(e.target)) return;
      closeSearch();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSearch();
    });
  }

  // Fixed bottom stack (consent + stage banners) overlaps the footer, so reserve its
  // EXACT rendered height as body padding, recomputed on resize and after any dismiss so
  // the reservation collapses to 0 once every banner is gone (no leftover gap below the
  // footer). The CSS body:has(.stage-banner) rule is the no-JS fallback -- without JS the
  // banners are never dismissable, so a fixed reservation is always correct there.
  function remeasureBottomStack() {
    var stack = document.querySelector(".bottom-stack");
    if (stack) document.body.style.paddingBottom = stack.offsetHeight + "px";
    // Lift the back-to-top button above the fixed bottom banner stack so they do not overlap;
    // drops back to 20px once the stack collapses (banners dismissed). CSSOM, so CSP-safe.
    var btt = document.querySelector(".back-to-top");
    if (btt) {
      var h = stack ? stack.offsetHeight : 0;
      btt.style.bottom = (h ? h + 20 : 20) + "px";
    }
  }
  function initBottomStackSpacer() {
    if (!document.querySelector(".bottom-stack")) return;
    remeasureBottomStack();
    var raf = 0;
    window.addEventListener("resize", function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; remeasureBottomStack(); });
    });
  }

  // Consent/privacy banner: shown by default. The dismiss is now a CSS checkbox-hack (the
  // sr-only #consent-dismiss-cb + the OK <label>), so it works with NO JS (hides this page
  // view). Here: reflect the persisted choice into the checkbox on load and persist a toggle
  // across pages (the pre-paint legal-ack-hidden class already hides it flash-free when set).
  // TT-safe: only reads/sets checkbox.checked + localStorage.
  function initConsentBanner() {
    var cb = document.getElementById("consent-dismiss-cb");
    if (!cb) return;
    try { if (localStorage.getItem(LS_LEGAL_ACK) === "1") cb.checked = true; } catch (err) {}
    cb.addEventListener("change", function () {
      try {
        if (cb.checked) localStorage.setItem(LS_LEGAL_ACK, "1");
        else localStorage.removeItem(LS_LEGAL_ACK);
      } catch (err) {}
      remeasureBottomStack();
    });
  }

  // Staging-server notice: shown by default on --stage builds; dismiss remembers via
  // localStorage (no cookies), like the consent banner. TT-safe (hidden attribute only).
  // Staging notice: dismiss is a CSS checkbox-hack (sr-only #stage-dismiss-cb + OK label), so
  // it hides with no JS for THIS page view (reappears next page). JS persists across pages.
  function initStageBanner() {
    var cb = document.getElementById("stage-dismiss-cb");
    if (!cb) return;
    try { if (localStorage.getItem(LS_STAGE) === "1") cb.checked = true; } catch (err) {}
    cb.addEventListener("change", function () {
      try {
        if (cb.checked) localStorage.setItem(LS_STAGE, "1");
        else localStorage.removeItem(LS_STAGE);
      } catch (err) {}
      remeasureBottomStack();
    });
  }

  // Top site-notice banner: shown by default (no-JS friendly); dismiss stores the
  // banner's id in localStorage, so a NEW id re-shows to everyone. TT-safe (hidden
  // attribute only).
  function initSitenotice() {
    var wrap = document.getElementById("siteNotice");
    if (!wrap) return;
    var banner = wrap.querySelector(".sitenotice-banner[data-banner-id]");
    if (!banner) return;
    var id = banner.getAttribute("data-banner-id") || "";
    var forced = banner.classList.contains("force-show");
    try {
      // force-show (the fly-in test page's EOY banner) ignores the dismissal
      if (!forced && localStorage.getItem(LS_SITENOTICE) === id) { wrap.hidden = true; return; }
    } catch (err) {}
    var btn = wrap.querySelector("[data-sitenotice-dismiss]");
    if (btn) btn.addEventListener("click", function () {
      wrap.hidden = true;
      try { localStorage.setItem(LS_SITENOTICE, id); } catch (err) {}
    });
  }

  // Fly-in donate toast: a JS-only gadget (hidden by default). Show it after a
  // delay unless it was dismissed within the last N days; the close button stores
  // the dismissal timestamp. TT-safe (hidden attribute only).
  function initFlyin() {
    var panel = document.getElementById("fly-in-notification-panel");
    if (!panel) return;
    var DAY = 86400000, waitMs = 120000, dismissDays = 7;
    if (new Date().getMonth() === 11) { waitMs = 60000; dismissDays = 3; }  // December
    // The test page carries a settings div (attr names lowercased by the parser) and
    // ALWAYS shows the toast (bypasses the dismissal), so its behavior is demonstrable.
    var t = document.getElementById("fly-in-notification-test-settings");
    var isTest = !!t, now = Date.now();
    if (t) {
      var w = parseInt(t.getAttribute("data-waitinseconds"), 10);  if (!isNaN(w)) waitMs = w * 1000;
      var d = parseInt(t.getAttribute("data-dismissfordays"), 10); if (!isNaN(d)) dismissDays = d;
      var nn = parseInt(t.getAttribute("data-now"), 10);           if (!isNaN(nn)) now = nn;
    }
    if (!isTest) {
      try {
        var last = parseInt(localStorage.getItem(LS_FLYIN) || "0", 10);
        if (last && Math.floor((now - last) / DAY) < dismissDays) return;
      } catch (err) {}
    }
    var timer = setTimeout(function () {
      panel.hidden = false;                             // slide in from the right edge
      requestAnimationFrame(function () { panel.classList.add("flyin-shown"); });
    }, waitMs);
    function close() {
      clearTimeout(timer);
      // Privacy: store the dismissal DAY (midnight), not the exact millisecond -- the read
      // above only compares at day granularity (Math.floor(diff / DAY) < dismissDays), so
      // rounding down is lossless for the feature while revealing far less precise timing.
      try { localStorage.setItem(LS_FLYIN, String(now - (now % DAY))); } catch (err) {}
      panel.classList.remove("flyin-shown");
      panel.addEventListener("transitionend", function te() {
        panel.hidden = true; panel.removeEventListener("transitionend", te);
      });
    }
    var btn = panel.querySelector(".close-panel");
    if (btn) {
      btn.addEventListener("click", close);
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); close(); }
      });
    }
  }

  // Generic modal (MiniModal): a .mini-modal element toggled active; closed by its
  // .mm-close button, the .underlay, or Escape. Body scroll is locked while open.
  // TT-safe (classList + hidden only). Returns { open, close } for other features.
  function initModals() {
    var active = null;
    function close() {
      if (!active) return;
      active.modal.classList.remove("active");
      active.modal.hidden = true;
      document.body.classList.remove("mini-modal-active");
      var cb = active.onClose;
      var opener = active.opener;  // restore focus to the trigger (a11y: no lost focus)
      active = null;
      if (cb) cb();
      if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
    }
    function open(modal, onClose) {
      if (!modal) return;
      var opener = document.activeElement;  // remember the trigger to refocus on close
      if (active) close();  // one modal at a time: run the previous onClose (stops its timer)
      modal.hidden = false;
      modal.classList.add("active");
      document.body.classList.add("mini-modal-active");
      active = { modal: modal, onClose: onClose, opener: opener };
      var c = modal.querySelector(".mm-close");
      if (c) c.focus();
    }
    // Focusable elements inside the active modal, in DOM order.
    function focusables() {
      if (!active) return [];
      var sel = 'a[href], button:not([disabled]), input:not([disabled]), '
        + '[tabindex]:not([tabindex="-1"])';
      var all = active.modal.querySelectorAll(sel);
      var out = [];
      for (var i = 0; i < all.length; i++) {
        if (!all[i].hidden && all[i].offsetParent !== null) out.push(all[i]);
      }
      return out;
    }
    document.addEventListener("keydown", function (e) {
      if (!active) return;
      if (e.key === "Escape") { close(); return; }
      // Focus trap: keep Tab within the dialog (else focus escapes behind it).
      if (e.key === "Tab") {
        var f = focusables();
        if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1], cur = document.activeElement;
        if (e.shiftKey && (cur === first || !active.modal.contains(cur))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (cur === last || !active.modal.contains(cur))) {
          e.preventDefault(); first.focus();
        }
      }
    });
    document.addEventListener("click", function (e) {
      if (!active) return;
      if (e.target.classList.contains("underlay") || (e.target.closest && e.target.closest(".mm-close"))) {
        close();
      }
    });
    var triggers = document.querySelectorAll("[data-modal-open]");
    for (var i = 0; i < triggers.length; i++) {
      (function (t) {
        t.addEventListener("click", function (e) {
          e.preventDefault();
          open(document.getElementById(t.getAttribute("data-modal-open")));
        });
      })(triggers[i]);
    }
    return { open: open, close: close };
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Download-button modal: a download button marked .dlbtn-modal opens a donation
  // appeal + a countdown, then proceeds to the file. No fetch (CSP connect-src
  // 'none') and no inline crypto panel (its images are article-only); donate links
  // go to /wiki/Donate. TT-safe DOM (createElement + textContent), no string sinks.
  function initDownloadModal(modals) {
    var btns = document.querySelectorAll("a.download-button-v2.dlbtn-modal[href]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function (e) {
          var href = btn.getAttribute("href");
          if (!href) return;
          e.preventDefault();
          var modal = el("div", "mini-modal download-button-modal");
          modal.id = "download-button-modal";
          modal.setAttribute("role", "dialog");
          modal.setAttribute("aria-modal", "true");
          modal.hidden = true;
          modal.appendChild(el("div", "underlay"));
          var closeBtn = el("button", "mm-close");
          closeBtn.type = "button";
          closeBtn.setAttribute("aria-label", "Close");
          closeBtn.appendChild(el("i", "fa-solid fa-xmark"));
          modal.appendChild(closeBtn);
          var content = el("div", "content");
          var heart = el("div", "dl-heart");
          heart.appendChild(el("i", "fa-solid fa-heart"));
          content.appendChild(heart);
          content.appendChild(el("p", "donation-appeal",
            "We provide our software for free. To keep improving it we rely on "
            + "donations -- if you find it valuable, please consider contributing."));
          var donate = el("a", "eoy-donate-button", "Donate (crypto, PayPal or other)");
          donate.setAttribute("href", "/wiki/Donate");
          donate.setAttribute("target", "_blank");
          donate.setAttribute("rel", "noopener");
          content.appendChild(donate);
          // Payment-method glyph row (CSP-safe FontAwesome, no images), like prod's icon
          // strip; each links through to the Donate page.
          var methods = el("a", "dl-methods");
          methods.setAttribute("href", "/wiki/Donate");
          methods.setAttribute("target", "_blank");
          methods.setAttribute("rel", "noopener");
          methods.setAttribute("aria-label", "Payment methods: crypto, Monero, PayPal and more");
          var mIcons = ["fa-brands fa-bitcoin", "fa-brands fa-monero",
                        "fa-brands fa-paypal", "fa-solid fa-ellipsis"];
          for (var mi = 0; mi < mIcons.length; mi++) methods.appendChild(el("i", mIcons[mi]));
          content.appendChild(methods);
          // Which file is downloading (basename of the href), like prod.
          var fname = href;
          try { fname = decodeURIComponent(href.split("?")[0].split("/").pop()) || href; }
          catch (e2) {}
          var dlfile = el("p", "dl-filename");
          dlfile.appendChild(document.createTextNode("You are downloading "));
          dlfile.appendChild(el("strong", null, fname));
          dlfile.appendChild(document.createTextNode("."));
          content.appendChild(dlfile);
          var status = el("p", "dl-status");
          status.appendChild(document.createTextNode("Your download starts in "));
          var count = el("span", "dl-count", "5");
          status.appendChild(count);
          var unit = el("span", "dl-unit", " seconds");
          status.appendChild(unit);
          status.appendChild(document.createTextNode(", or "));
          var proceed = el("a", "dl-proceed", "download now");
          proceed.setAttribute("href", href);
          proceed.setAttribute("rel", "noreferrer");
          status.appendChild(proceed);
          status.appendChild(document.createTextNode("."));
          content.appendChild(status);
          modal.appendChild(content);
          document.body.appendChild(modal);
          var seconds = 5;
          var timer = setInterval(function () {
            // Pause the countdown while the tab is hidden: don't navigate away from
            // a page the user isn't looking at; resume ticking when it's visible again.
            if (document.hidden) return;
            seconds -= 1;
            count.textContent = String(seconds);
            unit.textContent = seconds === 1 ? " second" : " seconds";
            // Navigate by CLICKING the proceed anchor so its rel="noreferrer" is
            // honored (window.location.href would leak the Referer -- an onion origin
            // among them -- which the explicit "download now" link deliberately does not).
            if (seconds <= 0) { clearInterval(timer); proceed.click(); }
          }, 1000);
          modals.open(modal, function () { clearInterval(timer); modal.remove(); });
        });
      })(btns[i]);
    }
  }

  // Table-expand: give each captioned content table an "Expand table" button that
  // opens a clone of the table in the modal (a wide table is easier to read
  // full-screen). TT-safe: cloneNode + DOM APIs, ids stripped from the clone to
  // avoid duplicates. No-JS visitors keep the inline (scrollable) table.
  function initTableExpand(modals) {
    var tables = document.querySelectorAll(
      ".wiki-content table:not(.toc):not(.storage-table)");
    for (var i = 0; i < tables.length; i++) {
      (function (table) {
        var caption = table.querySelector(":scope > caption");
        if (!caption) return;
        var btn = el("button", "expand-table-button");
        btn.type = "button";
        btn.appendChild(el("i", "fa-solid fa-expand"));
        btn.appendChild(document.createTextNode(" Expand table"));
        caption.insertBefore(btn, caption.firstChild);
        btn.addEventListener("click", function () {
          var modal = el("div", "mini-modal table-expand-modal");
          modal.setAttribute("role", "dialog");
          modal.setAttribute("aria-modal", "true");
          modal.hidden = true;
          modal.appendChild(el("div", "underlay"));
          var closeBtn = el("button", "mm-close");
          closeBtn.type = "button";
          closeBtn.setAttribute("aria-label", "Close");
          closeBtn.appendChild(el("i", "fa-solid fa-xmark"));
          modal.appendChild(closeBtn);
          var content = el("div", "content");
          // wiki-content on the wrapper so the clone inherits the SAME table cascade as the
          // in-page table (borders, th shading, zebra, status-cell colours); the modal CSS
          // strips wiki-content's reading-column max-width so it can use the full 95vw.
          var wrap = el("div", "wiki-content table-wrapper");
          var clone = table.cloneNode(true);
          var withId = clone.querySelectorAll("[id]");
          for (var k = 0; k < withId.length; k++) withId[k].removeAttribute("id");
          var cb = clone.querySelector(".expand-table-button");
          if (cb) cb.remove();
          // cloneNode drops event listeners, so a cloned gallery's a.glb-link would, on click,
          // navigate to the raw image (its no-JS href) -- jarring inside the read-only expanded
          // table. Neutralize: drop the lightbox class + href so the cloned thumbs are inert.
          // (Also clears the legacy glb-thumb affordance on any unwrapped thumb.)
          var dead = clone.querySelectorAll("a.glb-link, .glb-thumb");
          for (var d = 0; d < dead.length; d++) {
            dead[d].classList.remove("glb-link", "glb-thumb");
            dead[d].removeAttribute("href");
            dead[d].removeAttribute("tabindex");
            dead[d].removeAttribute("role");
          }
          wrap.appendChild(clone);
          content.appendChild(wrap);
          modal.appendChild(content);
          document.body.appendChild(modal);
          modals.open(modal, function () { modal.remove(); });
        });
      })(tables[i]);
    }
  }

  // Hovercards (the job of the old MediaWiki Popups): (1) reference previews --
  // hover a [n] citation to see the footnote; (2) page previews -- hover an internal
  // link to see the target's title + summary from a prebuilt index (page-previews.min.json,
  // fetched same-origin ONCE on first in-content hover; the index is the whole source, so no
  // per-hover page fetch). JS-only enhancement; native title= tooltips still work with JS off.
  // TT-safe DOM; positioned via el.style (CSSOM, not an inline style= attribute, so allowed
  // under style-src 'self').
  function initHovercards() {
    var content = document.querySelector(".wiki-content");
    if (!content) return;
    // Preview index: DATA fetched once on first in-content hover (memoized). Citation previews
    // read the DOM and need no fetch; a page card only appears once the index has resolved
    // (native title= covers the gap), so a no-interaction page view fetches nothing.
    var previews = null, previewsLoading = null;
    function ensurePreviews() {
      if (!previewsLoading) {
        previewsLoading = loadJSON(carrierHref("mw-page-previews")).then(function (d) {
          previews = d || {};
          return previews;
        });
      }
      return previewsLoading;
    }
    var card = null, hideTimer = null, showTimer = null;
    function ensure() {
      if (card) return card;
      card = el("div", "hovercard");
      card.hidden = true;
      card.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
      card.addEventListener("mouseleave", hideSoon);
      document.body.appendChild(card);
      return card;
    }
    function hideSoon() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (card) card.hidden = true; }, 200);
    }
    function place(anchor) {
      var r = anchor.getBoundingClientRect();
      var top = r.bottom + window.scrollY + 6;
      var left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 340));
      card.style.top = top + "px";
      card.style.left = left + "px";
    }
    function fill(nodes) {
      var c = ensure();
      while (c.firstChild) c.removeChild(c.firstChild);
      for (var i = 0; i < nodes.length; i++) c.appendChild(nodes[i]);
    }
    function refNodes(a) {
      var id = (a.getAttribute("href") || "").replace(/^#/, "");
      if (!id) return null;
      var li = document.getElementById(id);
      if (!li) return null;
      var out = [];
      var kids = li.cloneNode(true).childNodes;
      for (var i = 0; i < kids.length; i++) {
        // drop the back-link caret pandoc/ref adds; keep the footnote text
        if (kids[i].nodeType === 1 && kids[i].classList && kids[i].classList.contains("mw-cite-backlink")) continue;
        out.push(kids[i]);
      }
      var box = el("div", "hovercard-ref");
      for (var j = 0; j < out.length; j++) box.appendChild(out[j]);
      return [box];
    }
    function pageNodes(a) {
      var idx = previews;
      if (!idx) return null;   // index not resolved yet -> no card (native title= covers the gap)
      var href = a.getAttribute("href") || "";
      // Only internal (relative) links have previews -- skip absolute/scheme and
      // protocol-relative links so an EXTERNAL url whose path happens to match an
      // index key never shows a spoofed card.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf("//") === 0) return null;
      // Key is ROOT-RELATIVE ("wiki/Foo/", the page-previews key form). Resolve the
      // anchor against the site root computed from rootPrefix() -- the same path-to-
      // root the search box uses -- so it matches online AND offline via file://
      // (new URL(a.href).pathname would be the full filesystem path under file://).
      var key;
      try {
        var rootUrl = new URL(rootPrefix(), document.baseURI).href;
        var anchorUrl = new URL(a.href).href;
        if (anchorUrl.indexOf(rootUrl) !== 0) return null;  // outside the output tree
        key = decodeURI(anchorUrl.slice(rootUrl.length).split("#")[0]);
      } catch (e) { return null; }
      var p = idx[key];
      if (!p || !p.d) return null;  // only pages with a summary
      var box = el("div", "hovercard-page");
      box.appendChild(el("div", "hovercard-title", p.t || key));
      box.appendChild(el("p", "hovercard-extract", p.d));
      return [box];
    }
    function scheduleCard(nodes, a) {
      if (!nodes) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(function () {
        fill(nodes);
        card.hidden = false;
        place(a);
      }, 200);
    }
    // The link currently under the pointer (set on enter, cleared on leave) -- so a preview that
    // finishes fetching AFTER the pointer moved away does not pop a stale card.
    var hovered = null;
    function onEnter(e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a || !content.contains(a)) return;
      hovered = a;
      // Citations read the DOM -- synchronous, no fetch.
      if (a.closest("sup.reference")) { scheduleCard(refNodes(a), a); return; }
      // Page previews need the index: fetch it once (memoized), then show only if the pointer is
      // still on this link. Once loaded the promise resolves on a microtask, so later hovers are
      // immediate; the first hover before the fetch lands just shows the native title= instead.
      if (a.getAttribute("href") && a.getAttribute("href").indexOf("#") !== 0) {
        ensurePreviews().then(function () {
          if (hovered !== a) return;   // pointer left this link during the fetch
          scheduleCard(pageNodes(a), a);
        });
      }
    }
    content.addEventListener("mouseover", onEnter);
    content.addEventListener("mouseout", function () { hovered = null; clearTimeout(showTimer); hideSoon(); });
  }

  // Browser-storage viewer (the Special:BrowserStorage page): list what this site
  // has in localStorage + a button to clear it. Built with DOM APIs only (Trusted-
  // Types safe -- createElement + textContent). No-JS visitors get the static note.
  function initStorageViewer() {
    var mount = document.querySelector("[data-storage-viewer]");
    if (!mount) return;
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function el(tag, text, cls) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    function render(note) {
      clear(mount);
      // Read the actual state once.
      var present = {};
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var pk = localStorage.key(i);
          present[pk] = localStorage.getItem(pk);
        }
      } catch (err) {
        mount.appendChild(el("p", "Storage is unavailable in this browser."));
        return;
      }
      // Rows: every POTENTIAL key from the registry (shown even when not set), then
      // any unrecognized key actually present -- so nothing is hidden.
      var known = {};
      var rows = STORAGE_KEYS.map(function (k) {
        known[k.key] = true;
        return { key: k.key, label: k.label, set: (k.key in present), value: present[k.key] };
      });
      Object.keys(present).sort().forEach(function (k) {
        if (!known[k]) rows.push({ key: k, label: "(unrecognized)", set: true, value: present[k] });
      });

      var table = el("table", null, "storage-table");
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["Key", "Purpose", "Current value"].forEach(function (h) { hr.appendChild(el("th", h)); });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.appendChild(el("td", r.key));
        tr.appendChild(el("td", r.label));
        // Value + an inline per-item Delete (only when set) in ONE cell -- no dedicated
        // action column, which sits empty whenever nothing is stored.
        var valcell = document.createElement("td");
        valcell.appendChild(el("span", r.set ? r.value : "not set", r.set ? null : "storage-unset"));
        if (r.set) {
          var del = el("button", "Delete", "storage-del");
          del.type = "button";
          (function (key) {
            del.addEventListener("click", function () {
              try { localStorage.removeItem(key); } catch (err) {}
              render("Deleted " + key + ".");
            });
          })(r.key);
          valcell.appendChild(del);
        }
        tr.appendChild(valcell);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      mount.appendChild(table);

      var delAll = el("button", "Delete all stored data", "storage-clear");
      delAll.type = "button";
      delAll.addEventListener("click", function () {
        try { localStorage.clear(); } catch (err) {}
        render("All stored data deleted.");
      });
      mount.appendChild(delAll);
      if (note) mount.appendChild(el("p", note, "storage-cleared"));
    }
    render(null);
  }

  // Wide tables: add a TOP horizontal scrollbar that mirrors the table's own (bottom) one,
  // so a reader scrolls a wide table from either edge. Built only for tables that actually
  // overflow. The always-visible classic bars themselves are pure CSS (see style.css); this
  // only adds + syncs the top rail. No-JS still gets the bottom bar.
  function initWideTableScroll() {
    var tables = document.querySelectorAll(
      ".wiki-content table:not(.toc):not(.storage-table)");
    tables.forEach(function (table) {
      var rail = null, spacer = null, lock = false;
      function build() {
        rail = document.createElement("div");
        rail.className = "table-scroll-top";
        rail.setAttribute("aria-hidden", "true");
        spacer = document.createElement("div");
        rail.appendChild(spacer);
        table.parentNode.insertBefore(rail, table);
        rail.addEventListener("scroll", function () {
          if (lock) { return; }
          lock = true; table.scrollLeft = rail.scrollLeft; lock = false;
        });
        table.addEventListener("scroll", function () {
          if (lock) { return; }
          lock = true; rail.scrollLeft = table.scrollLeft; lock = false;
        });
      }
      // Re-evaluate whenever the table's box changes: it may start hidden (a collapsed
      // mw-collapsible or an inactive tab measures 0), become wide only after an image
      // loads, or cross the overflow threshold on a window resize -- a one-shot check at
      // load would skip all three (the reported bug). Build the rail lazily, the first
      // time the table is actually overwide; hide it again if it later fits.
      function sync() {
        var overwide = table.scrollWidth > table.clientWidth + 1;
        if (overwide && !rail) { build(); }
        if (rail) {
          spacer.style.width = table.scrollWidth + "px";
          rail.style.display = overwide ? "" : "none";
          table.style.marginTop = overwide ? "0" : "";
        }
      }
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(sync).observe(table);
      } else {
        sync();
        var raf = 0;
        window.addEventListener("resize", function () {
          if (raf) { return; }
          raf = requestAnimationFrame(function () { raf = 0; sync(); });
        });
      }
      // A late image load can grow scrollWidth WITHOUT changing the (max-width:100%-capped)
      // border box, so ResizeObserver never fires for it -- re-sync on each image load too.
      table.querySelectorAll("img").forEach(function (img) {
        if (!img.complete) {
          img.addEventListener("load", sync);
          img.addEventListener("error", sync);  // a broken image also changes layout
        }
      });
    });
  }

  // Gallery lightbox: clicking a gallery thumbnail opens a full-viewport overlay with the
  // full-resolution image (the house convention ships no separate thumbnails -- the thumb's
  // own src IS the full image) + caption, and prev/next (< >) buttons plus ArrowLeft/Right
  // keys paging through that gallery. A thumb carrying an explicit link= target is <a>-wrapped
  // by the generator; those opt OUT (their own link still navigates, matching prod's
  // MultimediaViewer). Reuses initModals (Escape / backdrop / X close + focus trap). TT-safe:
  // createElement + addEventListener only.
  function initGalleryLightbox(modals) {
    var galleries = document.querySelectorAll(".gallery");
    for (var g = 0; g < galleries.length; g++) {
      (function (gallery) {
        var boxes = gallery.querySelectorAll(".gallerybox");
        var items = [];  // {src, alt, cap} per lightbox-eligible thumb
        for (var b = 0; b < boxes.length; b++) {
          var img = boxes[b].querySelector(".thumb img");
          if (!img) continue;
          // The no-JS floor wraps a lightbox thumb in a.glb-link (href = the full image);
          // enhance THAT. A link= opt-out is a plain <a> (navigates elsewhere) -- leave it.
          var wrapA = img.closest("a");
          if (wrapA && !wrapA.classList.contains("glb-link")) continue;
          var textEl = boxes[b].querySelector(".gallerytext");
          var cap = (textEl && textEl.textContent.trim()) || img.getAttribute("alt") || "";
          (function (idx, trigger) {
            if (trigger) {
              // a.glb-link is focusable + Enter-activates natively; intercept its navigation.
              trigger.addEventListener("click", function (e) { e.preventDefault(); openAt(idx); });
            } else {
              // Defensive (unwrapped thumb): make the img itself the trigger.
              img.classList.add("glb-thumb");
              img.setAttribute("tabindex", "0");
              img.setAttribute("role", "button");
              img.addEventListener("click", function (e) { e.preventDefault(); openAt(idx); });
              img.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAt(idx); }
              });
            }
          })(items.length, wrapA);
          items.push({
            src: img.currentSrc || img.getAttribute("src") || "",
            alt: img.getAttribute("alt") || "", cap: cap
          });
        }
        if (!items.length) return;

        var cur = 0, bigImg = null, capEl = null;
        function render() {
          var it = items[cur];
          bigImg.setAttribute("src", it.src);
          bigImg.setAttribute("alt", it.alt);
          capEl.textContent = it.cap;
        }
        function step(d) { cur = (cur + d + items.length) % items.length; render(); }
        function openAt(i) {
          cur = i;
          var modal = el("div", "mini-modal gallery-lightbox");
          modal.setAttribute("role", "dialog");
          modal.setAttribute("aria-modal", "true");
          modal.hidden = true;
          modal.appendChild(el("div", "underlay"));
          var closeBtn = el("button", "mm-close");
          closeBtn.type = "button";
          closeBtn.setAttribute("aria-label", "Close");
          closeBtn.appendChild(el("i", "fa-solid fa-xmark"));
          modal.appendChild(closeBtn);
          var content = el("div", "content");
          bigImg = el("img", "glb-image");
          content.appendChild(bigImg);
          capEl = el("div", "glb-caption");
          content.appendChild(capEl);
          if (items.length > 1) {
            var prev = el("button", "glb-nav glb-prev");
            prev.type = "button";
            prev.setAttribute("aria-label", "Previous image");
            prev.appendChild(el("i", "fa-solid fa-chevron-left"));
            prev.addEventListener("click", function () { step(-1); });
            var next = el("button", "glb-nav glb-next");
            next.type = "button";
            next.setAttribute("aria-label", "Next image");
            next.appendChild(el("i", "fa-solid fa-chevron-right"));
            next.addEventListener("click", function () { step(1); });
            content.appendChild(prev);
            content.appendChild(next);
          }
          modal.appendChild(content);
          function onKey(e) {
            if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
          }
          document.addEventListener("keydown", onKey);
          document.body.appendChild(modal);
          render();
          modals.open(modal, function () {
            document.removeEventListener("keydown", onKey);
            modal.remove();
          });
        }
      })(galleries[g]);
    }
  }

  // Idiomatic menubar keyboard navigation for the header nav (#69): Left/Right move between
  // top-level items, Down opens+enters a submenu, Up/Down within it, Escape closes + returns,
  // Home/End jump, Enter/Space follow the link (native). Progressive: Tab + the CSS :focus-within
  // path remain the no-JS / Tor-Safest baseline, untouched. Trusted-Types-safe (setAttribute /
  // classList / focus only). Roving tabindex = one Tab stop into the bar, arrows move within.
  function initNavKeyboard() {
    var nav = document.querySelector(".site-nav > ul");
    if (!nav) return;
    var tops = [];
    var lis = nav.querySelectorAll(":scope > li");
    for (var i = 0; i < lis.length; i++) {
      var a = lis[i].querySelector(".nav-top") || lis[i].querySelector("a");
      if (a) tops.push(a);
    }
    if (tops.length < 2) return;
    nav.setAttribute("role", "menubar");
    tops.forEach(function (a, idx) {
      a.closest("li").setAttribute("role", "none");
      a.setAttribute("role", "menuitem");
      a.tabIndex = idx === 0 ? 0 : -1;
      var sub = subOf(idx);
      if (sub.length) {
        a.setAttribute("aria-haspopup", "true");
        a.setAttribute("aria-expanded", "false");
        var ul = a.closest("li").querySelector(".nav-submenu");
        ul.setAttribute("role", "menu");
        sub.forEach(function (si) { si.closest("li").setAttribute("role", "none"); si.setAttribute("role", "menuitem"); });
      }
    });
    function subOf(idx) {
      var ul = tops[idx].closest("li").querySelector(".nav-submenu");
      return ul ? [].slice.call(ul.querySelectorAll(":scope > li > a")) : [];
    }
    function focusTop(idx) {
      tops.forEach(function (a, j) { a.tabIndex = j === idx ? 0 : -1; });
      tops[idx].focus();
    }
    function setOpen(idx, open) {
      var li = tops[idx].closest("li");
      if (!subOf(idx).length) return;
      if (open) li.classList.add("kb-open"); else li.classList.remove("kb-open");
      tops[idx].setAttribute("aria-expanded", open ? "true" : "false");
    }
    function closeAll() { tops.forEach(function (_, j) { setOpen(j, false); }); }
    function topIndex(el) { for (var j = 0; j < tops.length; j++) if (tops[j] === el) return j; return -1; }
    function subPos(el) {
      for (var j = 0; j < tops.length; j++) { var it = subOf(j); var p = it.indexOf(el); if (p >= 0) return { g: j, p: p, items: it }; }
      return null;
    }
    nav.addEventListener("keydown", function (e) {
      var k = e.key, ti = topIndex(e.target);
      if (ti >= 0) {
        if (k === "ArrowRight" || k === "ArrowLeft") {
          e.preventDefault(); closeAll();
          focusTop(k === "ArrowRight" ? (ti + 1) % tops.length : (ti - 1 + tops.length) % tops.length);
        } else if (k === "ArrowDown") {
          e.preventDefault(); setOpen(ti, true); var it = subOf(ti); if (it.length) it[0].focus();
        } else if (k === "Home") { e.preventDefault(); focusTop(0); }
        else if (k === "End") { e.preventDefault(); focusTop(tops.length - 1); }
        else if (k === "Escape") { closeAll(); }
        return;
      }
      var cs = subPos(e.target);
      if (!cs) return;
      if (k === "ArrowDown") { e.preventDefault(); cs.items[(cs.p + 1) % cs.items.length].focus(); }
      else if (k === "ArrowUp") { e.preventDefault(); if (cs.p === 0) { setOpen(cs.g, false); focusTop(cs.g); } else cs.items[cs.p - 1].focus(); }
      else if (k === "Escape") { e.preventDefault(); setOpen(cs.g, false); focusTop(cs.g); }
      else if (k === "ArrowRight" || k === "ArrowLeft") {
        e.preventDefault(); setOpen(cs.g, false);
        var n = k === "ArrowRight" ? (cs.g + 1) % tops.length : (cs.g - 1 + tops.length) % tops.length;
        setOpen(n, true); var it2 = subOf(n); if (it2.length) it2[0].focus(); else focusTop(n);
      } else if (k === "Home") { e.preventDefault(); cs.items[0].focus(); }
      else if (k === "End") { e.preventDefault(); cs.items[cs.items.length - 1].focus(); }
    });
    nav.addEventListener("focusout", function (e) { if (!nav.contains(e.relatedTarget)) closeAll(); });
  }

  // Per-heading share menus are server-rendered into an inert <template class="share-full">
  // (NOT in the render tree -> zero style/layout, and never queried at load). Move one into its
  // live .menu on the first PRESS or focus of that heading's share button, then wire its copy
  // buttons. This keeps the full per-section social+copy menu for JS users while the initial
  // RENDERED DOM stays ~500 elements (it was ~3881 on ISO -- the 29 full heading menus dominated
  // mobile Style & Layout / TBT); no-JS / Tor-Safest users keep the static permalink. ONE
  // delegated listener pair -> ~zero load-time JS, and nothing is built for headings nobody opens.
  function initShareLazy() {
    function activate(tip) {
      var tmpl = tip.querySelector("template.share-full");
      if (!tmpl) return;                                   // page-level/footer/open menus: no template
      tmpl.parentNode.insertBefore(tmpl.content, tmpl);    // move the inert nodes into the live menu
      tmpl.remove();
      initCopyButtons();                                   // idempotent: wires only the new .code-select
    }
    function onPress(e) {
      var el = e.target;
      if (el && el.closest) { var tip = el.closest(".share-tooltip"); if (tip) activate(tip); }
    }
    document.addEventListener("pointerdown", onPress);     // press (mouse/touch/pen)
    document.addEventListener("focusin", onPress);         // keyboard focus into the share button
  }

  ready(function () {
    // Paint-, theme-, hash- and layout-critical: run immediately. Deferring these would flash
    // the stored theme, fail to open a hash-targeted tab/<details> on load, or shift layout
    // after first paint (banners show/hide, the bottom-stack spacer, the tab switcher).
    initDarkMode();
    openHashDetails();
    window.addEventListener("hashchange", openHashDetails);
    initTabs();
    window.addEventListener("hashchange", syncTabsFromHash);
    initNavToggle();
    initNavKeyboard();
    initToolsToggle();
    initConsentBanner();
    initStageBanner();
    initBottomStackSpacer();
    initSitenotice();
    // Everything else is interaction-driven and not needed at first paint -- defer to idle so
    // its setup does not block the main thread during load. The two that mutate layout
    // (code-select, table-expand) have reserved CSS space / matched wrapping so running late
    // does not shift content.
    whenIdle(function () {
      initCopyButtons();
      initDataCopy();
      initPagePrint();
      initExpandCollapseAll();
      initBackToTop();
      initSearch();
      initFlyin();
      var modals = initModals();
      initDownloadModal(modals);
      initTableExpand(modals);
      initGalleryLightbox(modals);
      initWideTableScroll();
      initHovercards();
      initStorageViewer();
      initShareLazy();
    });
  });
})();
