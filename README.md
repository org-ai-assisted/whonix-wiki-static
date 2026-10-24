# whonix-wiki-static

Dual-purpose repository:

- The flat static tree at the repo root is the Whonix wiki rendered by
  `mw-static-generator`. It is served as-is by GitHub Pages and by the
  dist-encrypted production nginx (fetched content-exact from the
  `org-ai-assisted/whonix-wiki-static` mirror).
- `debian/` builds the same tree into the `whonix-wiki-static` Debian package,
  installing it under `/usr/share/doc/homepage/whonix-wiki-static/` as offline
  documentation that can also be re-served online.

The tree is GENERATED, not hand-edited: refresh it with `mw-static-generator`
(`tools/deploy-stage.sh`). Only `debian/`, `make-helper-overrides.bsh`, and this
README are hand-maintained.
