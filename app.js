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
        // focusable so keyboard users can scroll the horizontal overflow
        vp.setAttribute("tabindex", "0");
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

  // "Compare more features": the generator ships the extra comparison rows visible with the
  // toggle control hidden (no-JS reader sees every row). On load, reveal the control and collapse
  // the extras; the button toggles .cmp-collapsed on the table + its own aria-expanded.
  function initComparisonMore() {
    var btns = document.querySelectorAll(".comparison-table .cmp-more-btn");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var table = btn.closest(".comparison-table");
        var row = btn.closest(".cmp-more-ctrl");
        if (!table || !row) return;
        row.hidden = false;
        table.classList.add("cmp-collapsed");
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", function () {
          var collapsed = table.classList.toggle("cmp-collapsed");
          btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        });
      })(btns[i]);
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

  // Defense in depth beneath the CSP + Trusted Types (which already block a javascript:
  // navigation): a URL this script will navigate to must be same-origin. A relative path
  // (incl. "" = the root/homepage, "wiki/Foo", "../wiki/Foo") is allowed; a leading scheme
  // (javascript:/data:/...) or a protocol-relative "//host" is not. allowAbsolute additionally
  // permits an explicit http(s):// target, for the download buttons that link to the release
  // host (https on clearnet, http on an onion mirror). Guards the search + download sinks
  // against a tampered same-origin index/attribute: a planted javascript: href is dropped,
  // not navigated.
  function navSafe(h, allowAbsolute) {
    if (typeof h !== "string") return false;
    // Browsers strip ASCII tab/newline anywhere in a URL and leading C0/space before resolving
    // its scheme, so "ja\tvascript:" and " javascript:" still execute -- strip that set for the
    // scheme CHECK (mirrors parserfunctions.safe_url), then test the cleaned value.
    var p = h.replace(/[\u0000- \u007f]/g, "");
    if (p.slice(0, 2) === "//") return false;               // protocol-relative -> cross-origin
    var m = /^([a-z][a-z0-9+.-]*):/i.exec(p);                // a leading URL scheme?
    if (!m) return true;                                     // relative (incl. "") -> same-origin
    var s = m[1].toLowerCase();                              // an absolute target: only http(s),
    return !!allowAbsolute && (s === "http" || s === "https");  // never javascript:/data:/etc.
  }

  // ---- Full-text search primitives: MIRROR mwstatic/search_index.py byte-for-byte. The shared
  // fixture tests/js-tests + mwstatic/tests/fixtures/search-parity.json gate both languages, so a
  // drift here fails its test lane. Tokens are reduced to ASCII [a-z0-9], the ONE class JS and
  // Python match identically (JS \w is not Unicode even under /u), so lower-casing and the FNV-1a
  // math agree with no Unicode-class or UTF-8 divergence. ----
  var SEARCH_STOPWORDS = (
    "all also an and any are as at be been but by can com day did do for from get go had has " +
    "have he her here him his how http https if in into is it its man may me more my new no not " +
    "now of old on one only or org other our out see so some such than that the their them then " +
    "there they this to too two up us use was we were what when which who will with would www " +
    "you your").split(" ").reduce(function (s, w) { s[w] = 1; return s; }, Object.create(null));
  function tokenize(text) {
    var m = String(text).toLowerCase().match(/[a-z0-9]+/g);
    if (!m) return [];
    var out = [];
    for (var i = 0; i < m.length; i++) {
      if (m[i].length > 1 && !SEARCH_STOPWORDS[m[i]]) out.push(m[i]);
    }
    return out;
  }
  function ftHash(term) {              // FNV-1a 32-bit over the term's bytes (ASCII == char codes)
    var h = 0x811c9dc5;
    for (var i = 0; i < term.length; i++) {
      h ^= term.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function ftBucket(term, buckets) { return ftHash(term) % buckets; }
  function pad3(n) { return ("00" + n).slice(-3); }            // shard basename (0..511 -> "000")
  function undelta(deltas) {                                   // delta-coded positions -> absolute
    var out = [], acc = 0;
    for (var i = 0; i < deltas.length; i++) { acc += deltas[i]; out.push(acc); }
    return out;
  }
  // Reward query terms that occur ADJACENT (in query order) in a page body -- a phrase/proximity
  // hit. +1.5 per adjacent query-term pair whose positions are consecutive somewhere in the body.
  function proximityBonus(positionsPerTerm) {
    if (positionsPerTerm.length < 2) return 0;
    var bonus = 0;
    for (var k = 0; k < positionsPerTerm.length - 1; k++) {
      var a = positionsPerTerm[k], next = positionsPerTerm[k + 1], set = {};
      for (var i = 0; i < next.length; i++) set[next[i]] = 1;
      for (var j = 0; j < a.length; j++) { if (set[a[j] + 1]) { bonus += 1.5; break; } }
    }
    return bonus;
  }
  // BM25 over the AND-intersection of posting lists, plus a title boost and the proximity bonus.
  // `lists[t]` is the posting list for query term t: [[pageId, titleTf, deltaPositions], ...].
  // Returns [[pageId, score], ...] sorted by score desc (pageId tie-break for determinism).
  function scoreBM25(manifest, terms, lists) {
    var k1 = 1.2, b = 0.75;
    var n = manifest.docs || 1, avgdl = manifest.avgdl || 1, dl = manifest.dl || [];
    var maps = lists.map(function (pl) {
      var m = {};
      for (var i = 0; i < pl.length; i++) m[pl[i][0]] = pl[i];
      return m;
    });
    var shortest = 0;                        // intersect by scanning the rarest term's list
    for (var i = 1; i < lists.length; i++) {
      if (lists[i].length < lists[shortest].length) shortest = i;
    }
    var out = [];
    var cand = lists[shortest];
    for (var c = 0; c < cand.length; c++) {
      var id = cand[c][0], ok = true, score = 0, positionsPerTerm = [];
      for (var t = 0; t < maps.length; t++) {
        var post = maps[t][id];
        if (!post) { ok = false; break; }        // not in every term's list -> fails AND
        var titleTf = post[1], tf = post[2].length, df = lists[t].length;
        var idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        var docLen = dl[id] || avgdl;
        score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgdl));
        score += idf * titleTf * 2;              // a title occurrence weighs strongly
        positionsPerTerm.push(undelta(post[2]));
      }
      if (!ok) continue;
      score += proximityBonus(positionsPerTerm);
      out.push([id, score]);
    }
    out.sort(function (x, y) { return y[1] - x[1] || x[0] - y[0]; });
    return out;
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
    // Full-text index: a tiny manifest (buckets, doc stats, per-shard content hash) fetched once,
    // then only the one or two small shards a query's terms HASH to -- never the whole index, so
    // cost stays flat as the wiki grows. Both fetches are same-origin (connect-src 'self'), inert
    // JSON, memoized single-flight, and degrade to null on absence so title search still works.
    var manifest = null, manifestLoading = null;
    function ensureManifest() {
      if (!manifestLoading) {
        manifestLoading = loadJSON(carrierHref("mw-fulltext-manifest")).then(function (d) {
          manifest = d;
          return d;
        });
      }
      return manifestLoading;
    }
    var shardCache = {};                    // shard basename -> single-flight fetch promise
    function ensureShard(man, term) {
      var name = pad3(ftBucket(term, man.buckets));
      var h = man.sh && man.sh[name];
      if (!h) return Promise.resolve(null); // empty bucket: no shard emitted -> no fetch, no 404
      if (!shardCache[name]) {
        shardCache[name] = loadJSON(root + man.base + name + ".json?h=" + h);
      }
      return shardCache[name];
    }
    function appendResult(e) {              // TT-safe: textContent + setAttribute only, no HTML-string sink
      var href = root + e.u;
      if (!navSafe(href, false)) return false;   // drop a row whose (tampered) target is not same-origin
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.setAttribute("href", href);
      a.textContent = e.t;
      li.appendChild(a);
      results.appendChild(li);
      return true;                          // caller counts a row only when one was really added
    }
    // The open field is an ABSOLUTE overlay; anchor the panel just below its rendered box (CSSOM
    // .style is not gated by style-src -- CSP-safe, same as the bottom-stack spacer).
    function positionPanel() {
      if (!results.hidden) results.style.top = (input.offsetTop + input.offsetHeight + 4) + "px";
    }
    // Monotonic query id: an async shard batch that resolves after a newer keystroke is dropped.
    var queryGen = 0;
    // Augment the (already rendered) title hits with body matches the title scan missed. Appends
    // BM25-ranked body-only pages after the title hits, up to the 20 cap. Skipped for a
    // namespace-qualified query (that path stays title-only, main namespace).
    function fullText(q, gen, shownIds, shownCount) {
      ensureManifest().then(function (man) {
        if (!man || gen !== queryGen) return;
        var terms = [], seen = Object.create(null);   // null-proto: a term "constructor" etc. must not hit Object.prototype
        tokenize(q).forEach(function (t) { if (!seen[t]) { seen[t] = 1; terms.push(t); } });
        if (!terms.length) return;
        Promise.all(terms.map(function (t) { return ensureShard(man, t); })).then(function (objs) {
          if (gen !== queryGen) return;
          var lists = [];
          for (var i = 0; i < terms.length; i++) {
            // Own-property guard: a shard is a JSON object, so objs[i]["constructor"] would
            // otherwise resolve to an Object.prototype member and corrupt the posting list.
            var pl = (objs[i] && Object.prototype.hasOwnProperty.call(objs[i], terms[i]))
              ? objs[i][terms[i]] : null;
            if (!pl) return;              // AND semantics: a missing term -> no full-text hits
            lists.push(pl);
          }
          var ranked = scoreBM25(man, terms, lists), added = 0;
          for (var j = 0; j < ranked.length && shownCount < 20; j++) {
            var id = ranked[j][0], e = index[id];
            if (shownIds[id] || !e || e.n) continue;   // already shown, or (defensively) namespaced
            if (!appendResult(e)) continue;             // a dropped (tampered) target adds no row
            shownIds[id] = 1;
            shownCount++;
            added++;
          }
          if (added) { results.hidden = false; positionPanel(); }
        });
      });
    }
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
        var gen = ++queryGen;
        while (results.firstChild) results.removeChild(results.firstChild);
        if (q.length < 2) { results.hidden = true; return; }
        // Title pass (instant, no extra fetch): substring title matches, tracked by pageId so the
        // full-text pass never double-lists a page.
        var shownIds = {}, shown = 0;
        for (var i = 0; i < index.length && shown < 20; i++) {
          var e = index[i];
          if (!nsEligible(e, q)) continue;   // namespaced page: only for its own namespace query
          if (e.t.toLowerCase().indexOf(q) === -1) continue;
          if (!appendResult(e)) continue;    // a dropped (tampered) target adds no row -> no count
          shownIds[i] = 1;
          shown++;
        }
        results.hidden = shown === 0;
        positionPanel();
        // Full-text pass (async, appended when the on-demand shards arrive). A namespace-qualified
        // query stays title-only -- its body words would wrongly surface main-namespace pages.
        if (q.indexOf(":") === -1) fullText(q, gen, shownIds, shown);
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
        // Prefer an exact/substring TITLE match; else fall back to the top rendered row (which may
        // be a body-only full-text hit) so Enter is never inert while results are on screen.
        var href = bestMatch(q);
        if (href === null) {
          var firstLink = results.querySelector("li a");
          if (firstLink) href = firstLink.getAttribute("href");
        }
        if (href !== null && navSafe(href, false)) window.location.assign(href);
      });
    });
    // Close the box on an outside click / Escape (JS enhancement of the CSS :checked toggle):
    // uncheck the toggle AND clear/hide the live results so neither lingers. Scoped to the
    // search widget -- it does NOT cover the page, so the mobile nav's own outside-tap close
    // still fires. TT-safe: only checkbox.checked + removeChild, no HTML sinks.
    var toggle = document.getElementById("search-toggle");
    var box = input.closest(".site-search");
    function closeSearch() {
      // Bump queryGen so a still-in-flight full-text shard batch cannot REOPEN the panel we are
      // closing (its gen !== queryGen guard then drops it).
      queryGen++;
      if (toggle) toggle.checked = false;
      results.hidden = true;
      while (results.firstChild) results.removeChild(results.firstChild);
    }
    // The magnifier is a pure-CSS :checked toggle; a USER unchecking it fires 'change' (a
    // programmatic closeSearch does not), so FULLY close here -- hide + clear the results, not
    // just bump queryGen, else the dropdown lingers visible after the search box collapses.
    if (toggle) {
      toggle.addEventListener("change", function () { if (!toggle.checked) closeSearch(); });
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
    // Read the geometry ONCE, before any style write: reading offsetHeight again AFTER writing
    // body.paddingBottom would force a second synchronous relayout (a ~69ms forced reflow on this
    // large page). One read, then both writes, so the layout is flushed at most once.
    var h = stack ? stack.offsetHeight : 0;
    if (stack) document.body.style.paddingBottom = h + "px";
    // Lift the back-to-top button above the fixed bottom banner stack so they do not overlap;
    // drops back to 20px once the stack collapses (banners dismissed). CSSOM, so CSP-safe.
    var btt = document.querySelector(".back-to-top");
    if (btt) btt.style.bottom = (h ? h + 20 : 20) + "px";
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
      // dead: close() runs only with a modal active -- open() calls it behind if(active); the Escape
      // + underlay/.mm-close handlers behind if(!active)return; {open,close} is a local never put on
      // window. Author retired; verified by call-site analysis (navSafe @7509f88 did not touch this).
      /* c8 ignore next */
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
      // dead: focusables() is called only from the Tab branch of the modal keydown handler, itself
      // behind if(!active)return, so active is never null here. Author retired; verified by call-site analysis.
      /* c8 ignore next */
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
          // The modal auto-navigates (proceed.click after the countdown); only an https or
          // same-origin target may drive that, never a tampered javascript:/data: href.
          if (!navSafe(href, true)) return;
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
    // Every [n] citation in document order -> the prev/next buttons in a reference card step
    // through all of them. curRef is the one currently shown.
    var refList = [].slice.call(content.querySelectorAll("sup.reference a[href^='#']"));
    var curRef = -1;
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
    // The prev/next footnote navigator that lives INSIDE a reference card.
    function navFor(idx) {
      var nav = el("div", "hovercard-nav");
      var prev = el("button", "hovercard-navbtn", String.fromCharCode(0x25C0));  // left-pointing triangle
      var pos = el("span", "hovercard-pos", (idx + 1) + " / " + refList.length);
      var next = el("button", "hovercard-navbtn", String.fromCharCode(0x25B6));  // right-pointing triangle
      prev.type = next.type = "button";
      prev.setAttribute("aria-label", "Previous footnote");
      next.setAttribute("aria-label", "Next footnote");
      prev.addEventListener("click", function () { clearTimeout(hideTimer); showRef((idx - 1 + refList.length) % refList.length); });
      next.addEventListener("click", function () { clearTimeout(hideTimer); showRef((idx + 1) % refList.length); });
      nav.appendChild(prev); nav.appendChild(pos); nav.appendChild(next);
      return nav;
    }
    // Show reference `idx` in the card. `anchor` is passed only on the first hover -> position the
    // card near that citation; the prev/next buttons omit it, so the card flips content IN PLACE
    // (you keep your spot). The card keeps itself open on mouseenter, so you can move into it to
    // scroll, select/copy, or follow links; moving the pointer away dismisses it.
    function showRef(idx, anchor) {
      var nodes = refNodes(refList[idx]);
      if (!nodes) return;
      curRef = idx;
      // Headline + prev/next navigator go at the TOP (prepended), above the note text. The
      // headline number is the citation's visible label ([1] -> "1", [g 1] -> "g 1").
      var num = (refList[idx].textContent || "").replace(/[\[\]]/g, "").trim();
      var head = [el("div", "hovercard-title", "Footnote " + num)];
      if (refList.length > 1) head.push(navFor(idx));
      fill(head.concat(nodes));
      card.hidden = false;
      if (anchor) place(anchor);
    }
    function pageNodes(a) {
      var idx = previews;
      // dead: previews is null only until ensurePreviews() resolves it to (d||{}); pageNodes()'s sole
      // caller runs inside ensurePreviews().then(...), so idx is always truthy here. Author retired; verified.
      /* c8 ignore next */
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
      // Citations read the DOM -- synchronous, no fetch. A reference card carries the prev/next
      // navigator (browse all notes in place); a citation not in the list falls back to a plain card.
      if (a.closest("sup.reference")) {
        var ri = refList.indexOf(a);
        if (ri === -1) { scheduleCard(refNodes(a), a); return; }
        clearTimeout(showTimer);
        showTimer = setTimeout(function () { ensure(); showRef(ri, a); }, 200);
        return;
      }
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
    // While a reference card is open, Left/Right arrows step through the footnotes in place
    // (same wrap as the prev/next buttons); Escape dismisses any open card. Gated on a reference
    // card being shown (.hovercard-ref present) so arrows never hijack a page-preview card.
    document.addEventListener("keydown", function (e) {
      if (!card || card.hidden) return;
      if (e.key === "Escape") { card.hidden = true; return; }
      if (curRef < 0 || refList.length < 2 || !card.querySelector(".hovercard-ref")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); clearTimeout(hideTimer); showRef((curRef - 1 + refList.length) % refList.length); }
      else if (e.key === "ArrowRight") { e.preventDefault(); clearTimeout(hideTimer); showRef((curRef + 1) % refList.length); }
    });
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
      // Read the actual state once. Null-proto: a localStorage key named "__proto__" /
      // "constructor" (same-origin script only) must land as an OWN entry, not touch
      // Object.prototype, so the viewer lists and deletes it like any other.
      var present = Object.create(null);
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
      // any unrecognized key actually present -- so nothing is hidden. Null-proto so a
      // "__proto__"/"constructor" key reads as absent from the registry (!known[k] true)
      // and is listed as unrecognized, not silently swallowed by an Object.prototype hit.
      var known = Object.create(null);
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
    // One controller per table, but a SINGLE batched sync across all of them: the per-table
    // observer-and-sync shape read scrollWidth/clientWidth then wrote spacer/rail/margin in
    // the same step, so the next table's read forced a synchronous relayout (read-write-read
    // thrash -> the reported ~83ms forced reflow on a multi-table page).
    var items = [];
    tables.forEach(function (table) {
      items.push({ table: table, rail: null, spacer: null, lock: false });
    });
    function build(item) {
      var table = item.table;
      item.rail = document.createElement("div");
      item.rail.className = "table-scroll-top";
      item.rail.setAttribute("aria-hidden", "true");
      item.spacer = document.createElement("div");
      item.rail.appendChild(item.spacer);
      table.parentNode.insertBefore(item.rail, table);
      item.rail.addEventListener("scroll", function () {
        if (item.lock) { return; }
        item.lock = true; table.scrollLeft = item.rail.scrollLeft; item.lock = false;
      });
      table.addEventListener("scroll", function () {
        if (item.lock) { return; }
        item.lock = true; item.rail.scrollLeft = table.scrollLeft; item.lock = false;
      });
    }
    // Re-evaluate whenever a table's box changes: it may start hidden (a collapsed
    // mw-collapsible or an inactive tab measures 0), become wide only after an image
    // loads, or cross the overflow threshold on a window resize -- a one-shot check at
    // load would skip all three (the reported bug). Build each rail lazily, the first
    // time its table is actually overwide; hide it again if it later fits.
    //
    // Batched: READ every table's geometry into `measures` FIRST, THEN apply every style
    // write. No write sits between two reads, so layout is flushed at most once per sync.
    function sync() {
      var i, measures = [];
      for (i = 0; i < items.length; i++) {
        var t = items[i].table;
        var sw = t.scrollWidth, cw = t.clientWidth;
        measures.push({ overwide: sw > cw + 1, scrollWidth: sw });
      }
      for (i = 0; i < items.length; i++) {
        var item = items[i], m = measures[i];
        if (m.overwide && !item.rail) { build(item); }
        if (item.rail) {
          item.spacer.style.width = m.scrollWidth + "px";
          item.rail.style.display = m.overwide ? "" : "none";
          item.table.style.marginTop = m.overwide ? "0" : "";
        }
      }
    }
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(sync);
      items.forEach(function (item) { ro.observe(item.table); });
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
    items.forEach(function (item) {
      item.table.querySelectorAll("img").forEach(function (img) {
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
  // (NOT in the render tree -> zero style/layout, and never queried at load). On first HOVER,
  // press or focus of a heading's share button the template is moved into its live .menu, so CSS
  // :hover/:focus-within then reveals the FULL menu with no click (desktop hover + keyboard). A
  // tap/click additionally TOGGLES a persistent .share-open, essential on touch: a tap holds
  // neither :hover nor :focus-within, so without it the menu never stays open on a phone. Same
  // code on every platform (no UA branching) -- the browser decides which events fire. This keeps
  // the full per-section social+copy menu for JS
  // users while the initial RENDERED DOM stays ~500 elements (it was ~3881 on ISO -- the 29 full
  // heading menus dominated mobile Style & Layout / TBT); no-JS / Tor-Safest users keep the static
  // permalink. Delegated listeners -> ~zero load-time JS, nothing built for headings nobody opens.
  function initShareLazy() {
    function activate(tip) {
      var tmpl = tip.querySelector("template.share-full");
      if (!tmpl) return;                                   // footer/page/authored menus: no template
      var menu = tmpl.parentNode;
      // The template's full menu RE-INCLUDES the permalink, so drop the pre-rendered no-JS
      // permalink (every node before the template) -- else it would show twice once injected.
      while (menu.firstChild && menu.firstChild !== tmpl) menu.removeChild(menu.firstChild);
      menu.insertBefore(tmpl.content, tmpl);               // move the inert nodes into the live menu
      tmpl.remove();
      initCopyButtons();                                   // idempotent: wires only the new .code-select
    }
    function closeAll(except) {
      var open = document.querySelectorAll(".share-tooltip.share-open");
      for (var i = 0; i < open.length; i++) if (open[i] !== except) open[i].classList.remove("share-open");
    }
    // Prime: inject the full menu on first press/focus so :hover and :focus-within reveal it.
    function onPrime(e) {
      var el = e.target;
      if (el && el.closest) { var tip = el.closest(".share-tooltip"); if (tip) activate(tip); }
    }
    // Toggle the persistent open state on tap/click. preventDefault stops the anchor's #id jump so
    // the tap opens the menu instead of scrolling the page. Authored (is_open) demo figures have
    // no .headline-anchor toggle target here but stay open via their own .is-open -- untouched.
    function onToggle(e) {
      var a = e.target && e.target.closest ? e.target.closest(".headline-anchor") : null;
      var tip = a && a.closest(".share-tooltip");
      if (!tip) return;                                    // clicks inside the menu fall through
      e.preventDefault();
      activate(tip);
      var open = !tip.classList.contains("share-open");
      closeAll(tip);
      if (open) tip.classList.add("share-open"); else tip.classList.remove("share-open");
    }
    document.addEventListener("pointerover", onPrime);     // prime on HOVER -> desktop hover reveals the FULL menu, no click
    document.addEventListener("pointerdown", onPrime);     // prime on press (touch/pen may skip hover)
    document.addEventListener("focusin", onPrime);         // prime on keyboard/tap focus
    document.addEventListener("click", onToggle);          // reliable tap toggle (touch has no hover to hold it open)
    document.addEventListener("pointerdown", function (e) {   // dismiss on an outside press
      if (!(e.target && e.target.closest && e.target.closest(".share-tooltip"))) closeAll(null);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(null); });
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
      initComparisonMore();
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

  // Test-support: expose the pure, side-effect-free search primitives so the js-test lane can
  // assert app.js's OWN tokenizer/hash against the shared parity fixture (the cross-language gate)
  // and unit-test the scorer directly. navSafe is exposed too (jsdom cannot spy location.assign,
  // so the nav guard is unit-tested here). No DOM, network, or secret surface.
  window.mwSearch = {
    tokenize: tokenize, ftHash: ftHash, ftBucket: ftBucket,
    stopwords: SEARCH_STOPWORDS, score: scoreBM25, navSafe: navSafe
  };
})();
