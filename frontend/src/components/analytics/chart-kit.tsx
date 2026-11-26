"use client";

// Small building blocks shared by the analytics charts. Kept local to this folder on purpose.

import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type Variants } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

/** Staggered entrance: the parent orchestrates, each card rises in. */
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 30 } },
};

/** Ease used for bars growing from their baseline. */
export const GROW = { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const };

/**
 * Measures an element's content box with a ResizeObserver, so SVG charts render at real pixels
 * (text never scales). Put the SVG inside absolutely so it can't hold the box open.
 */
export function useSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === Math.floor(width) && s.height === Math.floor(height) ? s : { width: Math.floor(width), height: Math.floor(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}

/** Clean integer ticks from 0 to a rounded top value. */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return { top: count, ticks: Array.from({ length: count + 1 }, (_, i) => i) };
  const raw = max / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return { top, ticks };
}

export const fmtTick = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}K` : v.toLocaleString());

/** SVG path for a bar with 4px rounded data-end and a square baseline. */
export function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + h}Z`;
}

export const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${iso}T00:00`).toLocaleDateString([], opts);

/** Card with a title row. Animates in as part of the parent's stagger. */
export function ChartCard({ title, sub, aside, children, className = "" }: {
  title: string; sub?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <motion.section variants={rise} className={`card flex min-w-0 flex-col p-4 sm:p-6 ${className}`}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}
        </div>
        {aside}
      </header>
      {children}
    </motion.section>
  );
}

/** Floating readout anchored next to a mark. Flips to the left on the right half of the chart. */
export function ChartTip({ at, width, gap = 12, children }: {
  at: { x: number; y: number; id: string } | null; width: number; gap?: number; children: ReactNode;
}) {
  const flip = at ? at.x > width / 2 : false;
  const left = at ? at.x + (flip ? -gap : gap) : 0;
  return (
    <AnimatePresence>
      {at && (
        <motion.div key="tip" role="status" initial={{ opacity: 0, scale: 0.97, left, top: at.y }} animate={{ opacity: 1, scale: 1, left, top: at.y }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ type: "spring", stiffness: 500, damping: 38 }}
          style={{ x: flip ? "-100%" : "0%" }}
          className="pointer-events-none absolute z-10 min-w-[176px] rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] shadow-[0_1px_2px_rgba(16,24,40,0.06),0_12px_28px_-10px_rgba(16,24,40,0.22)]">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One tooltip row: line key, label, then the value as the strong element. */
export function TipRow({ swatch, label, value, muted }: { swatch?: string; label: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 py-[3px] ${muted ? "opacity-45" : ""}`}>
      {swatch !== undefined && <span className={`h-[2px] w-3 flex-none rounded-full bg-cat ${swatch}`} />}
      <span className="min-w-0 flex-1 truncate text-ink-2">{label}</span>
      <span className="tabular pl-3 font-semibold text-ink">{value}</span>
    </div>
  );
}

type Fmt = "int" | "pct" | "ms";
const FORMATS: Record<Fmt, (v: number) => string> = {
  int: (v) => Math.round(v).toLocaleString(),
  pct: (v) => `${v.toFixed(1)}%`,
  ms: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()} ms`,
};

/** A KPI figure that counts up on mount and springs between values. Plain text under reduced motion. */
export function Figure({ value, format }: { value: number; format: Fmt }) {
  const reduce = useReducedMotion();
  const target = useMotionValue(0);
  const spring = useSpring(target, { stiffness: 70, damping: 20, mass: 0.7 });
  const text = useTransform(spring, FORMATS[format]);
  useEffect(() => { target.set(value); }, [value, target]);
  if (reduce) return <span>{FORMATS[format](value)}</span>;
  return <motion.span>{text}</motion.span>;
}

/** Segmented control for "Chart / Table". */
export function ViewToggle({ table, onChange, label }: { table: boolean; onChange: (t: boolean) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      <button type="button" aria-pressed={!table} onClick={() => onChange(false)}>Chart</button>
      <button type="button" aria-pressed={table} onClick={() => onChange(true)}>Table</button>
    </div>
  );
}
