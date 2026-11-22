"""Bulk routing must make exactly the same decisions as the per-message router, at any scale."""

import time

import pandas as pd
import pytest

from bankq import bulk
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


def _write(path, rows):
    pd.DataFrame(rows, columns=["id", "text"]).to_csv(path, index=False)


def test_run_streams_a_file_and_keeps_row_numbers(tmp_path):
    rows = [(f"M{i}", t) for i, t in enumerate(RULE_CASES * 120)] + [("EMPTY", "   ")]
    rows.insert(5, ("multi", "first line\nsecond line about my card"))  # quoted line break
    src, out = tmp_path / "in.csv", tmp_path / "out.csv"
    _write(src, rows)
    assert bulk.count_rows(src) == len(rows)
    seen = []
    s = bulk.run(src, out, workers=1, chunk_size=200, progress=lambda done, _: seen.append(done))
    df = pd.read_csv(out, dtype=str, keep_default_na=False)
    assert list(df.columns) == bulk.OUTPUT_COLUMNS
    assert s["rows"] == len(rows) and s["routed"] == len(rows) - 1 and s["skipped_empty"] == 1
    assert sum(s["categories"].values()) == s["routed"]
    assert seen == sorted(seen) and seen[-1] == len(rows)
    assert df["id"].iloc[0] == "M0" and "EMPTY" not in set(df["id"])
    assert df.loc[df["id"] == "multi", "row"].item() == "6"
    assert not (tmp_path / "out.csv.part").exists()


def test_text_file_and_unknown_column(tmp_path):
    txt = tmp_path / "in.txt"
    txt.write_text("my card was stolen\nwhat is the exchange rate\n")
    s = bulk.run(txt, tmp_path / "o.csv", workers=1)
    assert s["routed"] == 2
    bad = tmp_path / "bad.csv"
    pd.DataFrame({"body": ["x"]}).to_csv(bad, index=False)
    with pytest.raises(ValueError, match="No text column"):
        bulk.run(bad, tmp_path / "o2.csv", workers=1)
    assert bulk.run(bad, tmp_path / "o3.csv", workers=1, text_column="body")["routed"] == 1


def test_parallel_workers_give_identical_output(tmp_path):
    src = tmp_path / "in.csv"
    _write(src, [(f"M{i}", t) for i, t in enumerate(RULE_CASES * 150)])
    bulk.run(src, tmp_path / "one.csv", workers=1, chunk_size=300)
    bulk.run(src, tmp_path / "two.csv", workers=2, chunk_size=300)
    assert (tmp_path / "one.csv").read_bytes() == (tmp_path / "two.csv").read_bytes()


def _wait(client, job_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        if job["status"] in ("done", "failed"):
            return job
        time.sleep(0.2)
    raise AssertionError("job did not finish")


def test_jobs_api_end_to_end(client):
    messages = ["my card was stolen", "loan interest rate"] * 600
    csv_bytes = ("id,text\n" + "".join(f"{i},{t}\n" for i, t in enumerate(messages))).encode()
    r = client.post("/api/v1/jobs", files={"file": ("big.csv", csv_bytes, "text/csv")})
    assert r.status_code == 202
    job = _wait(client, r.json()["id"])
    assert job["status"] == "done" and job["processed"] == 1200 and job["progress"] == 1.0
    assert job["summary"]["categories"]["fraud"] == 600 and job["summary"]["categories"]["loans"] == 600
    prev = client.get(f"/api/v1/jobs/{job['id']}/preview", params={"limit": 5}).json()
    assert len(prev["rows"]) == 5 and prev["rows"][0]["category"] == "fraud"
    res = client.get(f"/api/v1/jobs/{job['id']}/result")
    assert res.status_code == 200 and res.text.count("\n") == 1201
    assert any(j["id"] == job["id"] for j in client.get("/api/v1/jobs").json()["jobs"])


def test_jobs_api_rejects_bad_files(client):
    r = client.post("/api/v1/jobs", files={"file": ("x.csv", b"body\nhello\n", "text/csv")})
    assert r.status_code == 422 and "No text column" in r.json()["detail"]
    assert client.post("/api/v1/jobs", files={"file": ("e.csv", b"", "text/csv")}).status_code == 422
    assert client.get("/api/v1/jobs/nope").status_code == 404
