"use client";

import { useInView } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// Time only: how long each model takes, from the speeds measured by `python -m bankq.ml.laya_eval`.
// The race runs in real time: each counter advances at that model's measured messages per second.

interface Speed { messages_per_second: number; single_message_ms: number; load_seconds?: number }
interface Report { production: Speed; laya: Speed; test_rows: number }

const RACE_S = 10;
const BULK_1M_S = 19.3; // our model, measured: 1,000,000 messages on 8 CPU cores (Bulk routing)
const OURS_LOAD_S = 1.6; // our model, measured: Python imports plus loading model.joblib

export function useSpeeds() {
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api<{ challengers: (Report & { challenger: string })[] }>("/api/v1/model/challengers")
      .then((r) => live && setReport(r.challengers.find((c) => c.challenger === "laya") ?? null))
      .catch(() => live && setReport(null));
    return () => { live = false; };
  }, []);
  return report;
}

export function duration(s: number) {
  if (s < 1) return `${(s * 1000).toFixed(s < 0.01 ? 1 : 0)} ms`;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  if (s < 86400 * 2) return `${(s / 3600).toFixed(1)} hours`;
  return `${(s / 86400).toFixed(1)} days`;
}

export function TimeRace({ report }: { report: Report }) {
  const oursRate = report.production.messages_per_second;
  const layaRate = report.laya.messages_per_second;
  const [t, setT] = useState(0); // seconds elapsed, real time
  const raf = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box, { once: true, amount: 0.5 });

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const step = () => {
      const s = (performance.now() - start) / 1000;
      setT(Math.min(s, RACE_S));
      if (s < RACE_S) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (seen) play();
    return () => cancelAnimationFrame(raf.current);
  }, [seen, play]);

  const lanes = [
    { name: "Our model", sub: "TF-IDF + Logistic Regression, one CPU core", rate: oursRate, tone: "bg-brand", big: "text-ink" },
    { name: "Laya", sub: "ModernBERT-large, 421M parameters, on the GPU", rate: layaRate, tone: "bg-[#8b93a7]", big: "text-ink-2" },
  ];
  const lead = oursRate * t || 1;

  return (
    <div ref={box} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Race: {RACE_S} seconds, real time</h2>
          <p className="mt-0.5 text-xs text-ink-3">Messages each model routes in the same time, at its measured speed. Nothing is sped up.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] tabular text-ink-2">{t.toFixed(1)} s / {RACE_S} s</span>
          <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={play}>Replay ↻</button>
        </div>
      </div>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {lanes.map((l) => {
          const done = Math.floor(l.rate * t);
          return (
            <li key={l.name} className="rounded-xl border border-line p-4">
              <div className="text-[13px]"><b className="font-semibold">{l.name}</b></div>
              <div className="text-xs text-ink-3">{l.sub}</div>
              <div className={`mt-3 font-mono text-[34px] leading-none font-semibold tracking-tight tabular ${l.big}`}>{done.toLocaleString()}</div>
              <div className="mt-1 text-xs text-ink-3">messages routed</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className={`h-full rounded-full ${l.tone}`} style={{ width: `${Math.min(100, (l.rate * t / lead) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-[13px] text-ink-2">
        In the time Laya routes one message, our model routes about <b className="font-semibold text-ink">{Math.round(oursRate / layaRate).toLocaleString()}</b>.
      </p>
    </div>
  );
}

export function TimeTable({ report }: { report: Report }) {
  const o = report.production, l = report.laya;
  const rows = [
    { what: "One message", hint: "the live API answers one message at a time", ours: o.single_message_ms / 1000, laya: l.single_message_ms / 1000 },
    { what: "1,000,000 messages", hint: "our model: Bulk routing on 8 CPU cores; Laya: batches at its measured speed", ours: BULK_1M_S, laya: 1e6 / l.messages_per_second },
  ];
  return (
    <div className="card overflow-x-auto">
      <table className="data w-full min-w-[520px] text-[13px]">
        <thead><tr><th className="text-left">Time to route</th><th className="text-right">Our model</th><th className="text-right">Laya</th><th className="text-right">Difference</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.what}>
              <td className="py-3"><div className="font-medium text-ink">{r.what}</div><div className="text-xs text-ink-3">{r.hint}</div></td>
              <td className="py-3 text-right font-mono font-semibold text-ink">{duration(r.ours)}</td>
              <td className="py-3 text-right font-mono text-ink-2">{duration(r.laya)}</td>
              <td className="py-3 text-right font-mono text-ink-3">{Math.round(r.laya / r.ours).toLocaleString()}× longer</td>
            </tr>
          ))}
          {l.load_seconds != null && (
            <tr>
              <td className="py-3"><div className="font-medium text-ink">Start-up</div><div className="text-xs text-ink-3">loading the model into memory</div></td>
              <td className="py-3 text-right font-mono font-semibold text-ink">{duration(OURS_LOAD_S)}</td>
              <td className="py-3 text-right font-mono text-ink-2">{duration(l.load_seconds)}</td>
              <td className="py-3 text-right font-mono text-ink-3">{Math.round(l.load_seconds / OURS_LOAD_S)}× longer</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-xs text-ink-3">
        Measured on this laptop (Apple M2; Laya on its GPU).
      </p>
    </div>
  );
}
