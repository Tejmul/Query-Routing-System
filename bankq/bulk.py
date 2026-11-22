"""Bulk routing for very large files: millions of messages, streamed from disk in chunks.

Each chunk goes through one forward pass (text features computed once, both model heads scored
from them) and the business rules are applied as array operations over the whole chunk instead of
one message at a time. Chunks are spread over CPU cores, and only a few are in memory at once, so
file size is limited by disk, not RAM.

    python -m bankq.bulk messages.csv -o routed.csv
    python -m bankq.bulk messages.csv -o routed.csv --workers 4 --chunk-size 20000 --text-column body

Input: a CSV with a header (column `text`, `query` or `message`, or name it with --text-column; an
`id` column is copied through), or a .txt file with one message per line.
"""

import csv
import logging
import multiprocessing as mp
import os
import time
from collections import Counter, deque
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from .config import get_settings
from .ml.predictor import Predictor
from .routing.pii import redact
from .routing.rules import RuleSet
from .taxonomy import CATEGORIES, INTENT_TO_CATEGORY, PRIORITY_RANK, REVIEW_DEPARTMENT, REVIEW_SLA_HOURS, intent_label

log = logging.getLogger("bankq.bulk")

TEXT_COLUMNS = ("text", "query", "message")
OUTPUT_COLUMNS = ["row", "id", "text_masked", "pii", "category", "department", "priority", "sla_hours",
                  "confidence", "model_category", "needs_review", "secondary_category", "topic",
                  "topic_confidence", "rules"]
RANK_TO_PRIORITY = {v: k for k, v in PRIORITY_RANK.items()}


class BulkRouter:
    """The Router's decision logic, applied to a whole chunk of messages with array operations.

    Must make exactly the same decisions as Router.route_many (tests/test_bulk.py checks this).
    """

    def __init__(self, predictor: Predictor, rules: RuleSet):
        self.predictor = predictor
        self.rules = rules
        self.cats = predictor.categories
        self.fraud = self.cats.index("fraud")
        self.labels = np.array([CATEGORIES[c]["label"] for c in self.cats], dtype=object)
        self.departments = np.array([CATEGORIES[c]["department"] for c in self.cats], dtype=object)
        self.rank = np.array([PRIORITY_RANK[CATEGORIES[c]["priority"]] for c in self.cats])
        self.sla = np.array([CATEGORIES[c]["sla_hours"] for c in self.cats], dtype=float)
        # member[c, i] is True when sub-intent i belongs to category c.
        self.member = np.array([[INTENT_TO_CATEGORY.get(i) == c for i in predictor.intents] for c in self.cats])
        self.intent_labels = np.array([intent_label(i) for i in predictor.intents], dtype=object)

    @classmethod
    def from_settings(cls, version: str | None = None) -> "BulkRouter":
        return cls(Predictor(version=version), RuleSet.from_yaml(get_settings().rules_path))

    @property
    def model_version(self):
        return self.predictor.version

    def route(self, raw_texts) -> pd.DataFrame:
        rules = self.rules
        redacted = [redact(str(t).strip()) for t in raw_texts]
        texts = [t for t, _ in redacted]
        n = len(texts)
        cat_p, int_p = self.predictor.score(texts)  # one forward pass for the whole chunk

        # The per-message router compares probabilities rounded to 4 places; match it exactly.
        probs = np.round(cat_p, 4)
        model_idx = cat_p.argmax(axis=1)
        conf = cat_p[np.arange(n), model_idx]

        # Fraud safety net: strong phrases always escalate; weak words need some model support.
        hits = [rules.fraud_keyword(t) for t in texts]
        hit = np.array([h is not None for h in hits])
        strong = np.array([bool(h and h[1]) for h in hits])
        escalate = hit & (model_idx != self.fraud) & (strong | (probs[:, self.fraud] >= rules.fraud_min_probability))
        cat_idx = np.where(escalate, self.fraud, model_idx)
        confidence = np.where(escalate, probs[:, self.fraud], conf)

        needs_review = (confidence < rules.review_threshold) & ~escalate
        rank = np.where(needs_review, PRIORITY_RANK["normal"], self.rank[cat_idx])
        overrides = [rules.priority_override(t) for t in texts]
        o_rank = np.array([PRIORITY_RANK[o[0]] if o else 99 for o in overrides])
        raised = o_rank < rank
        rank = np.where(raised, o_rank, rank)

        # Secondary category: the most likely other category, if it clears the threshold.
        others = np.where(np.arange(len(self.cats)) == cat_idx[:, None], -1.0, probs)
        sec_idx = others.argmax(axis=1)
        has_sec = others[np.arange(n), sec_idx] >= rules.secondary_threshold

        sla = np.where(needs_review & (rank != PRIORITY_RANK["urgent"]), REVIEW_SLA_HOURS, self.sla[cat_idx])
        sla = np.where(rank == PRIORITY_RANK["urgent"], np.minimum(sla, 1),
                       np.where(rank == PRIORITY_RANK["high"], np.minimum(sla, 8), sla))

        # Topic: the most likely sub-intent within the routed category.
        masked = np.where(self.member[cat_idx], int_p, -1.0)
        top = masked.argmax(axis=1)

        fired = []
        for i in range(n):
            names = []
            if escalate[i]:
                names.append("fraud_escalation")
            if needs_review[i]:
                names.append("low_confidence")
            if raised[i]:
                names.append(overrides[i][1])
            fired.append(";".join(names))

        cats = np.array(self.cats, dtype=object)
        return pd.DataFrame({
            "text_masked": texts,
            "pii": [";".join(p) for _, p in redacted],
            "category": cats[cat_idx],
            "department": np.where(needs_review, REVIEW_DEPARTMENT, self.departments[cat_idx]),
            "priority": [RANK_TO_PRIORITY[r] for r in rank],
            "sla_hours": sla,
            "confidence": np.round(confidence, 4),
            "model_category": cats[model_idx],
            "needs_review": needs_review,
            "secondary_category": np.where(has_sec, cats[sec_idx], ""),
            "topic": self.intent_labels[top],
            "topic_confidence": np.round(int_p[np.arange(n), top], 4),
            "rules": fired,
        })


# ---------- File streaming ----------

def _text_column(columns, wanted):
    if wanted:
        if wanted not in columns:
            raise ValueError(f"Column {wanted!r} not found. Columns: {', '.join(columns)}")
        return wanted
    lowered = {c.strip().lower(): c for c in columns}
    for name in TEXT_COLUMNS:
        if name in lowered:
            return lowered[name]
    raise ValueError(f"No text column found. Name one of {TEXT_COLUMNS}, or pass --text-column. "
                     f"Columns: {', '.join(columns)}")


def iter_chunks(path, chunk_size=20000, text_column=None):
    """Yield DataFrames with columns row, id, text. Row numbers are 1-based data rows."""
    path = Path(path)
    row = 0
    if path.suffix.lower() == ".txt":
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            buf = []
            for line in f:
                buf.append(line.rstrip("\n"))
                if len(buf) == chunk_size:
                    yield pd.DataFrame({"row": range(row + 1, row + 1 + len(buf)), "id": "", "text": buf})
                    row += len(buf)
                    buf = []
            if buf:
                yield pd.DataFrame({"row": range(row + 1, row + 1 + len(buf)), "id": "", "text": buf})
        return
    header = pd.read_csv(path, nrows=0, encoding="utf-8-sig").columns.tolist()
    col = _text_column(header, text_column)
    id_col = next((c for c in header if c.strip().lower() == "id"), None)
    usecols = [col] + ([id_col] if id_col else [])
    for df in pd.read_csv(path, usecols=usecols, chunksize=chunk_size, dtype=str, keep_default_na=False,
                          encoding="utf-8-sig", on_bad_lines="skip"):
        out = pd.DataFrame({"row": range(row + 1, row + 1 + len(df)),
                            "id": df[id_col].to_numpy() if id_col else "", "text": df[col].to_numpy()})
        row += len(df)
        yield out


def count_rows(path):
    """Number of messages, for progress bars. CSV rows are counted with a real CSV parser, because a
    quoted message can contain line breaks (about a second per million rows)."""
    if Path(path).suffix.lower() == ".txt":
        with open(path, "rb") as f:
            return sum(buf.count(b"\n") for buf in iter(lambda: f.read(1 << 20), b""))
    with open(path, encoding="utf-8-sig", errors="replace", newline="") as f:
        return max(sum(1 for _ in csv.reader(f)) - 1, 0)


# ---------- Workers ----------

_worker_router: BulkRouter | None = None


def _init_worker(version):
    global _worker_router
    logging.disable(logging.INFO)
    _worker_router = BulkRouter.from_settings(version)


def route_frame(chunk: pd.DataFrame, router: BulkRouter) -> pd.DataFrame:
    """Route one chunk (columns row, id, text); empty messages are skipped."""
    keep = chunk["text"].astype(str).str.strip() != ""
    part = chunk[keep]
    routed = router.route(part["text"].tolist()) if len(part) else pd.DataFrame(columns=OUTPUT_COLUMNS[2:])
    routed.insert(0, "id", part["id"].to_numpy())
    routed.insert(0, "row", part["row"].to_numpy())
    return routed[OUTPUT_COLUMNS]


def _route_chunk(chunk: pd.DataFrame, router: BulkRouter | None = None):
    """Route a chunk and return (csv_text, tallies). Formatting and counting happen here, in the
    worker, so the parent process only writes text and the work spreads across all cores."""
    routed = route_frame(chunk, router or _worker_router)
    rules = Counter()
    for r in routed["rules"]:
        if r:
            rules.update(r.split(";"))
    tallies = {"rows": len(chunk), "routed": len(routed), "urgent": int((routed["priority"] == "urgent").sum()),
               "needs_review": int(routed["needs_review"].sum()),
               "categories": routed["category"].value_counts().to_dict(), "rules": dict(rules)}
    return routed.to_csv(header=False, index=False, lineterminator="\n"), tallies


def default_workers():
    return max(1, min(os.cpu_count() or 1, get_settings().bulk_workers or (os.cpu_count() or 1)))


def run(input_path, output_path, workers=None, chunk_size=None, text_column=None, progress=None, version=None,
        total=None):
    """Route every message in input_path and write the results to output_path (CSV).

    progress(processed_rows, summary_so_far) is called after each chunk. Pass total (the row count) to
    avoid starting more worker processes than there are chunks. Returns the final summary.
    """
    s = get_settings()
    workers = workers or default_workers()
    chunk_size = chunk_size or s.bulk_chunk_size
    if total is not None:  # a small file shouldn't pay for starting eight processes
        workers = max(1, min(workers, -(-total // chunk_size)))
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = output_path.with_suffix(output_path.suffix + ".part")

    counts, rules, start = Counter(), Counter(), time.perf_counter()
    summary = {"rows": 0, "routed": 0, "skipped_empty": 0, "urgent": 0, "needs_review": 0}

    def consume(result, writer_state):
        text, t = result
        writer_state["f"].write(text)
        summary["rows"] += t["rows"]
        summary["routed"] += t["routed"]
        summary["skipped_empty"] += t["rows"] - t["routed"]
        summary["urgent"] += t["urgent"]
        summary["needs_review"] += t["needs_review"]
        counts.update(t["categories"])
        rules.update(t["rules"])
        if progress:
            progress(summary["rows"], _finish(summary, counts, rules, start, workers))

    chunks = iter_chunks(input_path, chunk_size, text_column)
    try:
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(",".join(OUTPUT_COLUMNS) + "\n")
            state = {"f": f}
            if workers == 1:
                router = BulkRouter.from_settings(version)
                for chunk in chunks:
                    consume(_route_chunk(chunk, router), state)
            else:
                # spawn is safe from threads (the API runs jobs in a thread). Unlike multiprocessing.Pool,
                # a worker that dies makes the job fail with BrokenProcessPool instead of hanging.
                ctx = mp.get_context("spawn")
                with ProcessPoolExecutor(workers, mp_context=ctx, initializer=_init_worker, initargs=(version,)) as pool:
                    pending = deque()  # bounded, so only a few chunks are in memory at once
                    for chunk in chunks:
                        pending.append(pool.submit(_route_chunk, chunk))
                        if len(pending) >= workers * 2:
                            consume(pending.popleft().result(), state)
                    while pending:
                        consume(pending.popleft().result(), state)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(output_path)
    return _finish(summary, counts, rules, start, workers)


def _finish(summary, counts, rules, start, workers):
    seconds = time.perf_counter() - start
    return {**summary, "categories": {c: counts.get(c, 0) for c in CATEGORIES}, "rules": dict(rules),
            "seconds": round(seconds, 2), "rows_per_second": round(summary["rows"] / seconds) if seconds else None,
            "workers": workers}
