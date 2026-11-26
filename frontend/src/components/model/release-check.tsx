"use client";

import { motion } from "motion/react";
import { clock, num, pct } from "@/lib/format";
import { type GateCheck, type ModelCard, params, score } from "./types";
import { PassIcon, Section, useGrow } from "./ui";

/** Plain names for the release checks, and how to show each value. */
const GATE: Record<string, { name: string; isScore: boolean }> = {
  macro_f1: { name: "Balanced score", isScore: true },
  fraud_recall: { name: "Fraud caught", isScore: false },
  intent_accuracy: { name: "Topic accuracy", isScore: false },
  macro_f1_vs_production: { name: "No drop vs. live model", isScore: true },
};

const SOURCE_NAMES: Record<string, string> = {
  banking77: "Banking77 public dataset",
  generated: "Generated from templates",
  feedback: "Corrections from the inbox",
};

function describe(c: GateCheck, m: ModelCard) {
  const t = m.quality_gate.thresholds ?? {};
  switch (c.check) {
    case "macro_f1": return "Average quality over all five categories, each counted equally.";
    case "fraud_recall": return "Share of real fraud reports the model flags as fraud.";
    case "intent_accuracy": return `Picks the exact topic, out of ${num(m.metrics.intent.n_intents)}.`;
    case "macro_f1_vs_production":
      return `Balanced score may not fall more than ${t.max_regression_vs_production != null ? score(t.max_regression_vs_production) : "the allowed margin"} below the live model${m.quality_gate.compared_with ? ` (${m.quality_gate.compared_with})` : ""}.`;
    default: return "";
  }
}

export function ReleaseCheck({ m }: { m: ModelCard }) {
  const grow = useGrow();
  const fmt = (c: GateCheck, x: number) => (GATE[c.check]?.isScore ? score(x) : pct(x, 1));
  return (
    <Section id="release" title="Release check" hint="A new model must pass every check before it goes live">
      <ul className="grid gap-5">
        {m.quality_gate.checks.map((c, i) => {
          const margin = c.value - c.threshold;
          return (
            <li key={c.check} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
              <PassIcon passed={c.passed} className="mt-0.5 h-5 w-5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-ink">{GATE[c.check]?.name ?? c.check}</span>
                  <span className="font-mono text-[13px] text-ink">
                    {fmt(c, c.value)} <span className="text-ink-3">{c.op === ">=" ? "≥" : c.op} {fmt(c, c.threshold)}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{describe(c, m)}</p>
                <div className="relative mt-2.5 h-2 rounded-full bg-surface-3"
                  role="img" aria-label={`${fmt(c, c.value)} against a minimum of ${fmt(c, c.threshold)}`}>
                  <motion.span className={`block h-full rounded-full ${c.passed ? "bg-ok" : "bg-danger"}`}
                    {...grow(`${Math.min(1, Math.max(0, c.value)) * 100}%`, 0.1 + i * 0.08)} />
                  <span className="absolute -top-1 h-4 w-[2px] -translate-x-1/2 rounded-full bg-ink ring-2 ring-white"
                    style={{ left: `${Math.min(1, Math.max(0, c.threshold)) * 100}%` }} title={`Minimum ${fmt(c, c.threshold)}`} />
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-3">
                  <span>0</span>
                  <span>{margin >= 0 ? "+" : "−"}{GATE[c.check]?.isScore ? score(Math.abs(margin)) : `${(Math.abs(margin) * 100).toFixed(1)} pts`} {margin >= 0 ? "above" : "below"} the minimum</span>
                  <span>{GATE[c.check]?.isScore ? "1.000" : "100%"}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 flex items-center gap-2 text-xs text-ink-3">
        <span className="inline-block h-3 w-[2px] rounded-full bg-ink" aria-hidden="true" /> Black tick: the minimum each check must reach.
      </p>
    </Section>
  );
}

export function ModelFacts({ m }: { m: ModelCard }) {
  const grow = useGrow();
  const sources = Object.entries(m.data.sources).sort((a, b) => b[1] - a[1]);
  const total = sources.reduce((a, [, n]) => a + n, 0) || 1;
  const env = m.environment ?? {};
  return (
    <Section id="facts" title="Model facts" hint="What was trained, on what, and when">
      <dl className="grid gap-x-6 gap-y-4 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)]">
        <dt className="text-ink-3">Model</dt>
        <dd className="-mt-3 font-medium text-ink sm:mt-0">{m.category_model.label}</dd>
        <dt className="text-ink-3">Settings</dt>
        <dd className="-mt-3 font-mono text-ink sm:mt-0">{params(m.category_model.params)}</dd>
        <dt className="text-ink-3">Training rows</dt>
        <dd className="-mt-3 sm:mt-0">
          <div className="font-medium text-ink">{num(m.data.train_rows)} <span className="font-normal text-ink-3">· {num(m.data.test_rows)} more held back for the test</span></div>
          <ul className="mt-2.5 grid gap-2">
            {sources.map(([k, n], i) => (
              <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate text-ink-2">{SOURCE_NAMES[k] ?? k}</span>
                <span className="font-mono text-ink">{num(n)}</span>
                <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.span className="block h-full min-w-[2px] rounded-full bg-ink-2" {...grow(`${(n / total) * 100}%`, 0.1 + i * 0.08)} />
                </span>
              </li>
            ))}
          </ul>
        </dd>
        <dt className="text-ink-3">Data fingerprint</dt>
        <dd className="-mt-3 sm:mt-0">
          <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink">{m.data.fingerprint}</code>
          <span className="mt-1 block text-xs text-ink-3">Changes whenever the training data changes.</span>
        </dd>
        <dt className="text-ink-3">Trained</dt>
        <dd className="-mt-3 text-ink sm:mt-0">
          {clock(m.created_at)}
          {m.training_seconds != null && <span className="text-ink-3"> · took {m.training_seconds}s</span>}
          {(env.scikit_learn || env.python) && (
            <span className="mt-1 block text-xs text-ink-3">
              {[env.scikit_learn && `scikit-learn ${env.scikit_learn}`, env.python && `Python ${env.python}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </dd>
      </dl>
    </Section>
  );
}
