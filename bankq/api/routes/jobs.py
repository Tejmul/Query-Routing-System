import shutil

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from ...config import get_settings
from ..deps import get_router, require_api_key

router = APIRouter(prefix="/api/v1/jobs", tags=["bulk jobs"], dependencies=[Depends(require_api_key)])


def _jobs(request: Request):
    return request.app.state.jobs


def _job_or_404(request: Request, job_id: str):
    job = _jobs(request).get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found.")
    return job


@router.post("", status_code=202, summary="Upload a file of any size for bulk routing")
async def create_job(request: Request, file: UploadFile = File(...), text_column: str | None = Form(None),
                     router_=Depends(get_router)):
    """Accepts a CSV (column `text`, `query` or `message`, or name it in `text_column`) or a .txt file
    with one message per line. Returns a job to poll; download the results when it is done."""
    limit = get_settings().max_upload_mb * 1024 * 1024
    jobs = _jobs(request)
    job_id, path = jobs.new_job_dir()
    written = 0
    suffix = ".txt" if (file.filename or "").lower().endswith(".txt") else ".csv"
    target = path / f"upload{suffix}"
    try:
        with open(target, "wb") as out:
            while chunk := await file.read(1 << 20):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(413, f"File is larger than {get_settings().max_upload_mb} MB.")
                out.write(chunk)
        if suffix == ".txt":  # store as a one-column CSV so every job reads the same way
            with open(target, encoding="utf-8-sig", errors="replace") as src:
                pd.DataFrame({"text": [line.rstrip("\n") for line in src]}).to_csv(path / "input.csv", index=False)
            target.unlink()
        else:
            target.rename(path / "input.csv")
        if written == 0:
            raise HTTPException(422, "The file is empty.")
        job = jobs.submit(job_id, file.filename or "upload", text_column or None, router_.model_version)
    except HTTPException:
        shutil.rmtree(path, ignore_errors=True)
        raise
    except ValueError as e:
        shutil.rmtree(path, ignore_errors=True)
        raise HTTPException(422, str(e)) from e
    return job.public()


@router.get("")
def list_jobs(request: Request):
    return {"jobs": [j.public() for j in _jobs(request).recent()]}


@router.get("/{job_id}")
def get_job(request: Request, job_id: str):
    return _job_or_404(request, job_id).public()


@router.get("/{job_id}/preview", summary="First rows of a finished job's results")
def preview(request: Request, job_id: str, limit: int = 50):
    job = _job_or_404(request, job_id)
    if job.status != "done":
        raise HTTPException(409, f"Job is {job.status}.")
    df = pd.read_csv(_jobs(request).output_path(job_id), nrows=max(1, min(limit, 500)), dtype=str, keep_default_na=False)
    return {"columns": list(df.columns), "rows": df.to_dict(orient="records")}


@router.get("/{job_id}/result", summary="Download the routed results as CSV")
def result(request: Request, job_id: str):
    job = _job_or_404(request, job_id)
    if job.status != "done":
        raise HTTPException(409, f"Job is {job.status}.")
    name = job.filename.rsplit(".", 1)[0] or "messages"
    return FileResponse(_jobs(request).output_path(job_id), media_type="text/csv", filename=f"routed_{name}.csv")
