"""Laya as a challenger model (https://huggingface.co/convaiinnovations/laya). Not used for routing.

Laya is an open-weights decision model: it reads a message plus a typed question and returns a
probability for every option in one forward pass. Here it is asked zero-shot (no training on our
data) which of our five categories a message belongs to, using the taxonomy's own descriptions.

It is integrated so it can be compared with the production model on the same test set
(``python -m bankq.ml.laya_eval``) and shown on the Model page. Routing stays on the production
model; nothing in the API loads Laya. Install it with ``pip install -e ".[laya]"``.
"""

from __future__ import annotations

import os

import numpy as np

from ..taxonomy import CATEGORIES

CHECKPOINT = "convaiinnovations/laya"


def _question():
    return {
        "category": {
            "type": "choice",
            "instructions": "Which banking team should handle this customer message?",
            "criteria": {c: info["description"] for c, info in CATEGORIES.items()},
        }
    }


class LayaClassifier:
    """Laya behind the same interface as our models: ``classes_`` and ``predict_proba(texts)``."""

    def __init__(self, checkpoint: str = CHECKPOINT, device: str | None = None):
        os.environ.setdefault("USE_TF", "0")  # the Laya docs: TensorFlow's runtime can hang model loading
        import laya  # optional dependency, imported only when the challenger is used

        kwargs = {"device": device} if device else {}
        self.agent = laya.load(checkpoint, **kwargs)
        self.checkpoint = checkpoint
        self.classes_ = np.array(list(CATEGORIES))
        self.question = _question()

    def _probs(self, answer) -> np.ndarray:
        dist = answer.get("probabilities") or answer.get("probs") or answer.get("distribution")
        if isinstance(dist, dict):
            p = np.array([float(dist.get(c, 0.0)) for c in self.classes_])
        else:  # only the choice and its confidence are reported
            p = np.zeros(len(self.classes_))
            p[list(self.classes_).index(answer["choice"])] = float(answer.get("confidence", 1.0))
        total = p.sum()
        return p / total if total > 0 else np.full(len(p), 1 / len(p))

    def predict_proba(self, texts, batch_size: int = 32) -> np.ndarray:
        results = self.agent.predict_batch([str(t) for t in texts], self.question, batch_size=batch_size)
        return np.vstack([self._probs(r["answers"]["category"]) for r in results])

    def predict(self, texts):
        return self.classes_[self.predict_proba(texts).argmax(axis=1)]
