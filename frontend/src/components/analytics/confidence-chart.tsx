"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { pctSoft } from "@/lib/format";
import { ChartTip, fmtTick, GROW, niceTicks, TipRow, topRounded, useSize } from "./chart-kit";

const MIN_H = 236, T = 34, B = 28;

/** Histogram of top-category confidence, with the manual-review threshold marked. */
export function ConfidenceChart({ bins, threshold, runKey }: {
  bins: { bin: string; count: number }[]; threshold: number | undefined; runKey: number;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const H = Math.max(MIN_H, height);
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();

  const total = bins.reduce((s, b) => s + b.count, 0);
  const { top, ticks } = niceTicks(Math.max(0, ...bins.map((b) => b.count)));
  const L = 12 + fmtTick(top).length * 7;
  const plotW = Math.max(0, width - L);
  const band = plotW / bins.length;
  const bw = Math.max(4, Math.min(40, band - 6));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const base = y(0);
  const tx = threshold == null ? null : L + plotW * threshold;
  const below = (i: number) => threshold != null && (i + 1) / bins.length <= threshold + 1e-9;
  const range = (i: number) => `${Math.round((i / bins.length) * 100)}–${Math.round(((i + 1) / bins.length) * 100)}%`;
  const showTick = (i: number) => band >= 34 || i % 2 === 0;

  return (
    <div ref={ref} className="relative min-h-[236px] flex-1" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} style={{ position: "absolute", inset: 0 }} role="img" aria-label="Distribution of model confidence across tickets" className="block overflow-visible">
          {tx != null && <rect x={L} y={T - 26} width={tx - L} height={base - T + 26} rx={8} fill="var(--surface-2)" />}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--border)"} />
              <text x={L - 10} y={y(t) + 4} textAnchor="end" className="tabular fill-ink-3 text-[11px]">{fmtTick(t)}</text>
            </g>
          ))}
          {hover != null && <rect x={L + hover * band + 1} y={T - 4} width={band - 2} height={base - T + 4} rx={6} fill="var(--surface-3)" opacity={0.7} />}
          {bins.map((b, i) => {
            const h = b.count ? Math.max(2, base - y(b.count)) : 0;
            return (
              <motion.path key={`${runKey}-${i}`} d={topRounded(L + i * band + (band - bw) / 2, base - h, bw, h)}
                fill={below(i) ? "var(--review)" : "var(--accent)"} fillOpacity={below(i) ? 0.55 : 0.9}
                initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ ...GROW, delay: 0.2 + i * 0.04 }}
                style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }} />
            );
          })}
          {Array.from({ length: bins.length + 1 }, (_, i) => showTick(i) && (
            <text key={i} x={L + i * band} y={H - 8} textAnchor={i === 0 ? "start" : i === bins.length ? "end" : "middle"}
              className="tabular fill-ink-3 text-[11px]">{Math.round((i / bins.length) * 100)}%</text>
          ))}
          {tx != null && (
            <g>
              <line x1={tx} x2={tx} y1={T - 26} y2={base} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="4 3" />
              <circle cx={tx} cy={T - 26} r={3} fill="var(--text)" />
              <text x={tx - 9} y={T - 14} textAnchor="end" className="fill-ink-2 text-[11.5px] font-medium">Manual review below {Math.round(threshold! * 100)}%</text>
              <text x={tx + 9} y={T - 14} className="fill-ink-2 text-[11.5px] font-medium">Auto-routed</text>
            </g>
          )}
          {bins.map((b, i) => (
            <rect key={i} x={L + i * band} y={T - 4} width={band} height={base - T + 4} fill="transparent" tabIndex={0}
              aria-label={`Confidence ${range(i)}: ${b.count} tickets`} className="outline-none"
              onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          ))}
        </svg>
      )}
      <ChartTip at={hover == null ? null : { x: L + hover * band + band / 2, y: T, id: String(hover) }} width={width} gap={band / 2 + 4}>
        {hover != null && (
          <>
            <div className="mb-1.5 border-b border-line pb-1.5 text-ink-2">Confidence {range(hover)}</div>
            <TipRow label="Tickets" value={bins[hover].count.toLocaleString()} />
            <TipRow label="Share of all" value={!total ? "–" : bins[hover].count ? pctSoft(bins[hover].count / total) : "0%"} />
            {threshold != null && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: below(hover) ? "var(--review)" : "var(--accent)" }} />
                {below(hover) ? "Sent to manual review" : "Auto-routed"}
              </p>
            )}
          </>
        )}
      </ChartTip>
    </div>
  );
}
