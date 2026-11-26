"use client";

import { motion } from "motion/react";
import { type ModelCard, params, score } from "./types";
import { Section, useGrow } from "./ui";

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export function ModelComparison({ m }: { m: ModelCard }) {
  const grow = useGrow();
  const chosen = m.category_model.label;
  const rows = [...m.model_selection.candidates].sort((a, b) => b.cv_macro_f1 - a.cv_macro_f1);
  const folds = m.model_selection.method?.match(/(\d+)-fold/)?.[1];

  return (
    <Section id="compare" title="Model comparison" hint={`Balanced score in ${folds ? `${folds}-fold ` : ""}cross-validation`}>
      <div>
        <ul className="grid gap-4">
          {rows.map((r, i) => {
            const win = r.model === chosen;
            const w = `${Math.max(0, Math.min(1, r.cv_macro_f1)) * 100}%`;
            return (
              <li key={r.key ?? r.model} className="group">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={win ? "font-semibold text-ink" : "text-ink-2"}>{r.model}</span>
                  {win && <span className="badge" style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, white)", borderColor: "color-mix(in srgb, var(--accent) 28%, white)" }}>Chosen</span>}
                </div>
                <div className="mt-1.5 pr-[52px]">
                  <div className="relative h-5" role="img" aria-label={`${r.model}: ${score(r.cv_macro_f1)}`}>
                    {TICKS.map((t) => (
                      <span key={t} aria-hidden="true" className="absolute -inset-y-1 w-px bg-line" style={{ left: `${t * 100}%` }} />
                    ))}
                    <motion.div className={`relative h-full rounded-r-[4px] transition-[filter] group-hover:brightness-110 ${win ? "bg-accent" : "bg-[#c3c8d4]"}`}
                      {...grow(w, 0.1 + i * 0.09)} />
                    <span className={`absolute top-1/2 -translate-y-1/2 bg-white px-2 font-mono text-[13px] ${win ? "font-semibold text-ink" : "text-ink-2"}`} style={{ left: w }}>
                      {score(r.cv_macro_f1)}
                    </span>
                  </div>
                </div>
                <div className="mt-1 font-mono text-[11px] text-ink-3">
                  ± {score(r.cv_macro_f1_std)}<span className="hidden sm:inline"> across folds</span> · {params(r.best_params)} · test {score(r.test_macro_f1)}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="relative mt-2 mr-[52px] h-4 font-mono text-[11px] text-ink-3" aria-hidden="true">
          {TICKS.map((t) => (
            <span key={t} className={`absolute ${t === 0 ? "" : t === 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${t * 100}%` }}>
              {t === 0 ? "0" : t.toFixed(2)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        Each model family is tuned on practice rounds: the training data is split {folds ? `${folds} ways` : "several ways"} and each part takes a
        turn as a mini-test. The winner is picked on those practice rounds, <b className="font-semibold text-ink">never on the test set</b>, so the
        test scores stay honest.
        {rows.some((r) => r.key === "majority_baseline") && <> The majority baseline always guesses the largest category; it shows what &ldquo;no skill&rdquo; looks like.</>}
      </p>
    </Section>
  );
}
