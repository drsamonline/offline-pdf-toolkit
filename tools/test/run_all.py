#!/usr/bin/env python3
"""Run every browser suite against the built app and summarise.

    python tools/test/run_all.py            # all of them
    python tools/test/run_all.py app3 app7  # only these

Needs Chromium (set CHROME to its path if it is not on PATH) and websocket-client.
The suites drive the real page over the DevTools protocol, so they test the app a
user gets, not a model of it.
"""
import glob
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


def main(argv):
    only = [a for a in argv if not a.startswith("-")]
    files = sorted(glob.glob(os.path.join(HERE, "test_app*.py")))
    if only:
        files = [f for f in files if any(o in os.path.basename(f) for o in only)]
    if not files:
        print("no suites matched")
        return 1
    if not os.path.exists(os.path.join(REPO, "docs", "play", "index.html")):
        print("docs/play/index.html is missing — build the app first (pipeline/build_pdf.py)")
        return 1
    failures = []
    for f in files:
        name = os.path.basename(f)
        print("\n=== %s ===" % name)
        r = subprocess.run([sys.executable, f], cwd=REPO)
        if r.returncode != 0:
            failures.append(name)
    print("\n%d suite(s) run, %d failed%s"
          % (len(files), len(failures), (": " + ", ".join(failures)) if failures else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
