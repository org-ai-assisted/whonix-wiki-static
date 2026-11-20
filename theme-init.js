/* mw-static-generator flash-free pre-paint init.

   Loaded as a classic, render-blocking <script src="/theme-init.min.js"> placed FIRST
   among the resource refs in <head>, so it runs BEFORE first paint: it sets the theme
   and hides already-dismissed banners from localStorage with no flash. Being an external
   file (served from 'self'), it needs NO inline <script> and NO sha256 in the CSP, so the
   policy stays a static script-src 'self'.

   Trusted-Types-safe: touches only setAttribute / classList, never an HTML-string DOM
   sink, so it runs under require-trusted-types-for 'script' with no policy.

   Contract: the localStorage key names below MUST stay in sync with app.js (LS_THEME /
   LS_LEGAL_ACK / LS_STAGE / LS_SITENOTICE) -- this runs before app.js loads. */
(function () {
  "use strict";
  try {
    var d = document.documentElement;
    var L = localStorage;
    var t = L.getItem("theme");
    // JS on -> CSS hides .show-for-nojs-only (pre-paint, no flash of the no-JS fallback).
    d.classList.add("client-js");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches))
      d.setAttribute("data-theme", "dark");
    if (L.getItem("legal-agreement-banner-dismissed") === "1")
      d.classList.add("legal-ack-hidden");
    if (L.getItem("stage-notice-dismissed") === "1")
      d.classList.add("stage-notice-hidden");
    // Site-notice is keyed by the active banner id (data-sn-id on <html>): a bumped id re-shows.
    var s = d.getAttribute("data-sn-id");
    if (s && L.getItem("sitenotice-dismissed") === s)
      d.classList.add("sitenotice-hidden");
  } catch (e) {}
})();
