#!/usr/bin/env python3
"""Generate the sample PDFs used by the demo and by the screenshots.

Committed as docs/assets/sample-*.pdf — the landing page loads them into the
embedded app so a first-time visitor sees the toolkit doing real work, and the
screenshots are taken with them loaded. Regenerate with:

    python3 tools/make_samples.py

Hand-written PDF 1.4 (no dependencies): Helvetica/Helvetica-Bold, A4, real text.
The content is obviously synthetic so a screenshot can never look like a real
patient record.
"""
import os, shutil, zlib

W, H = 595.0, 842.0
M = 62.0

BODY = [
    "This is a sample document generated for the toolkit's demo. It contains no real",
    "information. Its only job is to give the page grid something to render, so the",
    "screenshots and the live demo show the application doing actual work rather than",
    "sitting on an empty drop zone.",
    "",
    "Each page carries a running header, a rule, a title and a block of text, which is",
    "enough to see how thumbnails crop, how rotation behaves, and how a watermark or a",
    "page number lands on the finished sheet.",
]

PARA2 = [
    "Everything the application does happens inside the browser tab. The file is read",
    "into memory, the pages are rearranged with pdf-lib, and the result is handed back",
    "to the download prompt by the browser itself. There is no upload step because",
    "there is no server to upload to.",
]


def esc(s):
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def text_lines(lines, x, y, size, leading, bold=False, gray=None):
    out = []
    font = "F2" if bold else "F1"
    if gray is not None:
        out.append("%.3f %.3f %.3f rg" % gray)
    out.append("BT /%s %.2f Tf %.2f TL %.2f %.2f Td" % (font, size, leading, x, y))
    for i, ln in enumerate(lines):
        if i:
            out.append("T*")
        out.append("(%s) Tj" % esc(ln))
    out.append("ET")
    if gray is not None:
        out.append("0 0 0 rg")
    return out


def page_stream(title, kicker, page_no, total, extra_body=None):
    s = []
    # header
    s += text_lines([kicker], M, H - M, 8, 10, bold=True, gray=(0.45, 0.45, 0.45))
    s += ["0.80 0.80 0.80 RG 0.6 w %.2f %.2f m %.2f %.2f l S" % (M, H - M - 12, W - M, H - M - 12)]
    # title
    s += text_lines([title], M, H - M - 52, 21, 26, bold=True)
    s += text_lines(["Prepared for the Offline PDF Toolkit demo"], M, H - M - 74, 10, 12, gray=(0.4, 0.4, 0.4))
    # body
    y = H - M - 120
    s += text_lines(BODY, M, y, 10.5, 16.5, gray=(0.15, 0.15, 0.15))
    y2 = y - 16.5 * len(BODY) - 22
    if extra_body:
        s += text_lines(extra_body, M, y2, 10.5, 16.5, gray=(0.15, 0.15, 0.15))
        y2 -= 16.5 * len(extra_body) + 22
    s += text_lines(PARA2, M, y2, 10.5, 16.5, gray=(0.15, 0.15, 0.15))
    # a light table block
    ty = y2 - 16.5 * len(PARA2) - 30
    s += ["0.90 0.90 0.90 RG 0.7 w %.2f %.2f %.2f %.2f re S" % (M, ty - 74, W - 2 * M, 74)]
    s += ["0.90 0.90 0.90 RG 0.7 w %.2f %.2f m %.2f %.2f l S" % (M, ty - 26, W - M, ty - 26)]
    s += text_lines(["Field", "Value"], M + 12, ty - 18, 9.5, 12, bold=True)
    s += text_lines(["Reference", "SAMPLE-%02d" % page_no], M + 12, ty - 44, 9.5, 13, gray=(0.2, 0.2, 0.2))
    s += text_lines(["Status", "Demonstration only"], M + 240, ty - 44, 9.5, 13, gray=(0.2, 0.2, 0.2))
    s += text_lines(["Page %d of %d" % (page_no, total)], W - M - 70, M - 18, 9, 11, gray=(0.45, 0.45, 0.45))
    return "\n".join(s)


def build(path, kicker, titles, extra=None):
    total = len(titles)
    objs = []
    # 1 catalog, 2 pages, 3 font, 4 font-bold
    kids = " ".join("%d 0 R" % (5 + 2 * i) for i in range(total))
    objs.append("<< /Type /Catalog /Pages 2 0 R >>")
    objs.append("<< /Type /Pages /Count %d /Kids [%s] >>" % (total, kids))
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    for i, t in enumerate(titles):
        content = page_stream(t, kicker, i + 1, total, extra)
        data = zlib.compress(content.encode("latin-1"))
        objs.append(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.0f %.0f] "
            "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>"
            % (W, H, 6 + 2 * i)
        )
        objs.append("<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(data))
        # stream body appended separately below
    # rebuild properly with byte payloads
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    payloads = {}
    for i, t in enumerate(titles):
        payloads[6 + 2 * i] = zlib.compress(page_stream(t, kicker, i + 1, total, extra).encode("latin-1"))
    for n in range(1, len(objs) + 1):
        offsets.append(len(out))
        body = objs[n - 1]
        out += ("%d 0 obj\n" % n).encode()
        if n in payloads:
            d = payloads[n]
            out += ("<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(d)).encode()
            out += d + b"\nendstream"
        else:
            out += body.encode()
        out += b"\nendobj\n"
    xref = len(out)
    out += ("xref\n0 %d\n" % (len(objs) + 1)).encode()
    out += b"0000000000 65535 f \n"
    for o in offsets:
        out += ("%010d 00000 n \n" % o).encode()
    out += (
        "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    ).encode()
    with open(path, "wb") as fh:
        fh.write(bytes(out))
    return len(out)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    a = build(os.path.join(root, "docs/assets/sample-discharge-summary.pdf"),
              "SAMPLE DOCUMENT  ·  NOT REAL PATIENT DATA",
              ["Discharge summary", "Course in hospital", "Advice on discharge"])
    b = build(os.path.join(root, "docs/assets/sample-lab-report.pdf"),
              "SAMPLE DOCUMENT  ·  NOT REAL PATIENT DATA",
              ["Laboratory report", "Reference ranges"])
    # the root deployment serves the same assets from ./assets
    for n in ("sample-discharge-summary.pdf", "sample-lab-report.pdf"):
        shutil.copyfile(os.path.join(root, "docs/assets", n), os.path.join(root, "assets", n))
    print("wrote sample-discharge-summary.pdf", a, "bytes")
    print("wrote sample-lab-report.pdf", b, "bytes")

def build_photo_sample(path):
    """A page whose bytes are almost all one JPEG.

    It exists to make a point measurable rather than arguable: on a file like
    this, a lossless pass has nothing to win, because the image is already
    compressed. The picture is a synthetic colour grid — a test pattern, not a
    photograph — so no real person or place is implied.
    """
    import io, random
    import pymupdf
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (1400, 1000))
    d = ImageDraw.Draw(im)
    random.seed(3)
    for y in range(0, 1000, 32):
        for x in range(0, 1400, 32):
            d.rectangle([x, y, x + 32, y + 32],
                        fill=(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)))
    for _ in range(4000):                      # speckle, so the JPEG has real detail to carry
        d.point((random.randint(0, 1399), random.randint(0, 999)))
    import tempfile
    fd, jpg = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    im.save(jpg, "JPEG", quality=95)
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((56, 62), "Photograph page", fontsize=17, color=(0.08, 0.07, 0.05))
    page.insert_text((56, 82), "One image, one caption — the case where a lossless pass cannot help.",
                     fontsize=8.5, color=(0.35, 0.32, 0.28))
    page.insert_image(pymupdf.Rect(56, 100, 539, 700), filename=jpg)
    os.remove(jpg)
    page.insert_text((56, 725), "SAMPLE DOCUMENT  ·  NOT REAL PATIENT DATA", fontsize=7.5,
                     color=(0.45, 0.42, 0.38))
    doc.save(path)
    print("wrote", path, os.path.getsize(path), "bytes")

def build_uncompressed_sample(path):
    """A page written with the streams left uncompressed.

    This is the other half of the compression story: a file whose producer did
    not deflate properly. It is the case where the lossless pass pays, and the
    shipped demo PDFs are all written deflated, so without this there would be
    nothing to measure against.
    """
    import pymupdf
    doc = pymupdf.open()
    for i in range(3):
        page = doc.new_page(width=595, height=842)
        page.insert_text((60, 100), "Uncompressed report page %d" % (i + 1), fontsize=18)
        for y in range(140, 760, 16):
            page.insert_text((60, y), "Line %d of body text that has to survive compression intact, "
                             "with enough repetition to make a stream worth deflating." % y, fontsize=9)
    doc.save(path, deflate=False, garbage=0, clean=False)
    print("wrote", path, os.path.getsize(path), "bytes")

def build_outline_sample(path):
    """Four pages with a bookmark for each — the shape 'split by bookmark' needs."""
    import pymupdf
    doc = pymupdf.open()
    titles = ["Cover", "Findings", "Plan", "Appendix"]
    for i, t in enumerate(titles):
        page = doc.new_page(width=595, height=842)
        page.insert_text((56, 90), t, fontsize=22)
        page.insert_text((56, 120), "Section %d of the sample document." % (i + 1), fontsize=10)
        page.insert_text((56, 760), "SAMPLE DOCUMENT  ·  NOT REAL PATIENT DATA", fontsize=7.5,
                         color=(0.45, 0.42, 0.38))
    doc.set_toc([[1, titles[i], i + 1] for i in range(len(titles))])
    doc.save(path)
    print("wrote", path, os.path.getsize(path), "bytes")
