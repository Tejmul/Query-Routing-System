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

import logging

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
