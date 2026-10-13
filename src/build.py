"""Rebuild index.html from the files in src/.

    python3 src/build.py

Needs Python 3 only. The fonts, Paged.js, and the OSINT citation core are read from
src/vendor/ and embedded, so the finished page works offline as a single file.
"""
import base64, json, pathlib, re

SRC = pathlib.Path(__file__).resolve().parent
ROOT = SRC.parent
V = SRC / 'vendor'

# IBM Plex, from the @fontsource packages (SIL Open Font License 1.1). Each entry:
# family name used by the paper, file stem, weight, style, subsets.
FONTS = [
    ('Plex Serif', 'ibm-plex-serif', 400, 'normal', ['latin', 'latin-ext', 'cyrillic']),
    ('Plex Serif', 'ibm-plex-serif', 400, 'italic', ['latin', 'latin-ext', 'cyrillic']),
    ('Plex Serif', 'ibm-plex-serif', 600, 'normal', ['latin', 'latin-ext', 'cyrillic']),
    ('Plex Serif', 'ibm-plex-serif', 600, 'italic', ['latin', 'latin-ext', 'cyrillic']),
    ('Plex Sans Cond', 'ibm-plex-sans-condensed', 500, 'normal', ['latin', 'latin-ext']),
    ('Plex Sans Cond', 'ibm-plex-sans-condensed', 600, 'normal', ['latin', 'latin-ext']),
    ('Plex Sans Cond', 'ibm-plex-sans-condensed', 700, 'normal', ['latin', 'latin-ext']),
    ('Plex Mono', 'ibm-plex-mono', 400, 'normal', ['latin', 'latin-ext', 'cyrillic']),
    ('Plex Mono', 'ibm-plex-mono', 500, 'normal', ['latin', 'latin-ext', 'cyrillic']),
    ('Plex Mono', 'ibm-plex-mono', 700, 'normal', ['latin', 'latin-ext', 'cyrillic']),
    # Plex Sans Condensed has no Cyrillic; IBM Plex Sans supplies those letters in headings.
    ('Plex Sans Cond', 'ibm-plex-sans', 500, 'normal', ['cyrillic']),
    ('Plex Sans Cond', 'ibm-plex-sans', 600, 'normal', ['cyrillic']),
    ('Plex Sans Cond', 'ibm-plex-sans', 700, 'normal', ['cyrillic']),
]
RANGES = json.loads((V / 'fonts' / 'ranges.json').read_text())


def font_faces():
    out = []
    for family, stem, weight, style, subsets in FONTS:
        for sub in subsets:
            f = V / 'fonts' / f'{stem}-{sub}-{weight}-{style}.woff2'
            data = base64.b64encode(f.read_bytes()).decode('ascii')
            out.append("@font-face{font-family:'%s';font-style:%s;font-weight:%d;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}"
                       % (family, style, weight, data, RANGES[sub]))
    return '\n'.join(out)


def read(p):
    return p.read_text(encoding='utf-8')


page = read(SRC / 'page.html')
parts = {
    'FONTS': font_faces(),
    'PAPERCSS': read(SRC / 'paper.css'),
    # Paged.js has one literal U+FFFD inside a string; written as an escape it means the same.
    'PAGED': read(V / 'paged.min.js').replace('\ufffd', '\\uFFFD'),
    'OSINT': read(V / 'osint-core.js'),
    'CORE': read(SRC / 'core.js'),
    'UI': read(SRC / 'ui.js'),
}
for name, val in parts.items():
    token = '/*' + name + '*/'
    assert page.count(token) == 1, name
    if name != 'FONTS':
        assert '</script' not in val.lower() and '</style' not in val.lower(), name + ' would close its tag early'
    page = page.replace(token, val)
(ROOT / 'index.html').write_text(page, encoding='utf-8')
print('index.html written,', len(page.encode('utf-8')), 'bytes')
