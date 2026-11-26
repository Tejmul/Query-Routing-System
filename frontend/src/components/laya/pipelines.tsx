"use client";

import { motion, useReducedMotion } from "motion/react";

// How each model turns a message into a team, step by step, with a pulse travelling through the steps.

const FLOWS = [
  {
    name: "Our model",
    tag: "Routes every message",
    steps: [
      { t: "Message", d: "card numbers and personal details masked" },
      { t: "Text features", d: "TF-IDF over words and letter groups" },
      { t: "Logistic Regression", d: "one weight per feature, per team" },
      { t: "Team + topic", d: "both scored from the same features" },
    ],
  },
  {
    name: "Laya",
    tag: "Integrated, switched off",
    steps: [
      { t: "Message", d: "the same masked text" },
      { t: "Typed question", d: "“Which team?” with five options" },
      { t: "ModernBERT-large", d: "reads message and options together" },
      { t: "Team", d: "a probability for every option" },
    ],
  },
];

export function Pipelines() {
  const reduce = useReducedMotion();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {FLOWS.map((f, k) => (
        <div key={f.name} className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight">{f.name}</h3>
            <span className={`badge ${k === 0 ? "" : "text-ink-2"}`}>{f.tag}</span>
          </div>
          <ol className="relative mt-5 grid gap-3">
            <span aria-hidden="true" className="absolute top-3 bottom-3 left-[11px] w-px bg-line" />
            {!reduce && (
              <motion.span aria-hidden="true" className={`absolute left-[8px] h-[7px] w-[7px] rounded-full ${k === 0 ? "bg-brand" : "bg-[#8b93a7]"}`}
                initial={{ top: "6%" }} animate={{ top: ["6%", "92%"] }}
                transition={{ duration: k === 0 ? 1.1 : 3.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.4 }} />
            )}
            {f.steps.map((s, i) => (
              <li key={s.t} className="relative flex items-start gap-3">
                <span className={`relative z-[1] grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] font-semibold ${i === f.steps.length - 1 ? (k === 0 ? "border-brand bg-brand text-white" : "border-[#8b93a7] bg-[#8b93a7] text-white") : "border-line-strong bg-white text-ink-2"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="text-[13px] font-medium text-ink">{s.t}</div>
                  <div className="text-xs text-ink-3">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
