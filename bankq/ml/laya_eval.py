"""Compare Laya (zero-shot) with the production model on the same held-out test set.

    python -m bankq.ml.laya_eval                 # every test message (3,192)
    python -m bankq.ml.laya_eval --limit 800     # a stratified sample, for a quicker run

Both models see exactly the same masked messages and are scored with the same metrics. The result is
written to reports/challengers/laya.json, which the API serves at /api/v1/model/challengers and the
Model page shows. Routing is not changed.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support

from ..config import get_settings
from ..routing.pii import redact
from .laya_challenger import CHECKPOINT, LayaClassifier
from .predictor import Predictor
from .registry import ModelRegistry


def challengers_dir() -> Path:
    return get_settings().reports_dir / "challengers"


def _scores(y_true, y_pred, classes):
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=classes, zero_division=0)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, labels=classes, average="macro", zero_division=0)), 4),
        "misclassified": int((np.asarray(y_true) != np.asarray(y_pred)).sum()),
        "per_class": {c: {"precision": round(float(p[i]), 4), "recall": round(float(r[i]), 4),
                          "f1": round(float(f[i]), 4), "support": int(s[i])} for i, c in enumerate(classes)},
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=classes).tolist(),
    }


def _timed(fn, texts):
    start = time.perf_counter()
    out = fn(texts)
    return out, time.perf_counter() - start


def _single_latency_ms(fn, texts, n=50):
    """Median time to answer one message on its own, the way the live API is called."""
    times = []
    for t in texts[:n]:
        start = time.perf_counter()
        fn([t])
        times.append((time.perf_counter() - start) * 1000)
    return round(float(np.median(times)), 2)


def run(limit: int | None = None, seed: int = 42, device: str | None = None):
    test = pd.read_csv(get_settings().processed_data_dir / "test.csv")
    total_rows = len(test)
    if limit and limit < len(test):
        picked = [g.sample(max(1, round(limit * len(g) / len(test))), random_state=seed).index
                  for _, g in test.groupby("category")]
        test = test.loc[[i for idx in picked for i in idx]].reset_index(drop=True)
    texts = [redact(str(t))[0] for t in test["text"]]  # exactly what the router feeds the model
    y = test["category"].to_numpy()

    registry = ModelRegistry()
    ours = Predictor(registry)
    version = ours.version
    classes = list(ours.categories)

    ours_p, ours_s = _timed(lambda x: ours.score(x)[0], texts)
    ours_pred = np.array(ours.categories)[ours_p.argmax(axis=1)]

    print(f"Loading Laya ({CHECKPOINT})…", flush=True)
    t0 = time.perf_counter()
    laya = LayaClassifier(device=device)
    load_s = time.perf_counter() - t0
    print(f"Scoring {len(texts):,} messages with Laya…", flush=True)
    laya_p = np.zeros((len(texts), len(classes)))
    start = time.perf_counter()
    for i in range(0, len(texts), 100):
        chunk = laya.predict_proba(texts[i:i + 100])
        laya_p[i:i + len(chunk)] = chunk[:, [list(laya.classes_).index(c) for c in classes]]
        done = i + len(chunk)
        rate = done / (time.perf_counter() - start)
        print(f"  {done:,}/{len(texts):,}  {rate:.1f} msg/s", flush=True)
    laya_s = time.perf_counter() - start
    laya_pred = np.array(classes)[laya_p.argmax(axis=1)]

    def sample_rows(mask, k=8):
        idx = np.flatnonzero(mask)[:k]
        return [{"text": texts[i], "truth": y[i], "ours": ours_pred[i], "laya": laya_pred[i],
                 "ours_confidence": round(float(ours_p[i].max()), 4), "laya_confidence": round(float(laya_p[i].max()), 4)}
                for i in idx]

    report = {
        "challenger": "laya",
        "label": "Laya (zero-shot)",
        "checkpoint": CHECKPOINT,
        "about": "Open-weights decision model (ModernBERT-large, 421M parameters, Apache 2.0). Asked zero-shot "
                 "which of our five categories each message belongs to, using the taxonomy's descriptions. "
                 "It was not trained on our data.",
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "test_rows": len(texts),
        "full_test_set": not limit or limit >= total_rows,
        "classes": classes,
        "production": {
            "label": ours.model_name, "version": version, "trained_on_our_data": True,
            "parameters": None, "size_mb": round(sum(f.stat().st_size for f in registry.path(version).glob("*.joblib")) / 1e6, 1),
            **_scores(y, ours_pred, classes),
            "messages_per_second": round(len(texts) / ours_s, 1),
            "single_message_ms": _single_latency_ms(lambda x: ours.score(x), texts),
        },
        "laya": {
            "label": "Laya", "version": CHECKPOINT, "trained_on_our_data": False,
            "parameters": 421_000_000, "size_mb": 808,
            **_scores(y, laya_pred, classes),
            "messages_per_second": round(len(texts) / laya_s, 2),
            "single_message_ms": _single_latency_ms(laya.predict_proba, texts, n=20),
            "load_seconds": round(load_s, 1),
        },
        "agreement": round(float((ours_pred == laya_pred).mean()), 4),
        "only_ours_right": int(((ours_pred == y) & (laya_pred != y)).sum()),
        "only_laya_right": int(((laya_pred == y) & (ours_pred != y)).sum()),
        "both_wrong": int(((laya_pred != y) & (ours_pred != y)).sum()),
        "examples": {
            "laya_right_ours_wrong": sample_rows((laya_pred == y) & (ours_pred != y)),
            "ours_right_laya_wrong": sample_rows((ours_pred == y) & (laya_pred != y)),
        },
    }
    out = challengers_dir() / "laya.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=str))
    return report, out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="score a stratified sample of this many test messages")
    ap.add_argument("--device", default=None, help="cpu, mps or cuda (default: Laya's choice)")
    args = ap.parse_args()
    r, out = run(args.limit, device=args.device)
    for key in ("production", "laya"):
        m = r[key]
        print(f"{m['label']:<22} accuracy {m['accuracy']:.2%}  macro F1 {m['macro_f1']:.4f}  "
              f"fraud recall {m['per_class']['fraud']['recall']:.2%}  {m['messages_per_second']:,} msg/s")
    print(f"Agreement {r['agreement']:.1%} on {r['test_rows']:,} messages. Saved {out}")


if __name__ == "__main__":
    main()
