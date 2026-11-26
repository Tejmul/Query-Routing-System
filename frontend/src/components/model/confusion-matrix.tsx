"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { num } from "@/lib/format";
import type { ModelCard } from "./types";
import { Section } from "./ui";

const share = (x: number) => (x === 0 ? "0%" : x < 0.001 ? "<0.1%" : `${(x * 100).toFixed(1)}%`);

export function ConfusionMatrix({ m }: { m: ModelCard }) {
  const { label } = useApp();
  const reduce = useReducedMotion();
  const t = m.metrics.category;
  const labels = t.labels;
  const cm = t.confusion_matrix;
  const n = labels.length;
  const [hover, setHover] = useState<[number, number] | null>(null);

  const rowTotals = cm.map((row) => row.reduce((a, b) => a + b, 0));
  let worst: [number, number, number] | null = null;
  cm.forEach((row, i) => row.forEach((v, j) => { if (i !== j && v > 0 && (!worst || v > worst[2])) worst = [i, j, v]; }));
  const top = worst as [number, number, number] | null;
  const correct = cm.reduce((a, row, i) => a + (row[i] ?? 0), 0);
  const all = rowTotals.reduce((a, b) => a + b, 0);

  return (
    <Section id="confusion" title="Confusion matrix" hint={`${num(all)} test messages`} bodyClass="px-4 py-5 sm:p-6">
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <div className="grid gap-[3px] [--rh:72px] sm:[--rh:112px]" role="grid" aria-label="Confusion matrix: rows are the actual category, columns the predicted category"
          style={{ gridTemplateColumns: `var(--rh) repeat(${n}, minmax(0, 1fr))` }}>
          <div role="presentation" />
          <div role="presentation" className="pb-1 text-center text-[11px] font-medium tracking-wide text-ink-3 uppercase" style={{ gridColumn: `span ${n}` }}>
            Predicted →
          </div>
          <div role="presentation" />
          {labels.map((c, j) => (
            <div key={c} role="columnheader"
              className={`c-${c} flex min-w-0 flex-col items-center justify-start gap-1 pb-1 text-center text-[10px] leading-tight font-medium transition-colors sm:text-xs ${hover && hover[1] === j ? "text-ink" : "text-ink-2"}`}>
              <span className="h-2 w-2 flex-none rounded-full bg-cat" />
              <span>{label(c)}</span>
            </div>
          ))}
          {cm.map((row, i) => (
            <Row key={labels[i]} i={i} row={row} labels={labels} total={rowTotals[i]} hover={hover} setHover={setHover} label={label} reduce={!!reduce} />
          ))}
        </div>
        <div className="mt-2 text-[11px] font-medium tracking-wide text-ink-3 uppercase" aria-hidden="true">↑ Rows: actual</div>
      </div>

      <div className="mt-5 grid gap-3 text-[13px] leading-relaxed text-ink-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-5">
        <div className="flex gap-4 text-xs sm:flex-col sm:gap-2">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px]" style={{ background: "linear-gradient(90deg, var(--payments) 0 20%, var(--cards) 20% 40%, var(--loans) 40% 60%, var(--account) 60% 80%, var(--fraud) 80%)" }} />Correct</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_22%,white)]" />Mistake</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px] border border-line bg-surface-2" />None</span>
        </div>
        <p>
          Each row is what a message <b className="font-semibold text-ink">really was</b>; each column is what the model <b className="font-semibold text-ink">said</b>.
          The coloured diagonal is right answers ({num(correct)} of {num(all)}); every other box is a mistake, and darker means more of that row.
          {top && <> The most common mix-up: {num(top[2])} {label(labels[top[0]])} messages sent to {label(labels[top[1]])}.</>} Hover a box for detail.
        </p>
      </div>
    </Section>
  );
}

function Row({ i, row, labels, total, hover, setHover, label, reduce }: {
  i: number; row: number[]; labels: string[]; total: number; hover: [number, number] | null;
  setHover: (h: [number, number] | null) => void; label: (c: string) => string; reduce: boolean;
}) {
  const n = labels.length;
  return (
    <>
      <div role="rowheader" className={`c-${labels[i]} flex min-w-0 items-center gap-1.5 pr-1 text-[11px] leading-tight font-medium transition-colors sm:text-xs ${hover && hover[0] === i ? "text-ink" : "text-ink-2"}`}>
        <span className="h-2 w-2 flex-none rounded-full bg-cat" />
        <span className="min-w-0">{label(labels[i])}</span>
      </div>
      {row.map((v, j) => {
        const s = total ? v / total : 0;
        const diag = i === j;
        const bg = diag
          ? `color-mix(in srgb, var(--${labels[i]}) ${Math.round(22 + s * 70)}%, white)`
          : v ? `color-mix(in srgb, var(--danger) ${Math.min(40, Math.round(8 + s * 320))}%, white)` : "var(--surface-2)";
        const dark = diag && s > 0.45;
        const active = hover && hover[0] === i && hover[1] === j;
        const dim = hover && !active && hover[0] !== i && hover[1] !== j;
        const text = `Actual ${label(labels[i])}, predicted ${label(labels[j])}: ${v.toLocaleString()}`;
        const align = j === 0 ? "left-0" : j >= n - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
        return (
          <motion.div key={j} role="gridcell" tabIndex={0} aria-label={`${text} (${share(s)} of actual ${label(labels[i])})`}
            initial={reduce ? false : { opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            transition={{ duration: 0.35, delay: (i + j) * 0.035 }}
            onPointerEnter={() => setHover([i, j])} onFocus={() => setHover([i, j])} onBlur={() => setHover(null)}
            className={`relative grid h-11 min-w-0 sm:h-auto sm:min-h-[44px] sm:aspect-[1.25] cursor-default place-items-center rounded-[6px] font-mono text-[12px] outline-none transition-[opacity,box-shadow] duration-150 sm:text-[13px]
              ${active ? "z-10 shadow-[0_0_0_2px_var(--text)]" : ""} ${dim ? "opacity-55" : ""}`}
            style={{ background: bg, color: dark ? "#fff" : v ? "var(--text)" : "var(--text-3)", fontWeight: diag || v ? 600 : 400 }}>
            {v.toLocaleString()}
            <AnimatePresence>
              {active && (
                <motion.div role="tooltip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                  className={`pointer-events-none absolute bottom-[calc(100%+8px)] ${align} z-20 w-max max-w-[220px] rounded-lg bg-brand px-3 py-2 text-left font-sans text-xs font-normal text-on-brand shadow-lg`}>
                  <div className="text-[15px] font-semibold">{v.toLocaleString()} <span className="text-[12px] font-normal opacity-70">· {share(s)} of row</span></div>
                  <div className="mt-0.5 opacity-80">Actual {label(labels[i])}, predicted {label(labels[j])}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </>
  );
}
