#!/usr/bin/env python3
# Staging-only serve-time transform for the GitHub Pages artifact.
#
# WHY: the committed HTML is the pristine production (--prod) build -- real www.* canonical,
# no robots noindex. Served unchanged on the *-stage.github.io preview domain it would get
# indexed. This step transforms ONLY the built _site artifact in CI (never the committed HTML),
# so the stage mirror stays out of search indexes regardless of which build mode produced the
# commit.
#
# Index posture: per-page noindex,nofollow meta + a deterministic, fully crawlable robots.txt
# (STAGE_ROBOTS). noindex keeps an HTML page out of the index, and a crawler only reads it if it is
# ALLOWED to fetch the page -- so HTML stays crawlable (a blanket `Disallow: /` would DEFEAT
# de-indexing: the crawler never reads the meta). Non-HTML assets (images, media, js/css, feed/
# sitemap/search/api) get NO robots block: GitHub Pages cannot noindex them, and a robots Disallow
# blocks crawling without guaranteeing de-indexing anyway; the nofollow on every page stops crawlers
# discovering the assets through the pages. The transform WRITES robots.txt verbatim (not patched).
#
# Mode is ALWAYS explicit (transform | verify); a bare invocation is a usage error -- the
# transform must never run by accident. Invoked via its shebang (chmod +x), never `python3 <this>`.
# stdlib only.

import argparse
import os
import re
import sys
from pathlib import Path

# SCOPE: the input is this generator's own --prod/--stage HTML, which emits at most one
# <meta name="robots" content="..."> per page (name before content, double-quoted) and never a
# commented-out or single-quoted robots meta -- so the regexes below need not handle arbitrary
# hand-authored HTML. verify (below) is the fail-loud guard that confirms the real output.
#
# nofollow matches the generator's own --stage convention.
ROBOTS_CONTENT = "noindex,nofollow"
ROBOTS_META = '<meta name="robots" content="%s">' % ROBOTS_CONTENT

# The robots.txt the transform writes verbatim onto the served artifact: fully crawlable, so the
# per-page noindex is read and the HTML is reliably de-indexed. Deliberately NO Disallow -- a
# blanket one would stop the crawler reading the noindex, and a per-asset one cannot guarantee
# de-indexing (robots.txt blocks crawling, not URL listing) and GitHub Pages cannot noindex non-HTML
# anyway; the noindex,nofollow on every page already stops crawlers discovering the assets through
# the pages. Written WHOLE (not patched), so the posture is deterministic for any committed build
# mode -- no need to parse arbitrary robots.txt shapes; verify exact-matches it.
STAGE_ROBOTS = (
    "User-agent: *\n"
    "Allow: /\n"
)

# A <meta name="robots" ...> whose content is captured in group 2 (name before content, which is
# how the generator emits it, e.g. the --prod `max-image-preview:large`).
_RE_ROBOTS = re.compile(
    r'(<meta\b[^>]*\bname="robots"[^>]*\bcontent=")([^"]*)(")', re.IGNORECASE)
# The opening <head ...> tag (attributes allowed); insertion seam when no robots meta exists.
_RE_HEAD = re.compile(r'(<head\b[^>]*>)', re.IGNORECASE)
_RE_HTML = re.compile(r'(<html\b[^>]*>)', re.IGNORECASE)
# The origin (scheme://host) of the content URL in an og:image / twitter:image meta. property/name
# precede content (generator order); only the origin is rewritten, the path is kept.
_RE_CARD_ORIGIN = re.compile(
    r'(<meta\b[^>]*?(?:property="og:image"|name="twitter:image")[^>]*?content=")'
    r'https?://[^/"]+', re.IGNORECASE)


def stage_host(explicit):
    """The host the artifact is served at. These are <host>.github.io user/org Pages repos
    (GITHUB_REPOSITORY = <owner>/<host>.github.io) served at the domain root, so the repo name IS
    the served host and og:image root-absolute paths resolve under it. --stage-host overrides."""
    if explicit:
        return explicit
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        return repo.split("/", 1)[1]
    raise SystemExit(
        "pages-transform: cannot determine stage host -- set GITHUB_REPOSITORY "
        "(owner/<name>.github.io) or pass --stage-host")


def set_robots_noindex(html):
    """Force exactly one robots meta of ROBOTS_CONTENT. Replace any existing robots meta(s);
    if none, insert after <head> (fallback: after <html>, else prepend). Idempotent."""
    new, n = _RE_ROBOTS.subn(lambda m: m.group(1) + ROBOTS_CONTENT + m.group(3), html)
    if n:
        return new
    inject = "\\1\n" + ROBOTS_META
    new, n = _RE_HEAD.subn(inject, html, count=1)
    if n:
        return new
    new, n = _RE_HTML.subn(inject, html, count=1)
    if n:
        return new
    return ROBOTS_META + "\n" + html


def rewrite_card_hosts(html, host):
    """Point og:image / twitter:image at the stage origin so the card media resolves on the
    served domain (the --prod build bakes www.* there, which 404s). Path kept. Idempotent."""
    return _RE_CARD_ORIGIN.sub(lambda m: m.group(1) + "https://" + host, html)


def write_stage_robots(root):
    """Write STAGE_ROBOTS onto the served artifact (overwriting whatever the build emitted), so
    the stage robots.txt posture is deterministic and correct for any build mode. Idempotent.
    Returns True if the file changed."""
    robots = root / "robots.txt"
    existing = robots.read_text(encoding="utf-8") if robots.is_file() else None
    if existing == STAGE_ROBOTS:
        return False
    robots.write_text(STAGE_ROBOTS, encoding="utf-8")
    return True


def iter_html(root):
    return sorted(p for p in root.rglob("*.html") if p.is_file())


def cmd_transform(args):
    root = Path(args.dir)
    if not root.is_dir():
        raise SystemExit("pages-transform: not a directory: %s" % root)
    host = stage_host(args.stage_host)
    changed = 0
    for path in iter_html(root):
        original = path.read_text(encoding="utf-8")
        out = rewrite_card_hosts(set_robots_noindex(original), host)
        if out != original:
            path.write_text(out, encoding="utf-8")
            changed += 1
    robots_changed = write_stage_robots(root)
    print("pages-transform: transformed %d file(s); stage host %s; robots.txt %s"
          % (changed, host, "written" if robots_changed else "already current"))
    return 0


def cmd_verify(args):
    root = Path(args.dir)
    if not root.is_dir():
        raise SystemExit("pages-transform: not a directory: %s" % root)
    failures = []
    total = 0
    for path in iter_html(root):
        total += 1
        m = _RE_ROBOTS.search(path.read_text(encoding="utf-8"))
        # Exact directive token, not a substring: `noindexable` / `max-image-preview:large` must
        # NOT pass as noindex.
        tokens = {t.strip().lower() for t in (m.group(2) if m else "").split(",")}
        if "noindex" not in tokens:
            failures.append("missing noindex robots meta: %s" % path.relative_to(root))
    robots = root / "robots.txt"
    # The served robots.txt must be exactly STAGE_ROBOTS (HTML crawlable so the noindex is read,
    # non-HTML assets crawl-blocked). Exact match -- transform writes it verbatim, so any drift
    # (a blocking shape the transform did not run, a hand edit) fails the deploy loud.
    if not robots.is_file():
        failures.append("missing robots.txt")
    elif robots.read_text(encoding="utf-8") != STAGE_ROBOTS:
        failures.append("robots.txt is not the stage policy (expected HTML crawlable + non-HTML blocked)")
    if failures:
        for f in failures:
            print("pages-transform: FAIL: %s" % f, file=sys.stderr)
        print("pages-transform: verify FAILED (%d issue(s), %d html checked)"
              % (len(failures), total), file=sys.stderr)
        return 1
    print("pages-transform: verify OK (%d html noindexed, robots.txt = stage policy)" % total)
    return 0


def main(argv):
    parser = argparse.ArgumentParser(
        prog="pages-transform", description="Staging-only serve-time transform of the _site artifact.")
    sub = parser.add_subparsers(dest="mode", required=True)
    t = sub.add_parser("transform", help="inject noindex + rewrite card hosts + write stage robots.txt in <dir>")
    t.add_argument("dir", help="the built site artifact directory (e.g. _site)")
    t.add_argument("--stage-host", default=None,
                   help="override the served host (default: from GITHUB_REPOSITORY)")
    t.set_defaults(func=cmd_transform)
    v = sub.add_parser("verify", help="assert every page is noindexed and robots.txt is the stage policy")
    v.add_argument("dir", help="the built site artifact directory (e.g. _site)")
    v.set_defaults(func=cmd_verify)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
