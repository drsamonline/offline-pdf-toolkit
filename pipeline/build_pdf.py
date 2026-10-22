#!/usr/bin/env python3
"""Build the single-file Offline PDF Toolkit.

Inlines pdf-lib (UMD), pdf.js (UMD) and the pdf.js worker into one HTML file so
the whole tool works from a USB stick with no network.
"""
import os, re, sys

HERE = '/scratch/work/pdf'
TPL = os.path.join(HERE, 'app_template.html')
LANDING = os.path.join(HERE, 'pipeline/landing.html')
REPO = os.path.join(HERE, 'repo')
OUT = os.path.join(HERE, 'pdf_toolkit.html')
VERSION = '1.1.2'

LIBS = {
    '__PDFLIB__':    os.path.join(HERE, 'lib/cantoo-pdf-lib.min.js'),
    '__PDFJS__':     os.path.join(HERE, 'lib/pdf.min.js'),
    '__PDFWORKER__': os.path.join(HERE, 'lib/pdf.worker.min.js'),
}


def minify_css(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};:,])\s*', r'\1', css)
    return css.replace(';}', '}').strip()


def minify_js(js):
    js = re.sub(r'/\*.*?\*/', '', js, flags=re.S)
    js = re.sub(r'(?m)^\s*//.*$', '', js)
    js = re.sub(r'(?m)^[ \t]+', '', js)
    js = re.sub(r'\n{2,}', '\n', js)
    return js.strip()


def minify_html(h):
    h = re.sub(r'(?m)^[ \t]+', '', h)
    return re.sub(r'\n{2,}', '\n', h)


def main():
    for ph, path in LIBS.items():
        if not os.path.exists(path):
            sys.exit('missing library: %s' % path)
    tpl = open(TPL, encoding='utf-8').read()
    for ph in LIBS:
        if ph not in tpl:
            sys.exit('placeholder %s missing from template' % ph)

    before = len(tpl)
    style = re.search(r'<style>(.*?)</style>', tpl, re.S)
    appjs = re.search(r'<script>\n"use strict";(.*?)</script>', tpl, re.S)
    html = tpl
    if style:
        html = html.replace(style.group(1), minify_css(style.group(1)), 1)
    if appjs:
        html = html.replace('"use strict";' + appjs.group(1), '"use strict";' + minify_js(appjs.group(1)), 1)
    html = minify_html(html)
    after = len(html)

    for ph, path in LIBS.items():
        code = open(path, encoding='utf-8').read()
        assert '</script' not in code, '%s contains </script — needs escaping' % path
        html = html.replace(ph, code, 1)

    html = html.replace('<title>', '<meta name="app-version" content="%s">\n<title>' % VERSION, 1)
    open(OUT, 'w', encoding='utf-8').write(html)

    print('app code    : %d -> %d bytes (-%d)' % (before, after, before - after))
    for ph, path in LIBS.items():
        print('  inline %-14s %8d bytes  %s' % (ph, os.path.getsize(path), os.path.basename(path)))
    print('output      : %.2f MB -> %s' % (len(html) / 1048576, OUT))

    # the landing page is one source; the build emits both copies, minified
    land = open(LANDING, encoding='utf-8').read()
    ls = re.search(r'<style>(.*?)</style>', land, re.S)
    lj = re.search(r'<script>(.*?)</script>', land, re.S)
    if ls:
        land = land.replace(ls.group(1), minify_css(ls.group(1)), 1)
    if lj:
        land = land.replace(lj.group(1), minify_js(lj.group(1)), 1)
    land = minify_html(land)
    open(os.path.join(REPO, 'index.html'), 'w', encoding='utf-8').write(land)
    open(os.path.join(REPO, 'docs/index.html'), 'w', encoding='utf-8').write(
        land.replace('href="app.html"', 'href="play/"'))
    print('landing     : %d -> %d bytes, written to repo/index.html + repo/docs/index.html'
          % (len(open(LANDING, encoding='utf-8').read()), len(land)))


if __name__ == '__main__':
    main()
