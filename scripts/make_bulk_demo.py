"""Make a large demo file for bulk routing, built from real Banking77 test sentences.

About 10% of messages get personal details mixed in (card numbers, emails, phone numbers) so
masking is exercised too.

    python -m scripts.make_bulk_demo --n 1000000 --out data/bulk/demo_1m.csv
"""

import argparse
import csv
import random
from pathlib import Path

import pandas as pd

from bankq.config import get_settings
from bankq.data.loans import generate_loan_queries

PII = [
    "My card 4539 1488 0343 6467 ",
    "Please email me at alex.morgan@example.com. ",
    "Call me on 07700 900123. ",
    "Account number 12345678. ",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1_000_000)
    ap.add_argument("--out", default="data/bulk/demo_1m.csv")
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    pool = pd.read_csv(get_settings().raw_data_dir / "test.csv")["text"].tolist()
    pool += [t for t, _ in generate_loan_queries()[1]]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "text"])
        for i in range(args.n):
            text = rng.choice(pool)
            if rng.random() < 0.1:
                text = rng.choice(PII) + text
            w.writerow([f"MSG{i + 1:08d}", text])
    print(f"Wrote {args.n:,} messages to {out}")


if __name__ == "__main__":
    main()
