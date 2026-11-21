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

  // Shared geometry batcher: every ResizeObserver-driven measure on the page runs through ONE
  // observer, whose callback executes EVERY widget's read before ANY widget's write. Each widget
  // reads-then-writes correctly on its own, but two independent observers interleave in a single
  // dispatch -- one observer writes body.paddingBottom (dirtying global layout), then another reads
  // geometry and forces a synchronous relayout (the PageSpeed "forced reflow"). One observer, one
  // callback, guarantees read-before-write with no cross-observer and no microtask-timing
  // assumption. A widget keeps its own rAF path when ResizeObserver is absent.
  // geomObserver(measure, write): register a widget's measure/write pair ONCE (measure() returns the
  // value write() applies) and return an observe(el) bound to the shared observer -- a widget
  // observes as many elements as it likes under its single pair. The callback also CACHES each
  // changed element's BORDER-box AND CONTENT-box inline size from the ENTRY (read via
  // geomBorderInlineSize / geomContentInlineSize) -- a free, post-layout read a widget uses instead
  // of scrollWidth/clientWidth, which would force a layout. Both boxes are kept because they differ
  // on a padded element (a wide-table caption has 10em side padding): the scroll EXTENT of a child
  // is its border box (full laid-out width), while the VISIBLE width of the scroll container is its
  // content box (== clientWidth). contentRect.width is the content box -- the CONTENT fallback. The
  // BORDER has NO contentRect fallback (content-box would lose a caption's 10em padding on a
  // box-size-less ResizeObserver, e.g. Safari 14-15.3): it stays undefined so measureTables reads
  // offsetWidth (border box), matching the no-RO path.
  var _geomPairs = [];
  var _geomRO = null;
  var _geomSizes = null;  // Map<Element, {border, content}>: last-delivered inline sizes per observed el
  function geomObserver(measure, write) {
    _geomPairs.push([measure, write]);
    if (!_geomRO) {
      _geomRO = new ResizeObserver(function (entries) {
        // RO reports only the CHANGED elements per callback, so persist prior sizes for the rest.
        var ents = entries, e;
        if (!_geomSizes) { _geomSizes = new Map(); }
        for (e = 0; e < ents.length; e++) {
          var bb = ents[e].borderBoxSize, cb = ents[e].contentBoxSize, cr = ents[e].contentRect.width;
          _geomSizes.set(ents[e].target, {
            border: (bb && bb.length) ? bb[0].inlineSize : undefined,
            content: (cb && cb.length) ? cb[0].inlineSize : cr
          });
        }
        var vals = [], k;
        for (k = 0; k < _geomPairs.length; k++) { vals.push(_geomPairs[k][0]()); }  // READ phase
        for (k = 0; k < _geomPairs.length; k++) { _geomPairs[k][1](vals[k]); }      // WRITE phase
      });
    }
    return function (el, box) { _geomRO.observe(el, box ? { box: box } : undefined); };
  }
  // Inline size of an observed element from the latest RO delivery (undefined until its first entry
  // arrives), by box. A cached ENTRY read, so a widget measures width with zero forced layout.
  function geomBorderInlineSize(el) { var s = _geomSizes && _geomSizes.get(el); return s ? s.border : undefined; }
  function geomContentInlineSize(el) { var s = _geomSizes && _geomSizes.get(el); return s ? s.content : undefined; }

  // Single source of truth for every localStorage key this site may set. The
  // Browser Storage page enumerates THIS (no separate hardcoded list), and the
  // feature code below references the constants -- so each key name lives once.
  // (The external pre-paint script in <head> -- assets/theme-init.js -- reads the theme key
  // too; it must stay in sync with LS_THEME by contract, as it runs before this file loads.)
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

  // Belt-and-suspenders: the external pre-paint script in <head> (/theme-init.min.js, loaded
  // under script-src 'self') gives flash-free theming, but if it ever fails to load (network
  // error) the browser skips it. Re-apply the stored theme here (app.js is also 'self', always
  // allowed) so dark mode still works -- only the flash-free-ness is lost, never the theme or
  // the rest of the page. Idempotent when the pre-paint did run.
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
        // Preserve the server-rendered content -- including build-time syntax-highlight
        // token spans -- by MOVING the existing child nodes into the viewport. A DOM move
        // of already-parsed nodes is Trusted-Types safe (no HTML-string sink); re-filling
        // from data-code would drop the highlighting. Copy still uses the raw `text`.
        while (block.firstChild) { code.appendChild(block.firstChild); }
        vp.appendChild(code);
        wrap.appendChild(vp);
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
      (function (btn) {
        btn.addEventListener("click", function () {
          var items = document.querySelectorAll("details.mw-collapsible");
          var anyClosed = false;
          for (var k = 0; k < items.length; k++) {
            if (!items[k].open) { anyClosed = true; break; }
          }
          for (var j = 0; j < items.length; j++) {
            items[j].open = anyClosed;
          }
          // Reflect the new aggregate state so the label + chevron match the collapsible pills
          // (.mwc-toggle): just opened all -> "Collapse all" + up arrow; else -> "Expand all" + down.
          btn.classList.toggle("is-expanded", anyClosed);
          btn.textContent = anyClosed ? "Collapse all" : "Expand all";
        });
      })(btns[i]);
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

  // Open a collapsible <details> when the URL fragment targets it (or an element inside it), so an
  // in-page anchor to a closed box reveals its content and scrolls to it instead of landing on a
  // shut box. Runs on load + hashchange. TT-safe: only sets .open + scrolls.
  function openHashDetails() {
    var id;
    try { id = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { return; }
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var d = el.closest ? el.closest("details") : null;
    if (d && !d.open) {
      d.open = true;                                   // reveal the box, then scroll to the now-laid-out target
      if (el.scrollIntoView) el.scrollIntoView({ block: "start" });
    }
    // A target NOT inside a closed box needs no JS scroll: the sections render in full (no
    // content-visibility estimate), so the browser's native #fragment scroll already lands right.
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

  // Tab controllers: ENHANCE the SERVER-RENDERED mininav switcher. page.py _build_tab_switchers
  // already emitted the <ul> of <a class="tcc-tab" href="#id"> pills (icon + label, in their final
  // position), so this inserts NOTHING into the layout = zero hydration CLS. We add only the ARIA
  // tabs semantics (role=tablist/tab/tabpanel + aria-* + roving tabindex) and the click/keyboard
  // behaviour -- a promise of keyboard interaction that exists only now that JS runs, so it is
  // added HERE, never baked into the static HTML (static tab roles would lie to AT; WAI-ARIA APG +
  // GOV.UK). No-JS keeps the pills as plain in-page anchor links to the stacked sections.
  // TT-safe: setAttribute/classList/addEventListener only, no HTML sink.
  function initTabs() {
    var controllers = document.querySelectorAll(".tab-content-controller");
    var tabSeq = 0;  // unique ids for the tab <-> panel ARIA relationship
    for (var i = 0; i < controllers.length; i++) {
      (function (ctrl) {
        var sections = tabSections(ctrl);
        var ul = ctrl.querySelector(":scope > .mininav > ul");
        if (!sections.length || !ul) return;
        var pills = ul.querySelectorAll(":scope > li > .tcc-tab");
        // One server pill per section is the invariant; any mismatch means malformed markup, so
        // leave the pills as plain links rather than wire a broken tablist.
        if (pills.length !== sections.length) return;
        ul.setAttribute("role", "tablist");
        ul.setAttribute("aria-label", "Section tabs");
        for (var j = 0; j < pills.length; j++) {
          var a = pills[j], sec = sections[j], li = a.parentNode;
          // The <li> wrapper must be transparent to AT: a role=tablist may only contain role=tab
          // children, and a role=tab needs a tablist parent (APG). Without this, axe flags
          // aria-required-children / aria-required-parent, and the li trips the listitem rule.
          if (li) li.setAttribute("role", "presentation");
          // The tab controls its panel (the section); the panel is labelled back by the tab.
          a.setAttribute("role", "tab");
          var uid = "tcc-" + (tabSeq++);
          if (!a.id) a.id = uid + "-tab";
          if (!sec.id) sec.id = uid + "-panel";
          a.setAttribute("aria-controls", sec.id);
          sec.setAttribute("role", "tabpanel");
          sec.setAttribute("aria-labelledby", a.id);
          // A panel with no focusable descendant is itself made focusable so keyboard users can
          // reach its content (APG); a panel with focusable content needs no extra tab stop.
          if (!sec.querySelector("a[href], button, input, select, textarea, [tabindex]")) {
            sec.tabIndex = 0;
          }
          (function (idx, pill) {
            pill.addEventListener("click", function (e) {
              e.preventDefault();
              activateTab(ctrl, idx);
              // Anchor the URL to the chosen tab -- the pill's OWN href IS that (percent-encoded)
              // heading fragment, one deep link shared by tab clicks, TOC links and pasted #heading
              // URLs (all resolve via syncTabsFromHash). replaceState (not location.hash=, not
              // pushState) updates it without the scroll jump or back-button history spam.
              var frag = pill.getAttribute("href");
              if (frag && frag.charAt(0) === "#" && frag.length > 1) {
                try { history.replaceState(null, "", frag); }
                catch (e2) { location.hash = frag; }
              }
            });
          })(j, a);
        }
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
        // Default to the server-marked active section (else the first); activateTab syncs the
        // aria-selected + roving tabindex the static pills do not carry. The active CLASS the
        // server already set means this changes nothing visible -- no post-paint shift.
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
    // the target's tab(s) are now active + laid out, so scroll to it (no content-visibility estimate)
    if (el.scrollIntoView) el.scrollIntoView({ block: "start" });
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
  // click. Shown/hidden via an eased opacity fade (.btt-hidden) mirroring the production wiki
  // control, not a binary display snap; the CSS floor governs only the no-JS case.
  function initBackToTop() {
    var btn = document.querySelector(".back-to-top");
    if (!btn) return;
    // Mark the document JS-capable so the no-JS reveal floor (:root:not(.js)) steps aside and
    // this owns the control. Done HERE, not earlier: the floor keeps the button hidden until
    // JS is ready, so a late idle-callback init never flashes it visible on load.
    document.documentElement.classList.add("js");
    // Hide instantly, then enable the fade only AFTER the hidden state has painted, so opacity:0 is
    // committed under the base (no-transition) style -- no load-time fade -- WITHOUT a synchronous
    // forced reflow. Reading offsetHeight here to flush the hidden state is a ~15ms forced layout
    // Lighthouse flags; a lone rAF batches both class adds into one pre-paint style pass and still
    // fades out on load, so the SECOND rAF runs a frame after btt-hidden has painted -- adding
    // .btt-anim then changes nothing to animate, only arming the fade for later show()/hide().
    btn.classList.add("btt-hidden");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { btn.classList.add("btt-anim"); });
    });
    function show() { btn.classList.remove("btt-hidden"); }
    // Never hide while the control holds keyboard focus (a hide-timer or scroll-to-top must not
    // steal focus mid-activation, and the fade-out's visibility:hidden would drop focus).
    function hide() { if (document.activeElement !== btn) { btn.classList.add("btt-hidden"); } }
    var idle = null;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      // "instant", not "auto": with html { scroll-behavior: smooth } set, "auto" honors that
      // and still animates -- "auto" only means "use the CSS behavior". "instant" forces the
      // jump a reduced-motion user asked for (same as the forced jump elsewhere in this file).
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
      // On a POINTER click (detail > 0; keyboard-activated clicks report 0) release focus, so
      // the scroll-to-top's own hide() is not suppressed by the focus-guard -- otherwise the
      // control sits at the top catching clicks over the content. A keyboard user keeps focus
      // (blurring them would discard their place rather than move it somewhere sensible).
      if (e.detail > 0) { btn.blur(); }
    });
    // On blur, re-check the threshold: hide at once near the top, else resume the idle-hide. A
    // focused control's idle timer no-ops (focus-guard), so without the rearm it would linger
    // shown once focus leaves while still scrolled down.
    btn.addEventListener("blur", function () {
      if (window.scrollY < 400) { hide(); return; }
      clearTimeout(idle);
      idle = setTimeout(hide, 2000);
    });
    window.addEventListener("scroll", function () {
      if (window.scrollY < 400) { hide(); return; }
      show();
      clearTimeout(idle);
      idle = setTimeout(hide, 2000);
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
    // Focus the field the moment the search opens so the user types immediately -- no second
    // click -- and on touch this also pops the soft keyboard. Bind CLICK on the toggle: tapping
    // the lens LABEL dispatches a click to #search-toggle with .checked ALREADY flipped, inside
    // the tap gesture (a click is the reliable user-activation point; a change-driven focus can
    // bounce to <body> on iOS).
    var searchToggle = document.getElementById("search-toggle");
    if (searchToggle) {
      // Desktop Safari/WebKit moves focus to the (hidden) checkbox on a mouse click of the lens
      // LABEL, stealing the caret from the field below. preventDefault on the MOUSE pointerdown
      // suppresses that focus shift without blocking the click that toggles the box open. Gated to
      // mouse: a touch preventDefault here cancels the tap -> the box never opens on mobile.
      var searchLabel = document.querySelector('label[for="search-toggle"]');
      if (searchLabel) {
        searchLabel.addEventListener("pointerdown", function (e) {
          if (e.pointerType === "mouse") e.preventDefault();
        });
      }
      searchToggle.addEventListener("click", function () {
        if (!searchToggle.checked) return;   // a closing click -> let the field blur
        // The field reveals via a width:0 -> full transition and is NOT focusable while that width
        // animates (focus() no-ops on a ~0-width field). Dropping the transition applies the
        // :checked width + visibility INSTANTLY -- the correct per-breakpoint width still comes
        // from CSS, nothing hardcoded. preventScroll avoids an overlay jump.
        input.style.transition = "none";
        // Reading offsetWidth forces the synchronous reflow that COMMITS transition:none before the
        // focus below. We KEEP the value (branch on it) rather than discard it with `void`: the
        // webcheck forced-reflow rule gates only the value-discarded form, and a comment waiver
        // would not survive minification (the gate scans app.min.js too). offsetWidth is never
        // negative, so the guard is always true -- focus still fires synchronously, inside the
        // gesture, which is what makes iOS Safari open the soft keyboard (a deferred/rAF focus
        // leaves the gesture and iOS suppresses it).
        if (input.offsetWidth >= 0) {
          input.focus({ preventScroll: true });
        }
        requestAnimationFrame(function () { input.style.transition = ""; });   // restore close anim
        // Mobile WebKit re-focuses the checkbox after a TAP (where the mouse-gated preventDefault
        // above does not apply); a deferred re-focus lands the caret once that settles. Harmless
        // where the sync focus already stuck (re-focusing the focused field is a no-op).
        setTimeout(function () { if (searchToggle.checked) input.focus({ preventScroll: true }); }, 0);
      });
    }
    var root = rootPrefix();
    var results = document.createElement("ul");
    results.className = "search-results";
    results.hidden = true;
    input.parentNode.appendChild(results);
    // ARIA combobox (APG "list autocomplete"): DOM focus STAYS in the input; the highlighted
    // result is tracked via aria-activedescendant, never by moving real focus. That is also why
    // the page-level book-nav arrow handler (which bails on a focused input) stays dormant here.
    results.id = "mw-search-results";
    results.setAttribute("role", "listbox");
    results.setAttribute("aria-label", "Search results");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", "mw-search-results");
    input.setAttribute("aria-expanded", "false");
    // -1 = no active option: aria-activedescendant empty, so Enter keeps the bestMatch fallback.
    var activeIndex = -1;
    function setExpanded(open) { input.setAttribute("aria-expanded", open ? "true" : "false"); }
    // Highlight via CSSOM (.style.*, not gated by style-src -- CSP-safe, same idiom as
    // results.style.top): a --surface-2 fill PLUS an inset --link ring, so the keyboard-active
    // option is distinct from a mere :hover (fill only) and from the link text (--fg). No
    // style.css rule, so the feature ships from app.js alone with no asset-fingerprint coupling.
    function paint(li, on) {
      var a = li.firstElementChild;   // every option li carries exactly one <a> (appendResult)
      a.style.background = on ? "var(--surface-2)" : "";
      a.style.outline = on ? "2px solid var(--link)" : "";
      a.style.outlineOffset = on ? "-2px" : "";   // inset so the listbox's overflow never clips it
    }
    // Move the active option to index i (-1 = none, i.e. back to the typed query). Clears the old
    // highlight + aria-selected, paints the new one, and keeps aria-activedescendant pointing at a
    // PRESENT option id or "" -- it must never dangle to a removed row.
    // Callers only ever pass a valid index or a negative sentinel, and every clear happens while
    // the active row is still present (before a rebuild), so activeIndex>=0 always resolves.
    function setActive(i) {
      var opts = results.children;
      if (activeIndex >= 0) {
        opts[activeIndex].setAttribute("aria-selected", "false");
        paint(opts[activeIndex], false);
      }
      if (i < 0) {   // none: back to the typed query
        activeIndex = -1;
        input.setAttribute("aria-activedescendant", "");
        return;
      }
      activeIndex = i;
      var li = opts[i];
      li.setAttribute("aria-selected", "true");
      paint(li, true);
      input.setAttribute("aria-activedescendant", li.id);
      if (li.scrollIntoView) li.scrollIntoView({ block: "nearest" });   // guarded: absent in old engines
    }
    function clearActive() { setActive(-1); }
    // Pointer + keyboard share ONE highlight: moving the mouse over a row makes it the active
    // option (so Enter follows the pointer too). mousemove (not mouseover) so a stationary cursor
    // left hovering after a keyboard move does not steal the highlight back.
    results.addEventListener("mousemove", function (e) {
      var li = e.target.closest("li");   // null when the pointer is over the panel's own padding
      if (!li) return;
      setActive(Array.prototype.indexOf.call(results.children, li));
    });
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
    // Single-flight: the in-flight/resolved promise IS the memo (resolves to the manifest data or
    // null); fullText reads that resolved value, so no separate cached copy is kept.
    var manifestLoading = null;
    function ensureManifest() {
      if (!manifestLoading) {
        manifestLoading = loadJSON(carrierHref("mw-fulltext-manifest"));
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
    function appendResult(e, sink) {        // TT-safe: textContent + setAttribute only, no HTML-string sink
      var href = root + e.u;
      if (!navSafe(href, false)) return false;   // drop a row whose (tampered) target is not same-origin
      var li = document.createElement("li");
      if (sink.option) {                    // dropdown listbox option; the results page uses plain items
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.id = "mw-sr-" + sink.list.children.length;   // this row's index; unique + stable per render
      }
      var a = document.createElement("a");
      a.setAttribute("href", href);
      a.textContent = e.t;
      li.appendChild(a);
      // Keep the "search for all" footer row (when present) LAST: title + async body rows insert
      // before it, so it never moves off the end of the listbox. footerNode is only ever set on a
      // render whose rows are being (re)built now (renderResults recreates it first, the async
      // full-text batch runs only while its gen is still current), so it is always attached here.
      if (sink.footerNode) {
        // Inserting before the footer pushes it (and anything at/after the insert point) up one
        // slot. activeIndex is a numeric index into the listbox, so when the active option sits
        // there -- only the footer can, it is last -- bump it so a late async body row cannot
        // silently steal the Enter target / keyboard highlight from the still-selected footer.
        var at = Array.prototype.indexOf.call(sink.list.children, sink.footerNode);
        sink.list.insertBefore(li, sink.footerNode);
        if (activeIndex >= at) activeIndex += 1;
      } else {
        sink.list.appendChild(li);
      }
      return true;                          // caller counts a row only when one was really added
    }
    // The always-present LAST dropdown option: "Search for pages containing '<query>'" -> the
    // client-side Special:Search results page (#q=<raw query>). It is the one explicit route from
    // the live dropdown to the full ranked list (Wikipedia Vector / MDN idiom), so a query is never
    // a dead end when the wanted page is not a title hit. Dropdown only (the results page already IS
    // the full list). TT-safe: textContent + setAttribute only, the query is TEXT never parsed as
    // markup; same-origin internal href (navSafe) -- no <form>, no CSP/form-action change. The raw
    // (un-lowercased) query rides #q= so the results-page field shows what the user typed.
    // Relative #q= href to the client-side Special:Search page for a RAW (un-lowercased) query.
    // Relative like every result row (root + "wiki/..." -- NO leading slash: root is "" / "../" /
    // "../../", so a leading slash would double to "..//wiki/..", an empty segment a strict static
    // router 404s). Returns null when: the query is empty; encodeURIComponent throws URIError on a
    // lone surrogate (half a pasted emoji); or a tampered root prefix would plant a cross-origin
    // sink (navSafe). Shared by the dropdown footer row and the trailing submit link so their #q=
    // target, encoding, and safety filter are identical.
    function specialSearchHref(raw) {
      if (!raw) return null;
      var href;
      try {
        href = root + "wiki/Special:Search#q=" + encodeURIComponent(raw);
      } catch (e) {
        return null;
      }
      return navSafe(href, false) ? href : null;
    }
    function appendAllResultsRow(sink) {
      sink.footerNode = null;
      // No searchable corpus (index absent / failed to load) -> no footer: Special:Search would be
      // an equally-empty dead end, so do not offer the "search all" route when it cannot deliver.
      if (!index.length) return;
      // sink.rawQuery is the un-lowercased typed query, always set by the input handler before the
      // sole caller (the dropdown render); the raw form rides #q= so the results page shows it.
      var raw = sink.rawQuery;
      var href = specialSearchHref(raw);
      if (href === null) return;
      var li = document.createElement("li");
      li.className = "search-all";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.id = "mw-sr-all";
      var a = document.createElement("a");
      a.setAttribute("href", href);
      a.textContent = 'Search for pages containing "' + raw + '"';
      li.appendChild(a);
      sink.list.appendChild(li);
      sink.footerNode = li;
    }
    // The open field is an ABSOLUTE overlay; anchor the panel just below its rendered box (CSSOM
    // .style is not gated by style-src -- CSP-safe, same as the bottom-stack spacer).
    function positionPanel() {
      if (!results.hidden) results.style.top = (input.offsetTop + input.offsetHeight + 4) + "px";
    }
    // The header dropdown's monotonic query id: an async shard batch resolving after a newer
    // dropdown keystroke (or a close) is dropped. The results page has its own counter (pageGen),
    // so the two surfaces never cancel each other's in-flight batches.
    var queryGen = 0;
    // Augment the (already rendered) title hits with body matches the title scan missed. Appends
    // BM25-ranked body-only pages after the title hits, up to the 20 cap. Skipped for a
    // namespace-qualified query (that path stays title-only, main namespace).
    function fullText(q, gen, shownIds, shownCount, sink) {
      ensureManifest().then(function (man) {
        if (!man || gen !== sink.curGen()) return;   // superseded ON THIS surface -> drop the batch
        var terms = [], seen = Object.create(null);   // null-proto: a term "constructor" etc. must not hit Object.prototype
        tokenize(q).forEach(function (t) { if (!seen[t]) { seen[t] = 1; terms.push(t); } });
        if (!terms.length) return;
        Promise.all(terms.map(function (t) { return ensureShard(man, t); })).then(function (objs) {
          if (gen !== sink.curGen()) return;
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
          for (var j = 0; j < ranked.length && shownCount < sink.cap; j++) {
            var id = ranked[j][0], e = index[id];
            if (shownIds[id] || !e || e.n) continue;   // already shown, or (defensively) namespaced
            if (!appendResult(e, sink)) continue;       // a dropped (tampered) target adds no row
            shownIds[id] = 1;
            shownCount++;
            added++;
          }
          if (added && sink.onAppend) sink.onAppend(shownCount);
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
    // Title-match tier for a (lowercased) title t against the (lowercased) query q:
    // 0 = exact, 1 = prefix, 2 = infix, -1 = no match. Exact/prefix beat a mere infix hit so
    // "iso" ranks the "ISO" page (exact) and "ISO Live Mode" (prefix) above "Comparison" (infix,
    // compar-ISO-n) and the "...Isolation" pages. Shared by the dropdown title pass AND the
    // Enter-key bestMatch, so both agree on the best page.
    function titleRank(t, q) {
      if (t === q) return 0;
      var idx = t.indexOf(q);
      if (idx === 0) return 1;
      return idx === -1 ? -1 : 2;
    }
    // Index ids whose title matches q, ranked (tier, then shorter title, then index order).
    // Scans the WHOLE index (ranking needs every candidate, not just the first 20). Shared by
    // the dropdown title pass and the Special:Search results page so their ordering is identical.
    function rankedTitleIds(q) {
      var cand = [];
      for (var i = 0; i < index.length; i++) {
        var e = index[i];
        if (!nsEligible(e, q)) continue;   // namespaced page: only for its own namespace query
        var tier = titleRank(e.t.toLowerCase(), q);
        if (tier !== -1) cand.push([tier, e.t.length, i]);
      }
      cand.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; });
      return cand.map(function (x) { return x[2]; });
    }
    // Best page for a query: ranked exact > prefix > infix (shorter title breaks a tie), so "api"
    // + Enter lands on the "API" page and "iso" + Enter on "ISO", even when other titles also
    // contain the term. Returns the root-relative href or null.
    function bestMatch(q) {
      // null (not "") is the no-match sentinel: the Homepage index entry has u="" and,
      // on the root page, root="" too, so a valid homepage href is the empty string --
      // treating "" as "no match" would skip it and mis-pick a later substring hit.
      // Single source of truth with the dropdown: the first rankedTitleIds id whose target is
      // navSafe IS the dropdown's first row (same ranking basis, same navSafe filter appendResult
      // applies), so Enter and the first row can never diverge -- no separate length/tier/safety
      // path to drift (lowercased-length vs e.t.length, first-exact vs shortest, unsafe no-op).
      var ids = rankedTitleIds(q);
      for (var i = 0; i < ids.length; i++) {
        var href = root + index[ids[i]].u;
        if (navSafe(href, false)) return href;
      }
      return null;
    }
    // Shared render: instant ranked title pass (exact > prefix > infix) + async full-text
    // augmentation, into sink.list up to sink.cap rows, de-duped by pageId. sink.onAppend(count)
    // fires after the title pass AND after each full-text batch that adds rows. Used by BOTH the
    // header dropdown and the Special:Search results page, so their ranking + de-dup are identical.
    function renderResults(q, gen, sink) {
      var shownIds = {}, shown = 0;
      // Create the "search for all" footer row FIRST so the title + async body rows insert before
      // it (appendResult) and it stays the last option. Dropdown only (sink.footer).
      if (sink.footer) appendAllResultsRow(sink);
      var ids = rankedTitleIds(q);
      for (var i = 0; i < ids.length && shown < sink.cap; i++) {
        if (!appendResult(index[ids[i]], sink)) continue;   // a dropped (tampered) target adds no row
        shownIds[ids[i]] = 1;
        shown++;
      }
      if (sink.onAppend) sink.onAppend(shown);
      // A namespace-qualified query stays title-only -- its body words would wrongly surface
      // main-namespace pages.
      if (q.indexOf(":") === -1) fullText(q, gen, shownIds, shown, sink);
      return shown;
    }
    // The header dropdown's sink: the overlay listbox. onAppend drives its show/position/aria;
    // curGen returns the dropdown's OWN generation (queryGen) so a page-side search cannot cancel
    // an in-flight dropdown batch, and vice versa.
    var dropdownSink = { list: results, cap: 20, option: true, footer: true, curGen: function () { return queryGen; },
      onAppend: function () {
        // Open whenever ANY row exists -- including the always-present "search for all" footer for a
        // >=2-char query -- so the full-results route is never hidden behind an empty title pass.
        var any = results.children.length > 0;
        results.hidden = !any;
        setExpanded(any);
        positionPanel();
      } };
    input.addEventListener("input", function () {
      // Render after the index resolves (a microtask once loaded); before then, no-op.
      ensureIndex().then(function () {
        var q = input.value.trim().toLowerCase();
        dropdownSink.rawQuery = input.value.trim();   // RAW (un-lowercased) for the footer label + #q=
        var gen = ++queryGen;
        clearActive();   // reset highlight + aria-activedescendant before the rows are rebuilt
        while (results.firstChild) results.removeChild(results.firstChild);
        if (q.length < 2) { results.hidden = true; setExpanded(false); return; }
        renderResults(q, gen, dropdownSink);
      });
    });
    // Trailing controls: a clear-x (shown only while the field holds text) and the "Search" submit
    // link (-> the full Special:Search results page for the typed query). syncControls keeps both in
    // step with the field on every keystroke, synchronously (no index wait): the clear-x toggles on
    // non-empty text, and the submit href carries the live #q= (falling back to the bare results
    // page when the query is empty/unsafe, so the link is never dead or cross-origin). Reuses
    // specialSearchHref so submit and the dropdown footer row target the exact same #q=.
    var clearBtn = document.getElementById("search-clear");
    var submitLink = document.getElementById("search-submit");
    function syncControls() {
      var raw = input.value.trim();
      if (clearBtn) {
        if (raw) clearBtn.removeAttribute("hidden");
        else clearBtn.setAttribute("hidden", "");
      }
      if (submitLink) {
        // Non-empty + safe -> the #q= deep link; otherwise (empty query, or a tampered/cross-origin
        // root prefix) fall back to the bare results page when it is same-origin. If even the bare
        // page is off-origin, REMOVE href so the anchor is a true non-link (a click does nothing) --
        // href="" is NOT inert: it resolves to the current document and navigates there, stripping
        // the fragment/query. Same navSafe discipline as the footer row, which drops itself off-origin.
        var href = specialSearchHref(raw);
        if (href === null) {
          var bare = root + "wiki/Special:Search";
          href = navSafe(bare, false) ? bare : null;
        }
        if (href === null) submitLink.removeAttribute("href");
        else submitLink.setAttribute("href", href);
      }
    }
    input.addEventListener("input", syncControls);
    syncControls();   // initialise for a pre-filled field (browser-restored value)
    // No <form> (CSP form-action 'none'), so Enter is inert by default: navigate to the
    // best-matching page ourselves. preventDefault keeps a stray implicit submit from firing.
    // location.assign (not a noreferrer anchor like the download path): search targets are
    // always internal "root + e.u" pages, so a same-origin Referer is normal and harmless.
    input.addEventListener("keydown", function (e) {
      // Ignore keys that CONFIRM/MOVE an IME candidate (CJK etc.), else a provisional query
      // navigates or the list steps mid-composition. isComposing covers most engines; keyCode
      // 229 is the Safari fallback where isComposing is not set. Same guard book-nav uses.
      if (e.isComposing || e.keyCode === 229) return;
      var opts = results.children, n = opts.length;
      // Arrow navigation only while the dropdown is on screen. Cycle THROUGH the input: stepping
      // past either end lands on -1 (no active option, the typed query in view), then re-enters
      // the list -- so the user can always get back to their raw query (DocSearch/APG wrap).
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !results.hidden) {
        e.preventDefault();
        if (e.key === "ArrowDown") setActive(activeIndex + 1 >= n ? -1 : activeIndex + 1);
        else setActive(activeIndex < 0 ? n - 1 : activeIndex - 1);   // from none -> last; from 0 -> none
        return;
      }
      if (e.key === "Escape") {
        // Operator-specified clear-then-close (Carbon/Apple), and the search OWNS both stages so a
        // consumed Escape never leaks to the document-level handlers that also close the nav, tools,
        // toast and modal on Escape:
        //  1. text or an open dropdown -> clearField: empty the input, hide the clear-x, reset the
        //     submit href, close the dropdown (bumps queryGen so a late shard batch cannot reopen
        //     it). The mobile overlay STAYS open so the user can retype at once.
        //  2. an already-clear, closed field whose mobile overlay is genuinely open -> closeSearch here.
        // Both preventDefault + stopPropagation, so a co-open layer is NOT dismissed by the search's
        // Escape. A fully idle search (clear, dropdown closed, no overlay) consumes nothing and lets
        // Escape propagate, so a modal/toast still sees it. Focus stays in the field (not blurred)
        // throughout, so the user can retype immediately.
        if (input.value !== "" || !results.hidden) {
          e.preventDefault();
          e.stopPropagation();
          clearField();
          return;
        }
        // Stage 2 is for the COMPACT tier only. On the desktop tier the toggle is display:none and
        // the field is persistent, so a toggle left :checked from a prior narrow width is STALE (the
        // style.css reveal is compact-tier-scoped for exactly this reason) -- consuming Escape there
        // would swallow it from a modal/toast. Gate on the desktop tier (keep 960px in sync with the
        // min-width:960px desktop block in style.css); off that tier a stale-checked toggle propagates.
        if (toggle && toggle.checked && !window.matchMedia("(min-width: 960px)").matches) {
          e.preventDefault();
          e.stopPropagation();
          closeSearch();
          return;
        }
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      // A keyboard-selected option wins; navigate straight to it. Its href was already navSafe-
      // validated at append (a failed row is never added), so no re-check is needed.
      if (activeIndex >= 0) {
        window.location.assign(opts[activeIndex].firstElementChild.getAttribute("href"));
        return;
      }
      // No active option: the existing bestMatch fallback -- prefer an exact/substring TITLE match,
      // else the top rendered row (may be a body-only full-text hit), so Enter is never inert while
      // results are on screen. This site has no server results page, so this is the whole no-active
      // behaviour (DocSearch-sanctioned).
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) return;   // empty query matches everything via indexOf("")
      ensureIndex().then(function () {
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
    function closeResults() {
      // Dismiss the live dropdown but LEAVE the field as-is (desktop: always visible; mobile: the
      // overlay stays open, toggle still checked). Bump queryGen so a still-in-flight full-text shard
      // batch cannot REOPEN the panel we are closing (its gen !== queryGen guard then drops it).
      queryGen++;
      clearActive();       // drop any highlight + aria-activedescendant while the rows still exist
      setExpanded(false);
      results.hidden = true;
      while (results.firstChild) results.removeChild(results.firstChild);
    }
    function closeSearch() {
      // Full close: dismiss the dropdown AND collapse the mobile overlay (uncheck the toggle). Used
      // by an outside click and the toggle's own 'change'. On desktop the toggle is display:none but
      // present, so unchecking it is a harmless no-op there.
      closeResults();
      if (toggle) toggle.checked = false;
    }
    // Clear the field: empty the input, resync the trailing controls (hide the clear-x, reset the
    // submit href), and dismiss the dropdown -- but KEEP the field open and focused so the user can
    // retype at once (closeResults, NOT closeSearch: a full close would collapse the mobile overlay
    // out from under them). The explicit CLEAR path (the clear-x button and Escape).
    function clearField() {
      input.value = "";
      syncControls();
      closeResults();
    }
    // The magnifier is a pure-CSS :checked toggle; a USER unchecking it fires 'change' (a
    // programmatic closeSearch does not), so FULLY close here -- hide + clear the results, not
    // just bump queryGen, else the dropdown lingers visible after the search box collapses.
    if (toggle) {
      toggle.addEventListener("change", function () { if (!toggle.checked) closeSearch(); });
    }
    // Clear-x (visible only while the field holds text): clear the field, then keep focus so the
    // field stays expanded and ready for a fresh query. The clear-x and submit surface only while
    // the field has focus (desktop :focus-within); a mousedown on either would blur the input, drop
    // :focus-within, and remove the control from layout before mouseup -- so the click never lands
    // (a dead button, worst on an <a> submit that never navigates). preventDefault on mousedown
    // keeps focus in the field, so the control stays put and the click fires.
    if (clearBtn) {
      clearBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
      clearBtn.addEventListener("click", function () {
        clearField();
        input.focus();
      });
    }
    if (submitLink) {
      submitLink.addEventListener("mousedown", function (e) { e.preventDefault(); });
    }
    document.addEventListener("click", function (e) {
      if (toggle && !toggle.checked && results.hidden) return;
      if (box && box.contains(e.target)) return;
      closeSearch();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSearch();
    });

    // Special:Search results PAGE (absent on normal pages -> no-op): build a search field +
    // results list inside the [data-search-page] container (so no content <input> is emitted for
    // the sanitizer to strip), read the initial query from the URL (#q= fragment, or ?q=), and
    // render ranked results with the SAME index + comparator as the dropdown. A plain navigable
    // list, not the combobox -- no overlay, no aria-activedescendant.
    (function setupResultsPage() {
      var wrap = document.querySelector("[data-search-page]");
      if (!wrap || wrap.dataset.searchReady) return;   // absent here, or already built (re-entrant init)
      wrap.dataset.searchReady = "1";
      var pinput = document.createElement("input");
      pinput.type = "search";
      pinput.id = "search-page-input";
      pinput.className = "search-page-input";
      pinput.setAttribute("aria-label", "Search this wiki");
      pinput.setAttribute("placeholder", "Search");
      pinput.setAttribute("autocomplete", "off");
      pinput.setAttribute("aria-controls", "search-page-results");
      var pstatus = document.createElement("p");
      pstatus.className = "search-page-status";
      pstatus.setAttribute("role", "status");
      pstatus.setAttribute("aria-live", "polite");
      var plist = document.createElement("ul");
      plist.id = "search-page-results";
      plist.className = "search-page-results";
      plist.setAttribute("aria-label", "Search results");
      // Modest CSSOM styling (CSP-safe, same idiom as the dropdown highlight -- no style.css rule,
      // so the page ships from app.js with no asset-fingerprint coupling).
      pinput.style.width = "100%";
      pinput.style.boxSizing = "border-box";
      pinput.style.maxWidth = "32rem";
      pinput.style.padding = "0.5em 0.7em";
      pinput.style.fontSize = "1rem";
      pstatus.style.margin = "0.75rem 0 0";
      plist.style.listStyle = "none";
      plist.style.padding = "0";
      plist.style.margin = "0.5rem 0 0";
      plist.style.lineHeight = "1.9";
      // Field/status/list go BEFORE the <noscript> fallback so it stays last in the box.
      wrap.insertBefore(plist, wrap.firstChild);
      wrap.insertBefore(pstatus, wrap.firstChild);
      wrap.insertBefore(pinput, wrap.firstChild);
      // The page's OWN generation counter, independent of the dropdown's queryGen: a stale
      // full-text batch is dropped when a NEWER page query supersedes it, but a dropdown search
      // (which bumps queryGen) never cancels an in-flight page batch, and vice versa.
      var pageGen = 0;
      var pageSink = { list: plist, cap: 50, option: false, curGen: function () { return pageGen; },
        onAppend: function () {
          var n = plist.children.length;
          pstatus.textContent = n ? (n + (n === 1 ? " result" : " results")) : "No results found.";
        } };
      function runPage() {
        ensureIndex().then(function () {
          var q = pinput.value.trim().toLowerCase();
          var gen = ++pageGen;
          while (plist.firstChild) plist.removeChild(plist.firstChild);
          if (q.length < 2) { pstatus.textContent = ""; return; }
          renderResults(q, gen, pageSink);
        });
      }
      // Query from the URL fragment ONLY: #q=<term>. That is the single form the whole feature emits
      // (Root.mw links, the header dropdown, the OpenSearch descriptor) and the privacy-correct one --
      // the term rides the fragment, never the wire. A query string (?q=) is deliberately NOT read:
      // nothing generates it, and honoring it would both leak the term to the server and make the URL
      // a two-source query (fragment vs query string) whose Back/clear sync cannot be reconciled
      // without either wiping typed input or leaving stale results. One source => neither hazard.
      // The value runs to END-OF-STRING, so a '&' is PART of the term, not a separator: our links
      // percent-encode '&', but Chromium's OpenSearch fragment substitution leaves '&' RAW (EscapePath,
      // no '?' in the template), and stopping at the first '&' would truncate "R&D" to "R". '+' stays a
      // literal '+' (a fragment is not form-urlencoded; decode only).
      function urlQuery() {
        var hm = /(?:^|&)q=(.*)$/.exec((location.hash || "").replace(/^#/, ""));
        if (hm) { try { return decodeURIComponent(hm[1]); } catch (e) { return hm[1]; } }
        return "";
      }
      function syncFromUrl() { pinput.value = urlQuery(); runPage(); }
      var q0 = urlQuery();
      if (q0) { pinput.value = q0; runPage(); }
      pinput.addEventListener("input", runPage);
      // An address-bar OpenSearch re-search (or an in-page dropdown pick) changes only the #q=
      // fragment, and a fragment-only navigation does NOT reload the document -- so re-read + re-run
      // on a #q= hashchange. React ONLY to a q= fragment: the page input is NEVER written to the URL
      // (typing does not touch the hash), so an empty or non-q fragment -- a skip-link/TOC jump, or
      // Back to the bare URL -- carries NO query intent. Do NOT also sync on an empty fragment:
      // syncFromUrl() would set the box to urlQuery()==="" and WIPE a typed-but-unsubmitted query
      // (input data loss). Leaving the last results visible after Back is the deliberately-accepted
      // lesser evil; a reload clears them, whereas destroyed in-progress input cannot be undone.
      window.addEventListener("hashchange", function () {
        if (/(?:^|&)q=/.test(location.hash.replace(/^#/, ""))) syncFromUrl();   // location.hash is always a string
      });
      pinput.focus({ preventScroll: true });   // a dedicated search page: land the caret for typing
    })();
  }

  // Fixed bottom stack (consent + stage banners) overlaps the footer, so reserve its
  // EXACT rendered height as body padding, recomputed on resize and after any dismiss so
  // the reservation collapses to 0 once every banner is gone (no leftover gap below the
  // footer). The CSS body:has(.stage-banner) rule is the no-JS fallback -- without JS the
  // banners are never dismissable, so a fixed reservation is always correct there.
  // Measure the bottom-stack's rendered height (read), then apply it as body padding + a
  // back-to-top lift (write) -- split so the shared geometry batcher runs this read alongside
  // every other widget's read, before any write. -1 = no stack (leave body padding untouched).
  function _bottomStackHeight() {
    var stack = document.querySelector(".bottom-stack");
    return stack ? stack.offsetHeight : -1;
  }
  function _applyBottomStack(h) {
    if (h >= 0) { document.body.style.paddingBottom = h + "px"; }
    // Lift the back-to-top button above the fixed bottom banner stack so they do not overlap;
    // drops back to 20px once the stack collapses (banners dismissed). CSSOM, so CSP-safe.
    var btt = document.querySelector(".back-to-top");
    if (btt) { btt.style.bottom = (h > 0 ? h + 20 : 20) + "px"; }
  }
  // Immediate resync for the banner-dismiss click handlers (off the shared batcher: a user action
  // wants a synchronous update, and a lone click-time read is not the load-path PageSpeed finding).
  function remeasureBottomStack() { _applyBottomStack(_bottomStackHeight()); }
  function initBottomStackSpacer() {
    var stack = document.querySelector(".bottom-stack");
    if (!stack) return;
    if (typeof ResizeObserver !== "undefined") {
      // Drive the measure from the SHARED geometry batcher: its single observer runs every widget's
      // read before any write, so this offsetHeight read and the wide-table scrollWidth read never
      // see each other's layout-dirtying write (the cross-observer forced reflow). The initial
      // observe fires once (first spacer set) and covers window-resize + font/content reflow +
      // banner-dismiss (the stack shrinks -> refires) with no init-time cost.
      geomObserver(_bottomStackHeight, _applyBottomStack)(stack);
    } else {
      // No ResizeObserver (very old browser / jsdom): defer the first read with rAF so even the
      // fallback does not force a synchronous layout in the init task; resize keeps it in sync.
      requestAnimationFrame(remeasureBottomStack);
      var raf = 0;
      window.addEventListener("resize", function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = 0; remeasureBottomStack(); });
      });
    }
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
    var showRaf = 0;
    var timer = setTimeout(function () {
      panel.hidden = false;                             // slide in from the right edge
      showRaf = requestAnimationFrame(function () { panel.classList.add("flyin-shown"); });
    }, waitMs);
    // Robust hide: a bare transitionend never fires if the transition is zeroed (reduced-motion /
    // transition:none), interrupted (transitioncancel), or the tab is backgrounded -- leaving the
    // toast stuck visible. Read the actual duration; hide synchronously when there is none, else
    // hide on transitionend OR a wall-clock fallback, whichever first. hide() is idempotent.
    var done = false;
    function hide(e) {
      if (e && e.target !== panel) return;              // ignore bubbled child transitions
      if (done) return;
      done = true;
      panel.removeEventListener("transitionend", hide);
      panel.removeEventListener("transitioncancel", hide);
      panel.hidden = true;
    }
    function dismiss(persist) {
      clearTimeout(timer);
      if (showRaf) cancelAnimationFrame(showRaf);       // a dismiss before the show frame must not slide it in
      // Only an EXPLICIT dismissal (the x / Enter / Space) suppresses the toast for days; an
      // incidental Esc meant for some other open layer hides this view only, so the toast returns
      // next page. Privacy: store the dismissal DAY (midnight), not the exact millisecond -- the
      // read above compares at day granularity (Math.floor(diff / DAY) < dismissDays), so rounding
      // down is lossless for the feature while revealing far less precise timing.
      if (persist) { try { localStorage.setItem(LS_FLYIN, String(now - (now % DAY))); } catch (err) {} }
      panel.classList.remove("flyin-shown");
      var cs = getComputedStyle(panel);
      var secs = (parseFloat(cs.transitionDuration) || 0) + (parseFloat(cs.transitionDelay) || 0);
      if (secs <= 0) { hide(); return; }                // reduced-motion / transition:none -> sync
      panel.addEventListener("transitionend", hide);
      panel.addEventListener("transitioncancel", hide);
      setTimeout(hide, secs * 1000 + 50);               // fallback: never stuck visible
    }
    // A real <button>: native Enter/Space already fire a click, so no hand-wired key handler.
    var btn = panel.querySelector(".close-panel");
    if (btn) { btn.addEventListener("click", function () { dismiss(true); }); }
    // #169: Esc dismisses the toast while shown (consistent with the hovercard/modal idiom). Skip
    // when another handler already consumed the Escape (defaultPrevented) so it does not also eat a
    // keypress meant for a modal/menu/search, and dismiss WITHOUT the multi-day suppression write.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || e.defaultPrevented || panel.hidden) return;
      dismiss(false);
    });
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

  // Page-preview summaries may carry a tiny whitelist of inline formatting tags ({{os}} ->
  // "<u>o</u>perating <u>s</u>ystem (OS)"), already sanitized to bare tags by the generator
  // (mwstatic/preview_summary.py). Under require-trusted-types-for 'script' no HTML-string sink
  // is allowed, so parse that bare-tag markup and rebuild it with createElement/createTextNode
  // only. Keep this list in sync with ALLOWED_TAGS in preview_summary.py; a tag one side keeps
  // and the other drops just degrades to plain text.
  var PREVIEW_INLINE_TAGS = { b:1, strong:1, i:1, em:1, u:1, s:1, del:1, ins:1, sub:1, sup:1,
    small:1, mark:1, code:1, abbr:1, kbd:1, samp:1, "var":1, q:1, cite:1 };
  var PREVIEW_TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  function decodeBasicEntities(s) {
    // The generator escapes only & < > (quote=False); decode & LAST so "&amp;lt;" -> "&lt;".
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  // Append a whitelisted-inline-HTML summary to `root` as real DOM. The `=== 1` membership test
  // neutralizes prototype keys (__proto__/constructor -> dropped); an unknown or unbalanced tag
  // degrades to plain text, so this stays XSS-safe even if the fetched index were tampered with.
  function appendInlineHTML(root, htmlStr) {
    var stack = [root], pos = 0, m;
    function tip() { return stack[stack.length - 1]; }
    function addText(s) {
      if (s) tip().appendChild(document.createTextNode(decodeBasicEntities(s)));
    }
    PREVIEW_TAG_RE.lastIndex = 0;
    while ((m = PREVIEW_TAG_RE.exec(htmlStr)) !== null) {
      addText(htmlStr.slice(pos, m.index));
      pos = PREVIEW_TAG_RE.lastIndex;
      var name = m[2].toLowerCase();
      if (PREVIEW_INLINE_TAGS[name] !== 1) continue;  // non-whitelisted tag -> drop (text kept)
      if (m[1]) {                                     // closing tag: pop to its matching open
        for (var i = stack.length - 1; i > 0; i--) {
          if (stack[i].localName === name) { stack.length = i; break; }
        }
      } else {
        var node = document.createElement(name);
        tip().appendChild(node);
        stack.push(node);
      }
    }
    addText(htmlStr.slice(pos));
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
    // Cap the card to the room actually available and flip it ABOVE the citation when there is
    // more room there, so it sizes to its content yet never runs off the top or bottom of the
    // viewport. overflow-y:auto on .hovercard-ref then scrolls only when the content is genuinely
    // taller than that room (a small footnote shows in full, no needless inner scrollbar).
    function place(anchor) {
      var r = anchor.getBoundingClientRect();
      var GAP = 6, MARGIN = 8;
      var below = window.innerHeight - r.bottom - GAP - MARGIN;
      var above = r.top - GAP - MARGIN;
      var useAbove = above > below && above > 160;
      card.style.maxHeight = Math.max(120, useAbove ? above : below) + "px";
      var h = card.offsetHeight;  // measured AFTER the cap, to place an above-card by its real height
      var top = useAbove ? (r.top + window.scrollY - GAP - h) : (r.bottom + window.scrollY + GAP);
      var left = Math.max(MARGIN, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 340 - MARGIN));
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
      var extract = el("p", "hovercard-extract");
      appendInlineHTML(extract, p.d);  // p.d is whitelisted inline HTML, rendered as DOM (TT-safe)
      box.appendChild(extract);
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
    // Keyboard parity (WCAG 2.1.1 + 1.4.13): a FOCUSED citation / internal link opens the same
    // preview, not only mouse hover -- onEnter's 200ms delay debounces Tab-through. Dismiss when
    // focus leaves the trigger and does not move into the card. Esc (below) + Left/Right already
    // serve an open card; focus stays on the trigger.
    content.addEventListener("focusin", onEnter);
    content.addEventListener("focusout", function (e) {
      if (card && e.relatedTarget && card.contains(e.relatedTarget)) return;  // focus moved INTO the card
      hovered = null; clearTimeout(showTimer); hideSoon();
    });
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
    // Click / tap outside an open card dismisses it (the Popover-API `auto` light-dismiss idiom):
    // desktop cards already die on hover-out and keyboard cards on blur/Esc, so this only adds the
    // pointer path -- a stray click, or a touch tap, off the card closes it. A click INSIDE the
    // card (a link, the prev/next nav) is NOT a dismiss. Gated on an open card so it never contends
    // with the document-level search / nav / tools click handlers while no card is shown.
    // CAPTURE phase (the trailing `true`): the prev/next nav buttons REBUILD the card's children in
    // their own bubble-phase handler (showRef -> fill), which detaches the clicked button. A bubble-
    // phase listener here would then test card.contains(e.target) against that already-detached node,
    // get false, and wrongly dismiss the just-rebuilt card. Capture runs BEFORE any target handler
    // mutates the DOM, so e.target is still attached and the containment test is correct. Do NOT
    // switch this back to bubble.
    document.addEventListener("click", function (e) {
      if (!card || card.hidden) return;
      if (card.contains(e.target)) return;
      card.hidden = true;
    }, true);
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

  // Wide tables: add a TOP horizontal scrollbar that mirrors the table's own (bottom) one, so a
  // reader scrolls a wide table from either edge. The always-visible classic bars are pure CSS
  // (style.css); this adds + syncs the top rail. No-JS still gets the bottom bar. The table itself
  // stays the scroll container (display:block; overflow-x:auto), so it remains the keyboard-
  // focusable scroll region (codeartifacts.make_scroll_focusable) -- unchanged by this.
  function initWideTableScroll() {
    var tables = document.querySelectorAll(
      ".wiki-content table:not(.toc):not(.storage-table)");
    var items = [];
    tables.forEach(function (table) {
      // The TABLE's own box is capped (max-width:100%) and scrolls; its laid-out CHILDREN -- the
      // caption and each row group (thead / tbody(s) / tfoot) -- extend to the FULL content width and
      // overflow it. So the scroll extent is the WIDEST child's BORDER-box inline size and the
      // visible width is the TABLE's CONTENT-box, both read for FREE from the ResizeObserver entry,
      // never scrollWidth/clientWidth (which force a layout). Border-box for a child because a
      // caption carries 10em side padding (style.css): its content box excludes that padding and so
      // understates its scroll extent; its border box IS the extent (== the table's scrollWidth).
      // Observing EVERY child (not just tbody[0]) catches overflow driven by a wide caption or by a
      // row group other than the first/visible one.
      var groups = [], b;
      if (table.caption) { groups.push(table.caption); }
      if (table.tHead) { groups.push(table.tHead); }
      for (b = 0; b < table.tBodies.length; b++) { groups.push(table.tBodies[b]); }
      if (table.tFoot) { groups.push(table.tFoot); }
      if (!groups.length) { return; }   // no caption or row group -> nothing that can overflow
      // Build the top rail ONCE, up front, as a sibling BEFORE the table, hidden until the table is
      // actually overwide. Building here -- not in the observer callback -- keeps the RO callback
      // free of DOM-structure mutation. The rail mirrors the table's scroll.
      var rail = document.createElement("div");
      rail.className = "table-scroll-top";
      rail.setAttribute("aria-hidden", "true");
      rail.style.display = "none";
      var spacer = document.createElement("div");
      rail.appendChild(spacer);
      table.parentNode.insertBefore(rail, table);
      var item = { table: table, groups: groups, rail: rail, spacer: spacer, lock: false };
      rail.addEventListener("scroll", function () {
        if (item.lock) { return; }
        item.lock = true; table.scrollLeft = rail.scrollLeft; item.lock = false;
      });
      table.addEventListener("scroll", function () {
        if (item.lock) { return; }
        item.lock = true; rail.scrollLeft = table.scrollLeft; item.lock = false;
      });
      items.push(item);
    });
    if (!items.length) { return; }
    // Batched: READ every table's geometry FIRST, THEN apply every write -- split so the shared
    // geometry batcher runs these reads alongside every other widget's read, before any write. The
    // content width is the WIDEST child's BORDER-box inline size and the visible width is the TABLE's
    // CONTENT-box, both read for FREE from the ResizeObserver entry -- never scrollWidth/clientWidth,
    // which force a synchronous layout. Child border-box (not content-box) so a padded caption's
    // scroll extent is captured, and so the spacer (== content) spans the table's full scrollWidth,
    // keeping the rail's scroll range in sync with the native bar. The fallbacks match the box the RO
    // delivers: offsetWidth is border-box (child), clientWidth is content-box (table). An entry read
    // self-heals on a later image/font reflow (a child's border box changes on decode -> a free
    // re-measure), so no separate in-table image observe is needed. (The legacy no-RO path has no
    // entries, so it reads offsetWidth/clientWidth directly -- a path modern browsers never take.)
    //
    // LIMITATION (accepted): overflow that does NOT widen any observed child is not detected -- i.e.
    // content overflowing a FIXED-layout nested table's cell without growing the outer row group's
    // box. Only a scrollWidth read (dropped here) or a wrapper restructure would catch it; it is
    // corpus-unreachable (comparison-tables -- the only fixed-layout tables -- are top-level, never
    // nested in a content cell), and the table's native bottom scrollbar still scrolls it regardless.
    function measureTables() {
      var i, j, m = [];
      for (i = 0; i < items.length; i++) {
        var it = items[i], content = 0, g;
        for (j = 0; j < it.groups.length; j++) {
          g = geomBorderInlineSize(it.groups[j]);         // child scroll extent == its border box
          if (g == null) { g = it.groups[j].offsetWidth; }  // offsetWidth is border-box
          if (g > content) { content = g; }               // widest child == the scroll extent
        }
        var visible = geomContentInlineSize(it.table);    // visible width == the table's content box
        if (visible == null) { visible = it.table.clientWidth; }  // clientWidth is content-box
        m.push({ content: content, visible: visible });
      }
      return m;
    }
    // SCOPE BOUNDARY (deliberate): showing a rail toggles display none->block. For a FLAT table the
    // rail is a sibling in the (unobserved) content column, so showing it never resizes an observed
    // element -> no loop. For a table NESTED inside another observed table whose INNER table is
    // genuinely overwide, showing the inner rail grows the observed OUTER table mid-callback and can
    // fire one "ResizeObserver loop completed with undelivered notifications". That shape is corpus-
    // UNREACHABLE (a nested inner table never becomes overwide under the content-table CSS -- the
    // block-table outer grows to fit it and a table-cell % max-width is undefined; it needs an
    // artificial hard px cap) AND check-console-errors.py is blind to that error (it surfaces only on
    // window.onerror, not pageerror/console). So it is left unaddressed on purpose; the wrapper
    // restructure that would remove it is not worth its blast radius for a non-issue.
    function writeTables(measures) {
      var i;
      for (i = 0; i < items.length; i++) {
        var it = items[i], d = measures[i], overwide = d.content > d.visible + 1;
        it.spacer.style.width = d.content + "px";
        it.rail.style.display = overwide ? "" : "none";
        // Collapse the table's top margin when the rail sits above it. A margin write never changes
        // the observed table's border box, so it cannot loop the observer.
        it.table.style.marginTop = overwide ? "0" : "";
      }
    }
    function sync() { writeTables(measureTables()); }
    // scheduleSync is the LEGACY (no-ResizeObserver) fallback ONLY: it coalesces resize + late
    // image-load re-syncs into one rAF measurement per frame. The RO path below reads for free
    // (post-layout entry) and never goes through here.
    var raf = 0;
    function scheduleSync() {
      if (raf) { return; }
      raf = requestAnimationFrame(function () { raf = 0; sync(); });
    }
    if (typeof ResizeObserver !== "undefined") {
      // Observe the table (visible width) AND every child (caption + row groups, border width)
      // through the SHARED geometry batcher: every widget's entry read runs before any write, and an
      // entry read never forces layout -- so no forced reflow and no cross-observer thrash. An
      // unsized in-table image firing on decode changes its row group's content box -> a FREE
      // post-layout re-measure (no img.load -> requestAnimationFrame path that forced layout).
      var observe = geomObserver(measureTables, writeTables);
      items.forEach(function (it) {
        observe(it.table);   // visible width <- table CONTENT box (clientWidth)
        // border-box: a child's PADDING-only change (a caption's 10em gutters collapsing at the
        // 560px media query) changes its border box but not its content box, so a content-box
        // observation would miss it and leave the cached scroll extent stale.
        // {box:border-box} is honored on Safari 15.4+/Chromium/Firefox; Safari <15.4 IGNORES it
        // (added with the box-size fields) and observes content-box. Acceptable: there the extent
        // is a live offsetWidth read (above) on ANY callback, and our only border-only change --
        // the 560px caption-padding media query -- rides a viewport resize that fires the table's
        // content-box callback (a caption wide enough to overflow would itself drive that width).
        it.groups.forEach(function (g) { observe(g, "border-box"); });
      });
    } else {
      // No ResizeObserver (legacy only): first measure now, then rAF-coalesced resize + image-load
      // re-syncs (one forced layout per frame, on a path modern browsers never take).
      sync();   // immediate first measure (js-test asserts rails post-init)
      window.addEventListener("resize", scheduleSync);
      items.forEach(function (it) {
        it.table.querySelectorAll("img").forEach(function (img) {
          if (!img.complete) {
            img.addEventListener("load", scheduleSync);
            img.addEventListener("error", scheduleSync);  // a broken image also changes layout
          }
        });
      });
    }
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

  // Keyboard page-turn for the authored WikiBookIndex "book" chain: Left/Right move to the
  // previous/next book page. PROGRESSIVE enhancement over the visible .wiki-book-index Prev/Next
  // buttons (they work with no JS) -- the target is read from <link rel=prev/next> in <head> (as
  // Material for MkDocs and Sphinx do), emitted only on indexed pages, so an un-indexed page has
  // no links and this silently no-ops. Only the HORIZONTAL pair is bound; Up/Down/PageUp/PageDown/
  // Space stay free so vertical scrolling is never swallowed (mdBook's rule). The guard set bails
  // whenever the key belongs to the browser, an editable field, or an in-page widget that owns
  // arrows, so native scroll / IME / tablist / menubar / modal / lightbox / hovercard all keep it.
  function initBookNav() {
    var nextLink = document.querySelector('link[rel="next"]');
    var prevLink = document.querySelector('link[rel="prev"]');
    if (!nextLink && !prevLink) return;              // un-indexed page: nothing to navigate to
    // getAttribute, not the IDL .href: .href resolves href="" to the document URL, so a book
    // entry with a title but no URL would self-navigate (reload); the raw attribute stays ""
    // and the `if (!dest)` guard below bails. location.assign resolves the relative value.
    var nextHref = nextLink ? nextLink.getAttribute("href") : "";
    var prevHref = prevLink ? prevLink.getAttribute("href") : "";
    var rtl = document.documentElement.dir === "rtl";
    document.addEventListener("keydown", function (e) {
      // A modifier means the key is the browser's/OS's (Alt+Arrow = back/forward) or a text
      // selection (Shift+Arrow) -- never ours.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Mid-IME-composition (CJK etc.): isComposing covers most engines, keyCode 229 is the
      // Safari fallback -- same guard the search box uses.
      if (e.isComposing || e.keyCode === 229) return;
      // keydown targets the focused element, so e.target owns the key (house idiom; the wiki has
      // no shadow DOM, so composedPath / an e.target existence guard would only add an unreachable
      // branch).
      var t = e.target;
      // Editable focus owns arrows (caret movement) -- an input/select, or anywhere inside a
      // contenteditable region (the attribute form matches nested focus and works headless too,
      // unlike the isContentEditable property).
      var tag = t.nodeName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      // A focused native media player owns Left/Right (seek) via its built-in controls
      // (<video>/<audio controls> are Tab-reachable) -- never steal its arrows for a page turn.
      if (tag === "video" || tag === "audio") return;
      if (t.closest('[contenteditable]:not([contenteditable="false"])')) return;
      // A focused composite widget owns Left/Right (tabs + top-menubar roving: initTabs /
      // initNavKeyboard). Leave them to it.
      if (t.closest('[role="tablist"],[role="menubar"]')) return;
      // An open modal or gallery lightbox (both via the shared modals system) traps focus and
      // binds its own arrow/Escape keys.
      if (document.body.classList.contains("mini-modal-active")) return;
      // An open reference/page-preview hovercard steps footnotes with Left/Right in place.
      if (document.querySelector(".hovercard:not([hidden])")) return;
      // A FOCUSED horizontally-scrollable region (wide code block .viewport / wide table) keeps
      // Left/Right for native scroll -- these are made keyboard-focusable for exactly that.
      var sc = t.closest("[tabindex]");
      if (sc && sc.scrollWidth > sc.clientWidth + 1) return;
      var dest = (rtl ? (e.key === "ArrowRight") : (e.key === "ArrowLeft")) ? prevHref : nextHref;
      if (!dest) return;                             // no neighbour this direction (chain end)
      // Same-origin only (as the search path does at navSafe/location.assign): never navigate a
      // cross-origin dest, whose Referer would leak the (onion) origin. page.py restricts the
      // <link> to /wiki targets at the root; this is the defence-in-depth client check.
      if (!navSafe(dest, false)) return;
      e.preventDefault();
      window.location.assign(dest);
    });
  }

  // Per-heading share menus are DEDUPED to ONE page-level <template class="share-proto"> that
  // carries the full menu with opaque sentinels; each heading's .share-tooltip carries only its
  // 7 real per-context values as data-sh-*. On first HOVER, press or focus of a heading's share button
  // we clone the proto, substitute this heading's values, and move it into the live .menu, so CSS
  // :hover/:focus-within then reveals the FULL menu with no click (desktop hover + keyboard). A
  // tap/click additionally TOGGLES a persistent .share-open, essential on touch: a tap holds
  // neither :hover nor :focus-within, so without it the menu never stays open on a phone. Same
  // code on every platform (no UA branching) -- the browser decides which events fire. One proto
  // per page (not ~30 baked menus) keeps the RENDERED DOM small AND the HTML payload light;
  // no-JS / Tor-Safest users keep the static permalink. Delegated listeners -> ~zero load-time JS.
  // Homepage hero video: a poster overlay (.overview-image) sits over the <video>; clicking it
  // hides the poster and plays the video, so its native controls take over. CSP-safe (no inline
  // handler), no autoplay, poster is a plain <img>; keyboard users reach the video's own controls.
  // TT-safe: only toggles display + calls video.play(), no HTML sinks.
  function initHeroVideo() {
    var players = document.querySelectorAll(".overview-image-and-video-player");
    for (var i = 0; i < players.length; i++) {
      (function (player) {
        var overlay = player.querySelector(".overview-image");
        var video = player.querySelector("video");
        if (!overlay || !video) return;
        overlay.addEventListener("click", function () {
          overlay.style.display = "none";
          if (video.play) video.play();
        });
      })(players[i]);
    }
  }

  // Endorsement "show more": collapse the testimonial grid to a first set and reveal a button
  // that expands it (prod's "show more" slider, CSP-safe). Server-rendered button starts hidden,
  // so no-JS shows every card; JS collapses + reveals it only when there are extras to show.
  // TT-safe: toggles a class + button text, no HTML sinks.
  function initEndorsementMore() {
    var grid = document.querySelector(".endorsement-grid");
    var btn = document.querySelector(".endorsement-more");
    if (!grid || !btn) return;
    if (grid.querySelectorAll(".endorsement-card").length <= 6) return;  // nothing extra to reveal
    grid.classList.add("endorsement-collapsed");
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var collapsed = grid.classList.toggle("endorsement-collapsed");
      btn.textContent = collapsed ? "Show more" : "Show less";
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  // Native [popover] confirm/info cards -- the share "Open in <network>" confirm (.share-open-panel),
  // the comparison (i) info notes (.info-popover), and the anti-spam e-mail reasons
  // (.antispam-email-reasons) -- are opened by a <button popovertarget> and live in the TOP LAYER
  // (UA position:fixed, viewport containing block). CSS anchor positioning is Chromium-only, so
  // tether in JS -- the same measure-and-place idiom as the reference hovercard place(): on the
  // popover's `toggle` -> open, read the opener's viewport rect and write fixed top/left via CSSOM
  // (allowed under strict CSP -- a property write, not an inline style= attribute). Below the opener
  // by default, flipped above when there is no room, clamped into the viewport, centred on a phone
  // (a small confirm reads as "about the icon you tapped"). JS off -> the native viewport-centred
  // popover stays. Close buttons carry popovertargetaction="hide", so the OPENER is the
  // popovertarget control that is NOT a hide.
  function initPopoverTether() {
    var GAP = 6, MARGIN = 8;
    var active = null;  // { pop, opener } currently open + tracked on scroll/resize
    function openerFor(pop) {
      if (!pop.id) return null;
      var sel = '[popovertarget="' + (window.CSS && CSS.escape ? CSS.escape(pop.id) : pop.id) + '"]';
      var ctrls = document.querySelectorAll(sel);
      for (var i = 0; i < ctrls.length; i++) {
        if (ctrls[i].getAttribute("popovertargetaction") !== "hide") return ctrls[i];  // the opener
      }
      return null;
    }
    function place(pop, opener) {
      // Own the position: override the UA `inset:0; margin:auto` centring AND any stylesheet
      // transform (the @media phone rule uses translate(-50%,-50%)) so our top/left win outright.
      pop.style.position = "fixed";
      pop.style.margin = "0";
      pop.style.inset = "auto";
      pop.style.transform = "none";
      var r = opener.getBoundingClientRect();
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var pw = pop.offsetWidth, ph = pop.offsetHeight;   // measured while OPEN (toggle fires after show)
      var top, left;
      if (vw <= 480) {                                   // phone: centre, clamped on-screen
        left = Math.max(MARGIN, (vw - pw) / 2);
        top = Math.max(MARGIN, (vh - ph) / 2);
      } else {
        top = r.bottom + GAP;                            // below the opener
        if (top + ph > vh - MARGIN && r.top - GAP - ph > MARGIN) top = r.top - GAP - ph;  // flip above
        left = Math.max(MARGIN, Math.min(r.left, vw - pw - MARGIN));
        top = Math.max(MARGIN, Math.min(top, vh - ph - MARGIN));
      }
      pop.style.top = top + "px";
      pop.style.left = left + "px";
    }
    function reposition() { place(active.pop, active.opener); }  // only attached while open -> active is set
    // `toggle` does NOT bubble, but a CAPTURING document listener still receives it at the target.
    // Guard on the `popover` attribute so a <details> toggle (also a ToggleEvent) is ignored.
    document.addEventListener("toggle", function (e) {
      var pop = e.target;
      if (!pop.hasAttribute("popover")) return;   // a <details> ToggleEvent carries no popover attr
      if (e.newState === "open") {
        var opener = openerFor(pop);
        if (!opener) return;                             // no invoker -> leave the native default
        place(pop, opener);
        active = { pop: pop, opener: opener };
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
      } else if (active && active.pop === pop) {
        window.removeEventListener("scroll", reposition, true);
        window.removeEventListener("resize", reposition);
        active = null;
      }
    }, true);
  }

  function initShareLazy() {
    // Replace each of the 7 opaque sentinels 1:1 with this heading's value -- PURE string
    // substitution, NO encoding. chrome.share_menu_values already applied every context transform
    // (url-quoting, wikitext-delimiter stripping, accessible-name disambiguation) and the browser
    // decoded the data-sh-* attrs, so the values are final; re-encoding here would corrupt them
    // (the bug this replaces: it encodeURIComponent'd href values, bypassing Python's transforms ->
    // clipboard injection + broken social/markdown URLs). Distinct sentinels mean no value is ever
    // reused across two encodings, so one map + one pass is always correct.
    function substShare(str, map) {
      return str.replace(/ZZSH(DIRECT|U|T|ARIA|WIKI|MD|PHPBB|ID)ZZ/g, function (m) { return map[m]; });
    }
    // Per-heading-unique prefix for the social popover ids (ZZSHIDZZ in the proto). Every cloned
    // menu must get document-unique popovertarget/[popover] id pairs, or a button would target the
    // first same-id popover on the page. Incremented once per heading built.
    var shUid = 0;
    // The full social+copy menu is deduped: ONE page-level <template class="share-proto"> carries
    // it with the sentinels; each heading's .share-tooltip carries its 7 real values as data-sh-*.
    // On first open, clone the proto, substitute this heading's values, and drop the pre-rendered
    // no-JS permalink (the proto re-includes it). Footer/authored menus have no data-sh-direct
    // (their full menu is already rendered) -> left untouched.
    function activate(tip) {
      if (tip.getAttribute("data-sh-built")) return;       // build once per heading
      var direct = tip.getAttribute("data-sh-direct");
      if (direct === null) return;                         // footer/authored menu: already full
      var proto = document.querySelector("template.share-proto");
      var menu = tip.querySelector(".menu");
      if (!proto || !menu) return;
      var map = {
        ZZSHDIRECTZZ: direct,
        ZZSHUZZ: tip.getAttribute("data-sh-u"),
        ZZSHTZZ: tip.getAttribute("data-sh-t"),
        ZZSHARIAZZ: tip.getAttribute("data-sh-aria"),
        ZZSHWIKIZZ: tip.getAttribute("data-sh-wiki"),
        ZZSHMDZZ: tip.getAttribute("data-sh-md"),
        ZZSHPHPBBZZ: tip.getAttribute("data-sh-phpbb"),
        ZZSHIDZZ: "sh" + (shUid++)        // unique popover-id prefix for this heading's menu
      };
      var frag = proto.content.cloneNode(true);
      var els = frag.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        var attrs = els[i].attributes;
        for (var j = 0; j < attrs.length; j++) {
          if (attrs[j].value.indexOf("ZZSH") !== -1) {
            els[i].setAttribute(attrs[j].name, substShare(attrs[j].value, map));
          }
        }
      }
      var tw = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = tw.nextNode())) {
        if (n.nodeValue.indexOf("ZZSH") !== -1) n.nodeValue = substShare(n.nodeValue, map);
      }
      while (menu.firstChild) menu.removeChild(menu.firstChild);  // drop the no-JS permalink
      menu.appendChild(frag);
      tip.setAttribute("data-sh-built", "1");
      initCopyButtons();                                   // idempotent: wires the new .code-select
    }
    // Set a tip's open state. .menu-wrapper is also revealed by :focus-within, so merely dropping
    // .share-open would leave the menu open while focus stays inside (the "2nd tap does not close"
    // bug). On CLOSE, blur whatever element inside the tooltip holds focus -- the trigger (a touch
    // tap leaves it focused) OR a menu child a keyboard user tabbed into -- so :focus-within
    // releases and the menu actually hides. aria-expanded tracks the state for assistive tech.
    function setOpen(tip, open) {
      var t = tip.querySelector(".headline-anchor");   // every share-tooltip carries one
      tip.classList.toggle("share-open", open);
      t.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open && tip.contains(document.activeElement)) document.activeElement.blur();
      // On reopen, clear any x-dismiss display override (see the .menu-close handler) so the
      // menu can show again.
      if (open) { var w = tip.querySelector(".menu-wrapper"); if (w) w.style.display = ""; }
    }
    function closeAll(except) {
      var open = document.querySelectorAll(".share-tooltip.share-open");
      for (var i = 0; i < open.length; i++) if (open[i] !== except) setOpen(open[i], false);
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
      setOpen(tip, open);
    }
    document.addEventListener("pointerover", onPrime);     // prime on HOVER -> desktop hover reveals the FULL menu, no click
    document.addEventListener("pointerdown", onPrime);     // prime on press (touch/pen may skip hover)
    document.addEventListener("focusin", onPrime);         // prime on keyboard/tap focus
    document.addEventListener("click", onToggle);          // reliable tap toggle (touch has no hover to hold it open)
    document.addEventListener("pointerdown", function (e) {   // dismiss on an outside press
      if (!(e.target && e.target.closest && e.target.closest(".share-tooltip"))) closeAll(null);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(null); });
    // The visible (x) inside the menu closes its tooltip -- the discoverable, mobile-friendly
    // affordance (an outside tap / a 2nd tap on the trigger also close, but neither is obvious on
    // touch). setOpen drops .share-open AND blurs the focused menu child so :focus-within releases.
    document.addEventListener("click", function (e) {
      var x = e.target && e.target.closest ? e.target.closest(".menu-close") : null;
      if (!x) return;
      var tip = x.closest(".share-tooltip");
      if (!tip) return;
      setOpen(tip, false);
      // Beat the sticky desktop :hover (@media(hover:hover) .share-tooltip:hover .menu-wrapper
      // {display:block}), which re-reveals the menu while the pointer still sits on the (x). Only a
      // mouse :hover can do this, so pin display:none ONLY while actually hovered -- a keyboard (x)
      // with the pointer outside is already handled by setOpen's blur (releases :focus-within), and
      // pinning it there would never get a pointer leave and stay stuck hidden. Clear it on a GENUINE
      // pointer leave (guard on !:hover to ignore the spurious pointerleave some engines fire as the
      // menu collapses under the cursor -- Firefox delivers the real leave as mouseleave), OR on a
      // focus returning to the tooltip: a keyboard reopen via :focus-within must win even with the
      // mouse still resting, so focusin clears UNCONDITIONALLY. An explicit reopen clears via setOpen.
      var wrap = tip.querySelector(".menu-wrapper");
      if (wrap && tip.matches(":hover")) {
        wrap.style.display = "none";
        var reveal = function () {
          wrap.style.display = "";
          tip.removeEventListener("pointerleave", onLeave);
          tip.removeEventListener("mouseleave", onLeave);
          tip.removeEventListener("focusin", reveal);
        };
        var onLeave = function () { if (!tip.matches(":hover")) reveal(); };
        tip.addEventListener("pointerleave", onLeave);
        tip.addEventListener("mouseleave", onLeave);
        tip.addEventListener("focusin", reveal);
      }
    });
  }

  // Warm below-the-fold lazy images ~3 viewports before they enter view, so the fetch AND the
  // decode finish before the user scrolls to them (no visible pop-in). No-JS falls back to native
  // loading=lazy (unchanged). Bounded on bandwidth: only images the user is scrolling toward are
  // warmed, and Save-Data / 2g links are skipped (native lazy only), preserving lazy-load's data
  // savings; fetchpriority=low so a warmed image never contends with the LCP.
  function initImageWarmAhead() {
    if (typeof IntersectionObserver !== "function") return;   // old engines: native lazy only
    // Skip metered / data-saver / very slow links (incl. Tor-ish): native lazy only, no warming.
    var c = navigator.connection;
    if (c && (c.saveData || /2g$/.test(c.effectiveType || ""))) return;   // "2g" / "slow-2g"
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var img = entries[i].target;
        io.unobserve(img);
        img.setAttribute("fetchpriority", "low");
        img.loading = "eager";                                 // start the fetch now (deterministic)
        if (typeof img.decode === "function") img.decode().catch(function () {});  // pre-decode
      }
      // 3 viewports (not 1.5): Firefox/Safari native lazy-load use a tiny margin, so a 1.5-vp
      // warm only reached the image about to enter view anyway -- below-fold images still popped
      // in on scroll. 3 vp gives a real head start there; Chrome's native lazy already covers it.
    }, { root: null, rootMargin: "300% 0px" });                // ~3 viewports ahead
    var imgs = document.querySelectorAll('img[loading="lazy"]');
    for (var j = 0; j < imgs.length; j++) io.observe(imgs[j]);
  }

  ready(function () {
    // Paint-, theme-, hash- and layout-critical: run immediately. Deferring these would flash
    // the stored theme, fail to open a hash-targeted tab/<details> on load, or shift layout
    // after first paint (banners show/hide, the bottom-stack spacer, the tab switcher).
    initDarkMode();
    // These hashchange handlers are the ONLY window-level listeners. Do NOT add an "unload" or
    // "beforeunload" listener anywhere: either one makes the page ineligible for the back/forward
    // cache (bfcache), so a back navigation reloads instead of restoring instantly. Use
    // "pagehide"/"pageshow" if a page-lifecycle hook is ever needed. Enforced by a jscov test
    // (dist-ai website-tests/jscov/app.test.js) that fails CI on a (before)unload registration.
    openHashDetails();
    window.addEventListener("hashchange", openHashDetails);
    initTabs();
    window.addEventListener("hashchange", syncTabsFromHash);
    initNavToggle();
    initNavKeyboard();
    initBookNav();
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
      initPopoverTether();
      initHeroVideo();
      initEndorsementMore();
      initImageWarmAhead();
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
