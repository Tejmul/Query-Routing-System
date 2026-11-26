"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { useApp } from "@/components/app-provider";
import { Panel, PageHead } from "@/components/page-head";
import { api, apiKey, directUrl, send, upload } from "@/lib/api";
import { bytes, pct } from "@/lib/format";
import { ORDER, type BatchResult, type Category, type Job } from "@/lib/types";
import { LiveRouting } from "./live-routing";

const EXAMPLES = [
  "There's a payment on my card I didn't make", "My card was skimmed at the ATM", "EMI on a 5 lakh home loan?",
  "My transfer hasn't arrived", "My father passed away, close his account", "The ATM swallowed my card",
  "I want to close my account", "What's the exchange rate for euros?", "My phone was stolen and it has my banking app on it",
  "How do I change my PIN?", "Is the interest rate on a personal loan fixed?", "I was charged twice for the same coffee",
  "Email me at sam@example.com, my loan repayment failed", "hello",
];

type Phase = { kind: "idle" } | { kind: "uploading"; progress: number; name: string } | { kind: "job"; job: Job; name: string } | { kind: "error"; msg: string; name?: string };

export function BatchView() {
  const { taxonomy, label, refreshBadge } = useApp();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [tickets, setTickets] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const poll = useRef<number>(0);

  useEffect(() => () => clearTimeout(poll.current), []);

  async function start() {
    if (file) return runJob(file);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return setPhase({ kind: "error", msg: "Add some messages or upload a file first." });
    setBusy(true);
    setPhase({ kind: "idle" });
    try {
      setBatch(await send<BatchResult>("/api/v1/classify/batch", "POST", { texts: lines, create_tickets: tickets }));
      if (tickets) refreshBadge();
    } catch (err) {
      setPhase({ kind: "error", msg: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function runJob(f: File) {
    clearTimeout(poll.current);
    setBatch(null);
    setBusy(true);
    setPhase({ kind: "uploading", progress: 0, name: f.name });
    try {
      const job = await upload<Job>("/api/v1/jobs", f, (p) => setPhase({ kind: "uploading", progress: p, name: f.name }));
      const tick = async () => {
        try {
          const j = await api<Job>(`/api/v1/jobs/${job.id}`);
          setPhase({ kind: "job", job: j, name: f.name });
          if (j.status === "failed") throw new Error(j.error ?? "The job failed.");
          if (j.status !== "done") poll.current = window.setTimeout(tick, 400);
          else setBusy(false);
        } catch (err) {
          setPhase({ kind: "error", msg: (err as Error).message, name: f.name });
          setBusy(false);
        }
      };
      tick();
    } catch (err) {
      setPhase({ kind: "error", msg: (err as Error).message, name: f.name });
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PageHead title="Bulk routing">
        Paste up to 1,000 messages for instant results, or drop a file of any size: millions of messages are routed in the background, live.
      </PageHead>

      <div className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="batch-text" className="mb-2 block text-[13px] font-medium">Messages, one per line</label>
          <textarea id="batch-text" rows={9} value={text} onChange={(e) => setText(e.target.value)} disabled={!!file}
            placeholder={"My card hasn’t arrived yet\nI want to close my account\nWhat is the interest rate on a car loan?"}
            className="input w-full disabled:opacity-50" />
        </div>
        <div className="flex flex-col gap-3.5">
          <label htmlFor="batch-file"
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
            className={`relative grid cursor-pointer justify-items-start gap-1 overflow-hidden rounded-xl border-[1.5px] border-dashed p-5 text-[13px] text-ink-3 transition-colors
              ${over ? "border-ink bg-surface-3" : "border-line-strong bg-surface-2 hover:border-ink-3"}`}>
            <input id="batch-file" type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <svg viewBox="0 0 24 24" className="mb-1 h-6 w-6 fill-none stroke-current text-ink-2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
            <span className="text-[15px] font-semibold text-ink">Drop a file of any size, or click to choose</span>
            <span>CSV with a <code className="font-mono">text</code> column (an <code className="font-mono">id</code> column is kept), or .txt with one message per line. Tested with 1,000,000 messages.</span>
            {file && (
              <span className="mt-1.5 inline-flex items-center gap-2 rounded-md bg-surface px-2 py-1 font-mono text-xs text-ink ring-1 ring-line">
                {file.name} · {bytes(file.size)}
                <button type="button" aria-label="Remove file" onClick={(e) => { e.preventDefault(); setFile(null); }} className="-m-1 grid h-6 w-6 place-items-center rounded text-ink-3 hover:text-ink"><svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg></button>
              </span>
            )}
          </label>
          <label className={`inline-flex items-center gap-2 text-[13px] text-ink-2 ${file ? "opacity-45" : ""}`}>
            <input type="checkbox" checked={tickets && !file} disabled={!!file} onChange={(e) => setTickets(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Create a ticket for each message
          </label>
          {file && <p className="text-xs text-ink-3">Files run as a bulk job and produce a results file to download, not tickets.</p>}
          <div className="mt-auto flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => { setText(EXAMPLES.join("\n")); setFile(null); }}>Load examples</button>
            <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
              {busy ? (phase.kind === "uploading" ? "Uploading…" : "Routing…") : "Route all"}
            </button>
          </div>
          {phase.kind === "error" && !phase.name && <p className="text-[13px] text-danger">{phase.msg}</p>}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {(phase.kind === "uploading" || phase.kind === "job" || (phase.kind === "error" && phase.name)) && (
          <motion.section key="job" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 grid gap-4">
            <MissionControl phase={phase} />
            {phase.kind === "job" && (phase.job.status === "running" || phase.job.status === "done") && (
              <LiveRouting key={phase.job.id} job={phase.job} running={phase.job.status === "running"} categories={taxonomy?.categories ?? null} />
            )}
            {phase.kind === "job" && phase.job.status === "done" && <JobResults job={phase.job} label={label} />}
          </motion.section>
        )}
      </AnimatePresence>

      {busy && phase.kind === "idle" && !batch && (
        <div className="card mt-6 p-5" role="status">
          <div className="mb-3 text-[13px] text-ink-2">Routing {text.split("\n").filter((l) => l.trim()).length.toLocaleString()} messages…</div>
          <div className="indeterminate" />
        </div>
      )}
      {batch && <InstantResults batch={batch} label={label} />}
    </Panel>
  );
}

/** The big header of a running job: giant live counter, progress ring, throughput and time left. */
function MissionControl({ phase }: { phase: Phase }) {
  const job = phase.kind === "job" ? phase.job : null;
  const s = job?.summary ?? {};
  const name = "name" in phase ? phase.name : "";
  const uploading = phase.kind === "uploading";
  const failed = phase.kind === "error";
  const progress = uploading ? phase.progress : job ? (job.status === "done" ? 1 : job.progress) : 0;
  const rate = s.rows_per_second ?? 0;
  const left = job && job.status === "running" && rate > 0 ? Math.max(0, (job.total - job.processed) / rate) : null;
  const status = failed ? (phase as { msg: string }).msg
    : uploading ? `Uploading ${pct(phase.progress)}`
    : job?.status === "queued" ? "Waiting for the previous job to finish…"
    : job?.status === "running" && !job.processed ? "Starting up: loading the model on every CPU core…"
    : job?.status === "running" ? `Routing at ${rate.toLocaleString()} messages per second${left != null ? ` · about ${Math.ceil(left)} s left` : ""}`
    : job?.status === "done" ? `Done in ${s.seconds} s on ${s.workers} CPU cores · model ${job.model_version}` : "";
  const counts = s.categories ?? ({} as Record<Category, number>);
  const waiting = !failed && !uploading && (job?.status === "queued" || (job?.status === "running" && !job.processed));

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs text-ink-3">{name}</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
            <AnimatedNumber value={s.routed ?? 0} className="font-display text-[46px] leading-none font-semibold tracking-[-0.03em] tabular sm:text-[64px]" />
            <span className="text-[17px] text-ink-3">of {(job?.total ?? 0).toLocaleString()} messages</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[26px] leading-none font-medium tabular">{pct(progress)}</div>
          <div className="eyebrow mt-1.5 text-[10px]">{uploading ? "uploaded" : "routed"}</div>
        </div>
        {job?.status === "done" && (
          <motion.a initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 26 }} className="btn btn-primary h-11 px-5"
            href={directUrl(`/api/v1/jobs/${job.id}/result`)}
            onClick={async (e) => {
              const key = apiKey();
              if (!key) return;
              e.preventDefault();
              const res = await fetch(directUrl(`/api/v1/jobs/${job.id}/result`), { headers: { "X-API-Key": key } });
              const url = URL.createObjectURL(await res.blob());
              Object.assign(document.createElement("a"), { href: url, download: `routed_${job.filename.replace(/\.[^.]+$/, "")}.csv` }).click();
              URL.revokeObjectURL(url);
            }}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>
            Download results
          </motion.a>
        )}
      </div>
      {/* Progress, split by where the messages went: the filled part is as long as the job is done. */}
      {waiting ? <div className="indeterminate mt-5 h-2.5 rounded-full" /> : (
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <motion.div className="flex h-full gap-px overflow-hidden rounded-full" initial={false} animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 70, damping: 20 }}>
            {failed ? <div className="flex-1 bg-danger" /> : uploading || !s.routed ? <div className="flex-1 bg-ink" />
              : ORDER.map((c) => <div key={c} className={`c-${c} bg-cat transition-[flex-grow] duration-500`} style={{ flexGrow: counts[c] ?? 0 }} title={`${c}: ${(counts[c] ?? 0).toLocaleString()}`} />)}
          </motion.div>
        </div>
      )}
      <div className={`mt-3 flex items-center gap-2 text-[13px] ${failed ? "text-danger" : "text-ink-2"}`} role={failed ? "alert" : undefined}>
        {job?.status === "running" && job.processed > 0 && <span className="live-dot" />}
        {status}
      </div>
    </div>
  );
}

function JobResults({ job, label }: { job: Job; label: (c: string) => string }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  useEffect(() => {
    api<{ rows: Record<string, string>[] }>(`/api/v1/jobs/${job.id}/preview?limit=50`).then((r) => setRows(r.rows)).catch(() => {});
  }, [job.id]);
  if (!rows) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="font-semibold">First 50 results</h2><span className="text-xs text-ink-3">The downloaded file has every message</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data">
          <thead><tr><th>Message (masked)</th><th>Category</th><th>Topic</th><th>Team</th><th className="num">Confidence</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const review = r.needs_review === "True";
              const cat = review ? "review" : r.category;
              return (
                <tr key={r.row}>
                  <td className="min-w-[260px]">{r.text_masked}</td>
                  <td><span className={`tag c-${cat}`}>{review ? `${label(r.category)}?` : label(r.category)}</span></td>
                  <td>{r.topic}</td>
                  <td>{r.department} {r.priority === "urgent" && <span className="badge badge-urgent ml-1">Urgent</span>}</td>
                  <td className={`num ${review ? "text-ink-3" : ""}`}>{pct(Number(r.confidence), 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function InstantResults({ batch, label }: { batch: BatchResult; label: (c: string) => string }) {
  const [filter, setFilter] = useState<string>("all");
  const { summary } = batch;
  const rows = batch.results.filter((r) => filter === "all" || (filter === "review" ? r.needs_review : r.category === filter));
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] font-semibold tracking-tight">{summary.total} messages routed
          <span className="ml-2 text-xs font-normal text-ink-3">{[summary.urgent && `${summary.urgent} urgent`, summary.needs_review && `${summary.needs_review} need review`].filter(Boolean).join(" · ")}</span>
        </h2>
      </div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {ORDER.filter((c) => summary.counts[c]).map((c) => (
          <motion.div key={c} className={`c-${c} bg-cat`} initial={{ flexGrow: 0 }} animate={{ flexGrow: summary.counts[c] }} transition={{ duration: 0.7 }} title={`${label(c)}: ${summary.counts[c]}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[["all", "All", summary.total], ...ORDER.filter((c) => summary.counts[c]).map((c) => [c, label(c), summary.counts[c as Category]]),
          ...(summary.needs_review ? [["review", "Needs review", summary.needs_review]] : [])].map(([k, l, n]) => (
          <button key={k as string} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k as string)}>
            {l} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Message (masked)</th><th>Category</th><th>Topic</th><th>Team</th><th className="num">Confidence</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const cat = r.needs_review ? "review" : r.category;
              return (
                <motion.tr key={`${r.text}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}>
                  <td className="min-w-[260px]">{r.text}{r.ticket_ref && <span className="ml-1.5 font-mono text-xs text-ink-3">{r.ticket_ref}</span>}</td>
                  <td><span className={`tag c-${cat}`}>{r.needs_review ? `${r.label}?` : r.label}</span></td>
                  <td>{r.intent?.label ?? "–"}</td>
                  <td>{r.department} {r.priority === "urgent" && <span className="badge badge-urgent ml-1">Urgent</span>}</td>
                  <td className={`num ${r.needs_review ? "text-ink-3" : ""}`}>{pct(r.confidence, 1)}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
