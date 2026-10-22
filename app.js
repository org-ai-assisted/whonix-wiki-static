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
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fa-regular fa-clone fa-rotate-90 cbutton";
        btn.setAttribute("aria-label", "Copy code to clipboard");
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
          btn.classList.remove("fa-regular", "fa-clone", "fa-rotate-90");
          btn.classList.add("fa-solid", "fa-check");
          clearTimeout(timer);
          timer = setTimeout(function () {
            block.classList.remove("copied");
            btn.classList.remove("fa-solid", "fa-check");
            btn.classList.add("fa-regular", "fa-clone", "fa-rotate-90");
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

  // Print button: the supermenu's [data-action="print"] triggers the browser print dialog
  // (a print stylesheet strips chrome). window.print is the only static-safe "printable view".
  function initPagePrint() {
    var btns = document.querySelectorAll('[data-action="print"]');
    for (var i = 0; i < btns.length; i++) {
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

  // The crypto-panel QR reveal and the "More Payment Options" grid collapse are now pure-CSS
  // checkbox-hacks (a hidden <input class="expand-checkbox"> + a <label>), so no JS wires
  // them -- they work (and stay collapsed) with JavaScript disabled, matching production.

  // A controller's DIRECT sections (nested controllers are handled by their own pass).
  function tabSections(ctrl) { return ctrl.querySelectorAll(":scope > .tcc-content > .tcc-section"); }
  // Activate section idx of ctrl (toggle both the section and its pill).
  function activateTab(ctrl, idx) {
    var secs = tabSections(ctrl);
    var pills = ctrl.querySelectorAll(":scope > .mininav > ul > li > .tcc-tab");
    for (var k = 0; k < secs.length; k++) secs[k].classList.toggle("active", k === idx);
    for (var b = 0; b < pills.length; b++) pills[b].classList.toggle("active", b === idx);
  }

  // Tab controllers: build the mininav switcher (one pill per section, labelled by the
  // section title), default to the active/first tab, switch on click. No-JS shows all
  // sections. TT-safe: createElement/textContent/classList only.
  function initTabs() {
    var controllers = document.querySelectorAll(".tab-content-controller");
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
          var a = document.createElement("a");
          a.className = "tcc-tab";
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

  // Back-to-top button (created dynamically). Matches production: a chevron glyph
  // that appears while scrolling past a threshold and auto-hides ~2s after scrolling
  // stops; click scrolls smoothly to the top. TT-safe (createElement/classList only).
  function initBackToTop() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "back-to-top";
    btn.setAttribute("aria-label", "Back to top of the page");
    var icon = document.createElement("i");
    icon.className = "fa-solid fa-chevron-up";
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(icon);
    btn.hidden = true;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(btn);
    var idle = null;
    window.addEventListener("scroll", function () {
      if (window.scrollY < 400) { btn.hidden = true; return; }
      btn.hidden = false;
      clearTimeout(idle);
      idle = setTimeout(function () { btn.hidden = true; }, 2000);
    });
  }

  // Live search over the prebuilt index (window.MWSEARCH, loaded as a script -- no
  // fetch, so it works under connect-src 'none'). No-JS users get the Browse link.
  // Index URLs are stored relative to the site root ("wiki/Foo/"). Derive this
  // page's path-to-root from app.js's own (already per-page relativized) src, so
  // search links resolve both online (served at domain root) and offline (file://).
  function rootPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      var m = src.match(/^(.*?)app\.js$/);
      if (m) return m[1];
    }
    return "";
  }

  function initSearch() {
    var input = document.getElementById("search-input");
    if (!input || !window.MWSEARCH) return;
    var root = rootPrefix();
    var results = document.createElement("ul");
    results.className = "search-results";
    results.hidden = true;
    input.parentNode.appendChild(results);
    // Best page for a query: an EXACT (case-insensitive) title match wins over a mere
    // substring hit, so "api" + Enter lands on the "API" page even when other titles
    // (e.g. "...API...") also contain the term. Scans the whole index, not just the
    // rendered top 20. Returns the root-relative href or "".
    function bestMatch(q) {
      // null (not "") is the no-match sentinel: the Homepage index entry has u="" and,
      // on the root page, root="" too, so a valid homepage href is the empty string --
      // treating "" as "no match" would skip it and mis-pick a later substring hit.
      var first = null;
      for (var i = 0; i < window.MWSEARCH.length; i++) {
        var e = window.MWSEARCH[i];
        var t = e.t.toLowerCase();
        if (t === q) return root + e.u;
        if (first === null && t.indexOf(q) !== -1) first = root + e.u;
      }
      return first;
    }
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      while (results.firstChild) results.removeChild(results.firstChild);
      if (q.length < 2) { results.hidden = true; return; }
      var shown = 0;
      for (var i = 0; i < window.MWSEARCH.length && shown < 20; i++) {
        var e = window.MWSEARCH[i];
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
      var href = bestMatch(q);
      if (href !== null) window.location.assign(href);
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

  // Consent/privacy banner: shown by default (no-JS friendly); dismiss remembers
  // via localStorage (no cookies). TT-safe: hidden attribute + classList only.
  function initConsentBanner() {
    var banner = document.querySelector(".consent-banner");
    if (!banner) return;
    try {
      if (localStorage.getItem(LS_LEGAL_ACK) === "1") { banner.hidden = true; return; }
    } catch (err) {}
    var btn = banner.querySelector("[data-consent-dismiss]");
    if (btn) btn.addEventListener("click", function () {
      banner.hidden = true;
      try { localStorage.setItem(LS_LEGAL_ACK, "1"); } catch (err) {}
      remeasureBottomStack();
    });
  }

  // Staging-server notice: shown by default on --stage builds; dismiss remembers via
  // localStorage (no cookies), like the consent banner. TT-safe (hidden attribute only).
  function initStageBanner() {
    var banner = document.querySelector(".stage-banner");
    if (!banner) return;
    try {
      if (localStorage.getItem(LS_STAGE) === "1") { banner.hidden = true; return; }
    } catch (err) {}
    var btn = banner.querySelector("[data-stage-dismiss]");
    if (btn) btn.addEventListener("click", function () {
      banner.hidden = true;
      try { localStorage.setItem(LS_STAGE, "1"); } catch (err) {}
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
      try { localStorage.setItem(LS_FLYIN, String(now)); } catch (err) {}
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
          // cloneNode drops event listeners, so a cloned gallery thumb would keep the
          // glb-thumb affordance (pointer cursor + role=button) with no working lightbox.
          // Strip it: the expanded table is a read view, no lightbox needed.
          var dead = clone.querySelectorAll(".glb-thumb");
          for (var d = 0; d < dead.length; d++) {
            dead[d].classList.remove("glb-thumb");
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
  // link to see the target's title + summary from a prebuilt index (window.MWPREVIEWS;
  // CSP connect-src 'none' forbids an on-hover fetch). JS-only enhancement; native
  // title= tooltips still work with JS off. TT-safe DOM; positioned via el.style
  // (CSSOM, not an inline style= attribute, so allowed under style-src 'self').
  function initHovercards() {
    var content = document.querySelector(".wiki-content");
    if (!content) return;
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
      var idx = window.MWPREVIEWS;
      if (!idx) return null;
      var href = a.getAttribute("href") || "";
      // Only internal (relative) links have previews -- skip absolute/scheme and
      // protocol-relative links so an EXTERNAL url whose path happens to match an
      // index key never shows a spoofed card.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf("//") === 0) return null;
      // Key is ROOT-RELATIVE ("wiki/Foo/", the MWPREVIEWS key form). Resolve the
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
    function onEnter(e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a || !content.contains(a)) return;
      var nodes = null;
      if (a.closest("sup.reference")) nodes = refNodes(a);
      else if (a.getAttribute("href") && a.getAttribute("href").indexOf("#") !== 0) nodes = pageNodes(a);
      if (!nodes) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(function () {
        fill(nodes);
        card.hidden = false;
        place(a);
      }, 200);
    }
    content.addEventListener("mouseover", onEnter);
    content.addEventListener("mouseout", function () { clearTimeout(showTimer); hideSoon(); });
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
          if (!img || img.closest("a")) continue;  // link= opt-out: its own <a> navigates
          var textEl = boxes[b].querySelector(".gallerytext");
          var cap = (textEl && textEl.textContent.trim()) || img.getAttribute("alt") || "";
          (function (idx, imgEl) {
            imgEl.classList.add("glb-thumb");  // CSS cursor affordance
            imgEl.setAttribute("tabindex", "0");   // keyboard-reachable
            imgEl.setAttribute("role", "button");
            imgEl.addEventListener("click", function (e) { e.preventDefault(); openAt(idx); });
            imgEl.addEventListener("keydown", function (e) {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAt(idx); }
            });
          })(items.length, img);
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

  ready(function () {
    initDarkMode();
    initCopyButtons();
    initDataCopy();
    initPagePrint();
    initExpandCollapseAll();
    initTabs();
    window.addEventListener("hashchange", syncTabsFromHash);
    initNavToggle();
    initToolsToggle();
    initBackToTop();
    initSearch();
    initConsentBanner();
    initStageBanner();
    initBottomStackSpacer();
    initSitenotice();
    initFlyin();
    var modals = initModals();
    initDownloadModal(modals);
    initTableExpand(modals);
    initGalleryLightbox(modals);
    initWideTableScroll();
    initHovercards();
    initStorageViewer();
  });
})();
