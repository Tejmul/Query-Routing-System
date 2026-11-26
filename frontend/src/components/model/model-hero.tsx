"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { clock, num, pct } from "@/lib/format";
import { type ModelCard, score } from "./types";
import { CountUp, PassIcon, useGrow } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ModelHero({ m }: { m: ModelCard }) {
  const reduce = useReducedMotion();
  const grow = useGrow();
  const t = m.metrics.category;
  const it = m.metrics.intent;
  const fraud = t.per_class.fraud;
  const fraudCaught = fraud ? Math.round(fraud.recall * fraud.support) : null;
  const checks = m.quality_gate.checks;
  const passedCount = checks.filter((c) => c.passed).length;

  const tiles: { label: string; value: ReactNode; note: ReactNode; foot?: ReactNode }[] = [
    {
      label: "Category accuracy",
      value: <CountUp value={t.accuracy * 100} format={(v) => `${v.toFixed(1)}%`} />,
      note: <>of {num(m.data.test_rows)} unseen test messages sent to the right team</>,
      foot: t.misclassified != null && <>{num(t.misclassified)} sent to the wrong team</>,
    },
    {
      label: "Balanced score",
      value: <CountUp value={t.macro_f1} format={score} />,
      note: <>Macro F1: every category counts equally, so small ones like Loans can&rsquo;t hide behind Payments</>,
      foot: <>Out of 1.000</>,
    },
    {
      label: "Fraud caught",
      value: fraudCaught != null && fraud ? (
        <span>
          <CountUp value={fraudCaught} format={(v) => Math.round(v).toLocaleString()} />
          <span className="text-[0.55em] font-medium text-ink-3"> of {num(fraud.support)}</span>
        </span>
      ) : "–",
      note: <>{fraud ? `${pct(fraud.recall, 1)} of real fraud reports flagged as fraud` : "No fraud results in this model card"}</>,
      foot: fraud && fraudCaught != null && (
        <span className="block">
          <span className="mb-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3" role="img"
            aria-label={`${fraudCaught} caught, ${fraud.support - fraudCaught} missed`}>
            <motion.span className="h-full rounded-full bg-[var(--fraud)]" {...grow(`${fraud.recall * 100}%`, 0.3)} />
          </span>
          {num(fraud.support - fraudCaught)} missed
        </span>
      ),
    },
    {
      label: "Topic accuracy",
      value: <CountUp value={it.accuracy * 100} format={(v) => `${v.toFixed(1)}%`} />,
      note: <>exact topic out of {num(it.n_intents)} topics</>,
      foot: <>{pct(it.top3_accuracy, 1)} have the right topic in the top 3</>,
    },
  ];

  return (
    <header className="mb-8">
      <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2"><span className="live-dot" aria-hidden="true" />Production model</div>
          <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[34px] leading-tight font-semibold tracking-tight sm:text-[40px]">
            Model
            <span className="rounded-lg border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[14px] font-medium tracking-normal text-ink-2 sm:text-[15px]">
              {m.version}
            </span>
          </h1>
          <p className="mt-2 max-w-[640px] text-[15px] text-ink-2">
            {m.category_model.label}, scored on {num(m.data.test_rows)} messages it never saw while learning. Every number on this page comes
            from that test.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold ${m.quality_gate.passed
            ? "border-[color-mix(in_srgb,var(--ok)_30%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,white)] text-ok"
            : "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,white)] text-danger"}`}>
            <PassIcon passed={m.quality_gate.passed} className="h-4 w-4" />
            {m.quality_gate.passed ? "Release check passed" : "Release check failed"} · {passedCount}/{checks.length}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-[13px] text-ink-2">
            Trained {clock(m.created_at)}
          </span>
        </div>
      </motion.div>

      <ul className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((s, i) => (
          <motion.li key={s.label} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 + i * 0.07, ease: EASE }}
            className="card card-hover flex min-w-0 flex-col p-5">
            <div className="text-[13px] font-medium text-ink-2">{s.label}</div>
            <div className="mt-2 text-[40px] leading-none font-semibold tracking-tight text-ink">{s.value}</div>
            <p className="mt-3 text-[13px] leading-snug text-ink-2">{s.note}</p>
            {s.foot && <><div className="min-h-4 flex-1" /><div className="border-t border-line pt-3 text-xs text-ink-3">{s.foot}</div></>}
          </motion.li>
        ))}
      </ul>
    </header>
  );
}
