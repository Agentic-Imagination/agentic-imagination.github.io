"""Stamp every local CSS/JS reference in index.html with a hash of the file's content (?v=...).

GitHub Pages lets browsers cache assets for 10 minutes, so without this an updated script can keep running
the old version after a push. Run it before each commit:

  python tools/stamp_assets.py

The rollout viewer's sprites (assets/gifs/rollout_split/*.webp) are loaded by main.js, so their hashes go into
the SPRITE_V table in main.js first; main.js's own stamp then covers them too.
"""
import hashlib
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PAGE = os.path.join(ROOT, "index.html")
MAIN_JS = os.path.join(ROOT, "assets", "js", "main.js")
SPRITES = os.path.join(ROOT, "assets", "gifs", "rollout_split")


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def stamp(match):
    attr, path = match.group(1), match.group(2)
    return '%s="%s?v=%s"' % (attr, path, sha(os.path.join(ROOT, path)))


# 1. SPRITE_V in main.js: one line per environment
names = sorted(n[:-5] for n in os.listdir(SPRITES) if n.endswith(".webp"))
envs = sorted({n.split("_k")[0] for n in names})
lines = [", ".join('%s: "%s"' % (n, sha(os.path.join(SPRITES, n + ".webp"))) for n in names if n.split("_k")[0] == e) for e in envs]
table = "var SPRITE_V = {\n    " + ",\n    ".join(lines) + "\n  };"
js = open(MAIN_JS, encoding="utf-8").read()
new_js, n = re.subn(r"var SPRITE_V = \{[^}]*\};", lambda m: table, js)
if n != 1:
    raise SystemExit("main.js: no SPRITE_V table to stamp")
if new_js != js:
    open(MAIN_JS, "w", encoding="utf-8").write(new_js)
print("main.js SPRITE_V: %d sprites" % len(names))

# 2. the CSS/JS references in index.html
html = open(PAGE, encoding="utf-8").read()
new = re.sub(r'(href|src)="(assets/(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', stamp, html)
if new != html:
    open(PAGE, "w", encoding="utf-8").write(new)
print("\n".join(sorted(set(re.findall(r'assets/(?:css|js)/[^"]+\?v=[0-9a-f]+', new)))))
