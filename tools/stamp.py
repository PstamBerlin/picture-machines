#!/usr/bin/env python3
"""Stamps the site with a version made from its own contents.

A browser keeps scripts for a while, so after a deploy a new page could run with an old script (that
happened with Spin). Every script and stylesheet is therefore asked for by a name that changes whenever
anything changes: style.css?v=1a2b3c4d. The scripts import each other, so the same stamp goes on every
import and on the worker's address too. Run it before every commit that touches docs/:

    python3 tools/stamp.py
"""
import hashlib, pathlib, re
docs = pathlib.Path(__file__).resolve().parent.parent / 'docs'
files = sorted(p for p in docs.rglob('*') if p.is_file() and p.suffix in ('.html', '.css', '.js', '.jpg', '.svg', '.png', '.webmanifest'))
strip = lambda b: re.sub(rb'\?v=[0-9a-f]{8}', b'', re.sub(rb'const VERSION = "[^"]*";', b'', b))
h = hashlib.sha256()
for p in files: h.update(p.name.encode()); h.update(strip(p.read_bytes()))
v = h.hexdigest()[:8]
def stamp(text):
    text = re.sub(r'\?v=[0-9a-f]{8}', '', text)
    text = re.sub(r'''((?:from|import)\s*\(?\s*['"]\./[\w./-]+\.js)(['"])''', r'\1?v=' + v + r'\2', text)        # imports between the scripts
    text = re.sub(r'''(new Worker\(['"][\w./-]+\.js)(['"])''', r'\1?v=' + v + r'\2', text)                       # the worker
    text = re.sub(r'''((?:href|src)=")((?:style\.css|app\.js))(")''', r'\1\2?v=' + v + r'\3', text)              # the page's own two files
    return re.sub(r'const VERSION = "[^"]*";', 'const VERSION = "pictures-' + v + '";', text)
for p in files:
    if p.suffix in ('.html', '.js'):
        old = p.read_text(); new = stamp(old)
        if new != old: p.write_text(new)
print('stamped', docs, v)
