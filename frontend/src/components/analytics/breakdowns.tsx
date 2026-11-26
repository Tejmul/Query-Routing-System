"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { capital, pctSoft } from "@/lib/format";
import { ORDER, type Category } from "@/lib/types";
import { GROW } from "./chart-kit";
import type { AnalyticsSummary } from "./types";

/** Hatched fill for the past-deadline part: texture, not colour alone. */
const HATCH = "repeating-linear-gradient(135deg, var(--danger) 0 2px, color-mix(in srgb, var(--danger) 16%, var(--surface)) 2px 5px)";
const share = (n: number, total: number) => (!total ? "–" : n ? pctSoft(n / total) : "0%");

export function TeamLoad({ rows, deptCategory, runKey }: {
  rows: AnalyticsSummary["open_by_department"]; deptCategory: Record<string, string>; runKey: number;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.map((d) => d.open));
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-ink-3">Nothing open. Every ticket in this window is resolved.</p>;
  return (
    <>
      <ul className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-[3px] bg-ink-2" aria-hidden="true" />Within deadline</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-[3px]" style={{ background: HATCH }} aria-hidden="true" />Past deadline</li>
      </ul>
      <ol className="flex flex-col gap-4">
        {rows.map((d, i) => {
          const ok = d.open - d.breached;
          const cat = deptCategory[d.department];
          return (
            <li key={d.department} aria-label={`${d.department}: ${d.open} open, ${d.breached} past deadline`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className={`min-w-0 truncate text-ink ${cat ? `tag c-${cat}` : ""}`}><span className="truncate">{d.department}</span></span>
                <span className="tabular flex-none text-ink-3">
                  <span className="font-semibold text-ink">{d.open.toLocaleString()}</span> open
                  {d.breached > 0 && <> · <span className="font-medium text-danger">{d.breached.toLocaleString()} late</span></>}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2">
                <motion.div key={runKey} className="flex h-full gap-[2px]" style={{ width: `${(d.open / max) * 100}%`, transformOrigin: "0 50%" }}
                  initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...GROW, delay: 0.2 + i * 0.06 }}>
                  {ok > 0 && <span className="h-full rounded-full bg-ink-2" style={{ flex: ok }} />}
                  {d.breached > 0 && <span className="h-full rounded-full" style={{ flex: d.breached, background: HATCH }} />}
                </motion.div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function CategoryMix({ mix, label, runKey }: { mix: Record<Category, number>; label: (c: string) => string; runKey: number }) {
  const reduce = useReducedMotion();
  const [focus, setFocus] = useState<Category | null>(null);
  const total = ORDER.reduce((s, c) => s + mix[c], 0);
  const parts = ORDER.filter((c) => mix[c] > 0);
  return (
    <div onPointerLeave={() => setFocus(null)}>
      <motion.div key={runKey} className="mb-5 flex h-2.5 gap-[2px] overflow-hidden rounded-full" style={{ transformOrigin: "0 50%" }}
        initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...GROW, delay: 0.2 }} aria-hidden="true">
        {parts.map((c) => (
          <span key={c} className={`c-${c} h-full bg-cat transition-opacity duration-200`}
            style={{ flex: mix[c], opacity: focus && focus !== c ? 0.25 : 1 }} />
        ))}
      </motion.div>
      <ul className="flex flex-col">
        {ORDER.map((c) => (
          <li key={c} onPointerEnter={() => setFocus(c)}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-[7px] text-[13px] transition-colors hover:bg-surface-2">
            <span className={`tag c-${c} min-w-0 flex-1 truncate text-ink`}>{label(c)}</span>
            <span className="tabular text-ink-3">{mix[c].toLocaleString()}</span>
            <span className="tabular w-11 text-right font-semibold text-ink">{share(mix[c], total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Channels({ channels, runKey }: { channels: Record<string, number>; runKey: number }) {
  const reduce = useReducedMotion();
  const rows = Object.entries(channels).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-ink-3">No channel data in this window.</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map(([name, n], i) => (
        <li key={name} className="grid grid-cols-[minmax(64px,auto)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-ink">{capital(name)}</span>
          <span className="h-1.5 rounded-full bg-surface-2">
            <motion.span key={runKey} className="block h-full rounded-full bg-ink-2" style={{ width: `${(n / max) * 100}%`, transformOrigin: "0 50%" }}
              initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...GROW, delay: 0.2 + i * 0.05 }} />
          </span>
          <span className="tabular whitespace-nowrap text-ink-3">
            {n.toLocaleString()} <span className="inline-block w-10 text-right font-semibold text-ink">{share(n, total)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const ARROW = (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-none text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);

export function Corrections({ rows, label }: { rows: AnalyticsSummary["top_corrections"]; label: (c: string) => string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) {
    return <p className="py-8 text-center text-[13px] text-ink-3">No corrections yet. Every routing in this window was left as the model chose.</p>;
  }
  const th = "bg-surface-2 px-3 py-2.5 text-left text-[12px] font-medium whitespace-nowrap text-ink-3 sm:px-4";
  const td = "border-t border-line px-3 py-3 align-middle sm:px-4";
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={th}>Model said<span className="sm:hidden"> → agent chose</span></th>
            <th className={`${th} hidden sm:table-cell`}>Agent chose</th>
            <th className={`${th} hidden w-[40%] md:table-cell`}><span className="sr-only">Relative volume</span></th>
            <th className={`${th} text-right`}>Tickets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.from}-${r.to}`} className="transition-colors hover:bg-[#fafbfc]">
              <td className={td}>
                <span className={`tag c-${r.from} text-ink`}>{label(r.from)}</span>
                <span className="mt-1.5 flex items-center gap-2 sm:hidden">
                  <span className="sr-only">changed to</span>{ARROW}<span className={`tag c-${r.to} text-ink`}>{label(r.to)}</span>
                </span>
              </td>
              <td className={`${td} hidden sm:table-cell`}>
                <span className="inline-flex items-center gap-2">
                  {ARROW}
                  <span className={`tag c-${r.to} text-ink`}>{label(r.to)}</span>
                </span>
              </td>
              <td className={`${td} hidden md:table-cell`} aria-hidden="true">
                <span className="block h-1.5 rounded-full bg-surface-2">
                  <motion.span className="block h-full rounded-full bg-ink-3" style={{ width: `${(r.count / max) * 100}%`, transformOrigin: "0 50%" }}
                    initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...GROW, delay: 0.25 + i * 0.05 }} />
                </span>
              </td>
              <td className={`${td} tabular text-right font-semibold text-ink`}>{r.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
