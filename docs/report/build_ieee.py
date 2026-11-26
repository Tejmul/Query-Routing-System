"""Render docs/report/ieee.html to docs/report/Routing_Desk_IEEE_Report.pdf (IEEE conference layout).

    /Users/tejmul/Desktop/NLP/.venv/bin/python docs/report/build_ieee.py
    /Users/tejmul/Desktop/NLP/.venv/bin/python docs/report/build_ieee.py --png OUT_DIR   # also render pages to PNG
"""

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "ieee.html"
OUTPUT = HERE / "Routing_Desk_IEEE_Report.pdf"

# IEEE conference margins (US Letter): 0.75 in top, 1 in bottom, 0.625 in sides -> 7.25 in text width.
MARGIN = {"top": "0.75in", "bottom": "0.9in", "left": "0.625in", "right": "0.625in"}


def build(source=SOURCE, output=OUTPUT):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page()
        page.goto(source.as_uri(), wait_until="networkidle")
        page.emulate_media(media="print")
        page.evaluate("document.fonts.ready")
        # ieee.html paginates itself (columns, floats, balanced last page) once images have loaded.
        page.wait_for_function("window.__layoutDone === true", timeout=120000)
        page.evaluate("window.__paginate()")  # lay out again under print media
        page.pdf(path=str(output), format="Letter", print_background=True, margin=MARGIN)
        browser.close()
    return output


def to_png(pdf, out_dir, zoom=1.5):
    import pymupdf

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf)
    for i, pg in enumerate(doc, 1):
        pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(out_dir / f"page-{i}.png")
    return len(doc)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", help="also render each page to PNG in this directory")
    args = ap.parse_args()
    pdf = build()
    print(f"wrote {pdf}")
    if args.png:
        print(f"{to_png(pdf, args.png)} pages rendered to {args.png}")
