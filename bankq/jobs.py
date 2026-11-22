"""Background bulk-routing jobs for large file uploads.

Each job lives in data/jobs/<id>/ (input.csv, output.csv, job.json). Jobs run one at a time in a
background thread, and each job spreads its chunks over all CPU cores, so two uploads never fight
over the same cores. job.json survives restarts; a job interrupted by a restart is marked failed.

For several API servers, swap this for a shared queue (e.g. Celery or RQ with Redis) and object
storage for the files; the bulk engine itself stays the same.
"""

import json
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from . import bulk
from .config import get_settings

log = logging.getLogger("bankq.jobs")


def _now():
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    filename: str
    status: str = "queued"  # queued | running | done | failed
    created_at: str = field(default_factory=_now)
    started_at: str | None = None
    finished_at: str | None = None
    total: int = 0
    processed: int = 0
    summary: dict = field(default_factory=dict)
    error: str | None = None
    model_version: str | None = None
    text_column: str | None = None

    def public(self):
        d = asdict(self)
        d["progress"] = round(min(self.processed / self.total, 1.0), 4) if self.total else (1.0 if self.status == "done" else 0.0)
        return d


class JobManager:
    def __init__(self, root: Path | None = None):
        self.root = Path(root or get_settings().jobs_dir)
        self.root.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="bulk-job")
        self._load()

    def _load(self):
        for meta in sorted(self.root.glob("*/job.json")):
            try:
                job = Job(**json.loads(meta.read_text()))
            except Exception:
                continue
            if job.status in ("queued", "running"):
                job.status, job.error = "failed", "Interrupted by a server restart. Upload the file again."
                self._save(job)
            self.jobs[job.id] = job

    def dir(self, job_id: str) -> Path:
        return self.root / job_id

    def output_path(self, job_id: str) -> Path:
        return self.dir(job_id) / "output.csv"

    def _save(self, job: Job):
        (self.dir(job.id) / "job.json").write_text(json.dumps(asdict(job)))

    def new_job_dir(self) -> tuple[str, Path]:
        job_id = uuid.uuid4().hex[:12]
        path = self.dir(job_id)
        path.mkdir(parents=True)
        return job_id, path

    def submit(self, job_id: str, filename: str, text_column: str | None, model_version: str | None) -> Job:
        input_path = self.dir(job_id) / "input.csv"
        next(bulk.iter_chunks(input_path, 1, text_column), None)  # raises ValueError on a bad header
        job = Job(id=job_id, filename=filename, text_column=text_column, model_version=model_version,
                  total=bulk.count_rows(input_path))
        with self.lock:
            self.jobs[job_id] = job
        self._save(job)
        self.executor.submit(self._run, job)
        return job

    def _run(self, job: Job):
        job.status, job.started_at = "running", _now()
        self._save(job)
        last_save = [0.0]

        def progress(done, summary):
            job.processed, job.summary = done, summary
            if time.monotonic() - last_save[0] > 2:
                self._save(job)
                last_save[0] = time.monotonic()

        try:
            job.summary = bulk.run(self.dir(job.id) / "input.csv", self.output_path(job.id),
                                   text_column=job.text_column, progress=progress, version=job.model_version,
                                   total=job.total)
            job.processed = job.summary["rows"]
            job.total = max(job.total, job.processed)
            job.status = "done"
            log.info("bulk job finished", extra={"job": job.id, "rows": job.processed,
                                                 "rows_per_second": job.summary.get("rows_per_second")})
        except Exception as e:
            job.status, job.error = "failed", str(e)
            log.exception("bulk job failed", extra={"job": job.id})
        job.finished_at = _now()
        self._save(job)

    def get(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    def recent(self, limit=20) -> list[Job]:
        return sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)[:limit]
