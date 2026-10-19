"""Stamp every local CSS/JS reference in index.html with a hash of the file's content (?v=...).

GitHub Pages lets browsers cache assets for 10 minutes, so without this an updated script can keep running
the old version after a push. Run it before each commit:

  python tools/stamp_assets.py
"""
import hashlib
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PAGE = os.path.join(ROOT, "index.html")


def stamp(match):
    attr, path = match.group(1), match.group(2)
    with open(os.path.join(ROOT, path), "rb") as f:
        digest = hashlib.sha1(f.read()).hexdigest()[:8]
    return '%s="%s?v=%s"' % (attr, path, digest)


html = open(PAGE, encoding="utf-8").read()
new = re.sub(r'(href|src)="(assets/(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', stamp, html)
if new != html:
    open(PAGE, "w", encoding="utf-8").write(new)
print("\n".join(sorted(set(re.findall(r'assets/(?:css|js)/[^"]+\?v=[0-9a-f]+', new)))))
