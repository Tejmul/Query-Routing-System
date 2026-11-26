"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { ORDER } from "@/lib/types";
import { ChartTip, dayLabel, fmtTick, GROW, niceTicks, TipRow, topRounded, useSize } from "./chart-kit";
import type { DayRow } from "./types";

const MIN_H = 260, T = 10, B = 28, GAP = 2;

/** Stacked columns of tickets per day, one segment per final category. */
export function DailyChart({ days, label, runKey }: { days: DayRow[]; label: (c: string) => string; runKey: number }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const H = Math.max(MIN_H, height);
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();

  const totals = days.map((d) => ORDER.reduce((s, c) => s + d[c], 0));
  const { top, ticks } = niceTicks(Math.max(0, ...totals));
  const L = 12 + fmtTick(top).length * 7;
  const plotW = Math.max(0, width - L);
  const band = plotW / Math.max(1, days.length);
  const bw = Math.max(3, Math.min(24, band * 0.62));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotW / 62))));
  const cx = (i: number) => L + i * band + band / 2;

  const tip = hover == null ? null : { x: cx(hover), y: T, id: days[hover].date };

  return (
    <div ref={ref} className="relative min-h-[260px] flex-1" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} style={{ position: "absolute", inset: 0 }} role="img" aria-label="Tickets per day, stacked by category" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--border)"} />
              <text x={L - 10} y={y(t) + 4} textAnchor="end" className="tabular fill-ink-3 text-[11px]">{fmtTick(t)}</text>
            </g>
          ))}
          {hover != null && <rect x={L + hover * band + 1} y={T - 4} width={Math.max(0, band - 2)} height={H - T - B + 4} rx={6} fill="var(--surface-2)" />}
          {days.map((d, i) => {
            const x = cx(i) - bw / 2;
            const drawn = ORDER.filter((c) => d[c] > 0);
            let acc = 0;
            return (
              <motion.g key={`${runKey}-${d.date}`} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                transition={{ ...GROW, delay: 0.15 + i * (0.5 / days.length) }} style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
                {drawn.map((c, j) => {
                  const bottom = y(acc) - (j > 0 ? GAP : 0);
                  acc += d[c];
                  const topY = y(acc);
                  const h = Math.max(1, bottom - topY);
                  const isTop = j === drawn.length - 1;
                  return isTop
                    ? <path key={c} d={topRounded(x, bottom - h, bw, h)} fill={`var(--${c})`} />
                    : <rect key={c} x={x} y={bottom - h} width={bw} height={h} fill={`var(--${c})`} />;
                })}
              </motion.g>
            );
          })}
          {days.map((d, i) => i % every === 0 && (
            <text key={d.date} x={cx(i)} y={H - 8} textAnchor="middle" className="tabular fill-ink-3 text-[11px]">{dayLabel(d.date)}</text>
          ))}
          {days.map((d, i) => (
            <rect key={d.date} x={L + i * band} y={0} width={band} height={H - B} fill="transparent" tabIndex={0}
              aria-label={`${dayLabel(d.date, { weekday: "long", month: "long", day: "numeric" })}: ${totals[i]} tickets`}
              className="cursor-default outline-none" onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          ))}
        </svg>
      )}
      <ChartTip at={tip} width={width} gap={band / 2 + 6}>
        {hover != null && (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-4 border-b border-line pb-1.5">
              <span className="text-ink-2">{dayLabel(days[hover].date, { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="tabular font-semibold text-ink">{totals[hover].toLocaleString()} <span className="font-normal text-ink-3">total</span></span>
            </div>
            {[...ORDER].reverse().map((c) => (
              <TipRow key={c} swatch={`c-${c}`} label={label(c)} value={days[hover][c].toLocaleString()} muted={!days[hover][c]} />
            ))}
          </>
        )}
      </ChartTip>
    </div>
  );
}

export function DailyTable({ days, label }: { days: DayRow[]; label: (c: string) => string }) {
  return (
    <div className="min-h-[300px] flex-1 basis-0 overflow-auto rounded-xl border border-line [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]">
      <table className="data">
        <thead>
          <tr><th>Date</th>{ORDER.map((c) => <th key={c} className="num">{label(c)}</th>)}<th className="num">Total</th></tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.date}>
              <td className="whitespace-nowrap">{dayLabel(d.date, { weekday: "short", month: "short", day: "numeric" })}</td>
              {ORDER.map((c) => <td key={c} className="num tabular">{d[c].toLocaleString()}</td>)}
              <td className="num tabular font-semibold text-ink">{ORDER.reduce((s, c) => s + d[c], 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CategoryLegend({ label }: { label: (c: string) => string }) {
  return (
    <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2" aria-label="Legend">
      {ORDER.map((c) => (
        <li key={c} className={`c-${c} inline-flex items-center gap-1.5`}>
          <span className="h-2.5 w-2.5 rounded-[3px] bg-cat" aria-hidden="true" />{label(c)}
        </li>
      ))}
    </ul>
  );
}
