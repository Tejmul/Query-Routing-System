"""Bulk routing must make exactly the same decisions as the per-message router, at any scale."""

import pandas as pd
import pytest

from bankq.bulk import BulkRouter
from bankq.config import get_settings
from bankq.ml.predictor import Predictor
from bankq.routing.router import Router
from bankq.routing.rules import RuleSet

RULE_CASES = [
    "My card was skimmed at the ATM",
    "My father passed away and I need to close his account",
    "hello",
    "Card 4539 1488 0343 6467 is blocked",
    "there is a payment I didn't make",
    "I'm locked out and someone logged in from a new device",
    "I will be going to the ombudsman about my refund",
    "Email me at sam@example.com, my loan repayment failed",
    "how do I report fraud on a loan application",
]


@pytest.fixture(scope="module")
def routers():
    pred = Predictor()
    rules = RuleSet.from_yaml(get_settings().rules_path)
    return Router(pred, rules), BulkRouter(pred, rules)


def test_bulk_matches_router_decision_for_decision(routers):
    router, bulk_router = routers
    texts = pd.read_csv(get_settings().raw_data_dir / "test.csv")["text"].sample(600, random_state=3).tolist() + RULE_CASES
    expected = router.route_many(texts)
    got = bulk_router.route(texts)
    for d, (_, r) in zip(expected, got.iterrows()):
        assert r["text_masked"] == d["text"]
        assert r["pii"] == ";".join(d["pii_redacted"])
        assert r["category"] == d["category"] and r["model_category"] == d["model_category"]
        assert r["department"] == d["department"] and r["priority"] == d["priority"]
        assert float(r["sla_hours"]) == float(d["sla_hours"])
        assert bool(r["needs_review"]) == d["needs_review"]
        assert float(r["confidence"]) == d["confidence"]
        assert r["secondary_category"] == (d["secondary_category"] or "")
        assert r["topic"] == d["intent"]["label"]
        assert r["rules"] == ";".join(x["rule"] for x in d["rules_applied"])
