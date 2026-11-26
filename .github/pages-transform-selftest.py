#!/usr/bin/env python3
# Selftest for pages-transform.py -- runs in the Pages workflow BEFORE the real transform, so a
# broken stageify (e.g. activation flip or noindex insert silently no-opping) fails the deploy
# loud instead of publishing a production-looking, indexable stage mirror.
#
# Covers: transform injects stage-active (both the no-class <html> and an existing-class one),
# noindex, and the card-host rewrite; writes the stage robots.txt; is idempotent; and -- the
# canaries -- verify FAILS when stage-active or noindex is absent (the guard is not a no-op).
# stdlib only; the workflow invokes it via `python3` (no execute-bit dependency). Exit 0 = all pass.

import importlib.util
import sys
import tempfile
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("pages_transform", _HERE / "pages-transform.py")
pt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pt)

_HOST = "kicksecure-stage.github.io"
_failures = []


def _ck(cond, msg):
    if not cond:
        _failures.append(msg)


class _Args:
    def __init__(self, d, stage_host=None):
        self.dir = str(d)
        self.stage_host = stage_host


_PAGE_NOCLASS = (
    '<!doctype html>\n<html lang="en">\n<head>\n'
    '<meta name="robots" content="max-image-preview:large">\n'
    '<meta property="og:image" content="https://www.kicksecure.com/w/images/x.png">\n'
    '<meta name="twitter:image" content="https://www.kicksecure.com/w/images/x.png">\n'
    '</head>\n<body><div class="stage-banner">Staging server.</div></body>\n</html>\n')
# An <html> that already carries a class + data-sn-id (the sitenotice path): the token appends.
_PAGE_WITHCLASS = (
    '<!doctype html>\n<html lang="en" class="foo" data-sn-id="39">\n'
    '<head><title>x</title></head>\n<body>hi</body>\n</html>\n')


def _write_site(root, pages):
    for name, body in pages.items():
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
    (root / "robots.txt").write_text("User-agent: *\n", encoding="utf-8")


def test_transform_and_verify(tmp):
    root = Path(tmp) / "ok"
    root.mkdir()
    _write_site(root, {"index.html": _PAGE_NOCLASS, "sub/p.html": _PAGE_WITHCLASS})
    pt.cmd_transform(_Args(root, _HOST))

    idx = (root / "index.html").read_text(encoding="utf-8")
    sub = (root / "sub/p.html").read_text(encoding="utf-8")
    # stage-active injected on the no-class <html> ...
    _ck('<html lang="en" class="stage-active">' in idx,
        "no-class <html> must gain class=\"stage-active\"")
    # ... and appended to an existing class list without dropping the originals.
    cm = pt._RE_HTML_CLASS.search(sub)
    _ck(cm is not None and set(cm.group(2).split()) == {"foo", "stage-active"},
        "existing <html> class must gain stage-active, keeping prior tokens")
    # noindex forced + card host rewritten to the stage origin.
    _ck('<meta name="robots" content="noindex,nofollow">' in idx, "robots must become noindex")
    _ck('content="https://%s/w/images/x.png"' % _HOST in idx, "og/twitter image host rewritten")
    _ck((root / "robots.txt").read_text(encoding="utf-8") == pt.STAGE_ROBOTS,
        "robots.txt rewritten to the stage policy")
    _ck(pt.cmd_verify(_Args(root)) == 0, "verify must pass on a correctly transformed tree")

    # Idempotent: a second transform changes nothing, and stage-active appears exactly once.
    pt.cmd_transform(_Args(root, _HOST))
    idx2 = (root / "index.html").read_text(encoding="utf-8")
    _ck(idx2.count("stage-active") == 1, "transform must be idempotent (one stage-active)")
    _ck(pt.cmd_verify(_Args(root)) == 0, "verify must still pass after a second transform")


def test_verify_canaries(tmp):
    # Missing stage-active (noindexed but not activated) -> verify FAILS.
    r1 = Path(tmp) / "noactive"
    r1.mkdir()
    _write_site(r1, {"x.html":
        '<!doctype html>\n<html lang="en"><head>'
        '<meta name="robots" content="noindex,nofollow"></head><body></body></html>\n'})
    (r1 / "robots.txt").write_text(pt.STAGE_ROBOTS, encoding="utf-8")
    _ck(pt.cmd_verify(_Args(r1)) == 1, "verify MUST fail when stage-active is absent")

    # Missing noindex (activated but indexable) -> verify FAILS (pre-existing guard).
    r2 = Path(tmp) / "noindexless"
    r2.mkdir()
    _write_site(r2, {"x.html":
        '<!doctype html>\n<html lang="en" class="stage-active"><head>'
        '<meta name="robots" content="max-image-preview:large"></head><body></body></html>\n'})
    (r2 / "robots.txt").write_text(pt.STAGE_ROBOTS, encoding="utf-8")
    _ck(pt.cmd_verify(_Args(r2)) == 1, "verify MUST fail when noindex is absent")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        test_transform_and_verify(tmp)
        test_verify_canaries(tmp)
    if _failures:
        for f in _failures:
            print("pages-transform-selftest: FAIL: %s" % f, file=sys.stderr)
        print("pages-transform-selftest: FAILED (%d)" % len(_failures), file=sys.stderr)
        return 1
    print("pages-transform-selftest: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
