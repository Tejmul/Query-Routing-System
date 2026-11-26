"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { ORDER } from "@/lib/types";
import { Figure, GROW, rise, stagger } from "./chart-kit";
import type { AnalyticsSummary } from "./types";

function Tile({ label, value, sub, foot }: { label: string; value: ReactNode; sub: ReactNode; foot?: ReactNode }) {
  return (
    <motion.div variants={rise} className="card card-hover flex min-w-0 flex-col p-4 sm:p-5">
      <p className="truncate text-[12.5px] font-medium text-ink-2">{label}</p>
      <p className="mt-2.5 text-[26px] leading-none font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-2 truncate text-xs text-ink-3">{sub}</p>
      <div className="mt-auto pt-4">{foot ?? <span className="block h-1" />}</div>
    </motion.div>
  );
}

/** Thin meter: the fill carries the state; the track is a pale step of the same hue. */
function Meter({ value, color, label }: { value: number; color: string; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-1 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
      role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <motion.div className="h-full rounded-full" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, background: color, transformOrigin: "0 50%" }}
        initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...GROW, delay: 0.35 }} />
    </div>
  );
}

/** Daily totals as a tiny line, in the accent, with a 10% wash. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="block h-1" />;
  const max = Math.max(1, ...values);
  const W = 100, H = 24;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 4)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="-mt-2 block h-6 w-full" aria-hidden="true">
      <path d={`${line}L${W},${H}L0,${H}Z`} fill="var(--accent)" fillOpacity={0.1} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const pctFig = (x: number | null) => (x == null ? "–" : <Figure value={x * 100} format="pct" />);

export function KpiRow({ data }: { data: AnalyticsSummary }) {
  const k = data.kpis;
  const daily = data.by_day.map((d) => ORDER.reduce((s, c) => s + d[c], 0));
  return (
    <motion.div variants={stagger} className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile label="Tickets" value={<Figure value={k.tickets} format="int" />} sub={`last ${data.window_days} days`} foot={<Spark values={daily} />} />
      <Tile label="Auto-routed" value={pctFig(k.auto_routed_rate)} sub="no manual review"
        foot={k.auto_routed_rate != null && <Meter value={k.auto_routed_rate} color="var(--accent)" label="Auto-routed rate" />} />
      <Tile label="Corrected by agents" value={pctFig(k.reroute_rate)} sub="moved to another team"
        foot={k.reroute_rate != null && <Meter value={k.reroute_rate} color="var(--text-2)" label="Corrected by agents" />} />
      <Tile label="Open past deadline" value={<Figure value={k.open_sla_breached} format="int" />} sub={`of ${k.open.toLocaleString()} open`}
        foot={<Meter value={k.open ? k.open_sla_breached / k.open : 0} color="var(--danger)" label="Share of open tickets past deadline" />} />
      <Tile label="Closed on time" value={pctFig(k.sla_met_rate)} sub={k.sla_met_rate == null ? "nothing resolved yet" : "of resolved tickets"}
        foot={k.sla_met_rate != null && <Meter value={k.sla_met_rate} color="var(--ok)" label="Closed on time" />} />
      <Tile label="Routing time" value={k.latency_p95_ms == null ? "–" : <Figure value={k.latency_p95_ms} format="ms" />}
        sub={k.latency_p50_ms == null ? "95th percentile" : `p95 · median ${k.latency_p50_ms.toLocaleString()} ms`} />
    </motion.div>
  );
}
