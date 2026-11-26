"""Render docs/presentation/slides.html to docs/presentation/Routing_Desk_Presentation.pdf.

Usage:
    .venv/bin/python docs/presentation/build_slides.py            # build the PDF
    .venv/bin/python docs/presentation/build_slides.py --png DIR  # also save one PNG per slide (2x)
"""

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
HTML = HERE / "slides.html"
PDF = HERE / "Routing_Desk_Presentation.pdf"
EXPECTED_SLIDES = 10


def check_layout(page) -> list[str]:
    """Return problems: slides with content overflowing or images that failed to load."""
    return page.evaluate(
        """() => {
        const problems = [];
        document.querySelectorAll('img').forEach(img => {
            if (!img.complete || img.naturalWidth === 0) problems.push('broken image: ' + img.getAttribute('src'));
        });
        document.querySelectorAll('.slide').forEach((s, i) => {
            const box = s.getBoundingClientRect();
            s.querySelectorAll('*').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) return;
                if (r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.top < box.top - 0.5) {
                    problems.push(`slide ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> outside slide`);
                }
                if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow === 'hidden') {
                    problems.push(`slide ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> clips content`);
                }
            });
        });
        return problems;
    }"""
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--png", type=Path, help="also save each slide as a PNG into this folder")
    args = parser.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        page.goto(HTML.as_uri(), wait_until="load")
        page.emulate_media(media="print")

        n = page.locator(".slide").count()
        if n != EXPECTED_SLIDES:
            print(f"expected {EXPECTED_SLIDES} slides, found {n}", file=sys.stderr)
            return 1
        problems = check_layout(page)
        for msg in problems:
            print("WARNING", msg, file=sys.stderr)

        if args.png:
            args.png.mkdir(parents=True, exist_ok=True)
            for i in range(n):
                page.locator(".slide").nth(i).screenshot(path=str(args.png / f"slide_{i + 1:02d}.png"))

        page.pdf(
            path=str(PDF),
            width="13.333in",
            height="7.5in",
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        )
        browser.close()

    print(f"wrote {PDF}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
