"use client";

import { motion, useReducedMotion } from "motion/react";
import { useApp } from "@/components/app-provider";
import { ORDER } from "@/lib/types";
import type { ModelCard } from "./types";
import { Section } from "./ui";

export function IndicatorWords({ m }: { m: ModelCard }) {
  const { label } = useApp();
  const reduce = useReducedMotion();
  const cats = [...ORDER.filter((c) => m.top_terms[c]), ...Object.keys(m.top_terms).filter((c) => !ORDER.includes(c as never))];
  return (
    <Section id="words" title="Indicator words" hint="Words that most push a message into each category">
      <ul className="grid gap-4">
        {cats.map((c, r) => {
          const terms = (m.top_terms[c as keyof ModelCard["top_terms"]] ?? []).slice(0, 10);
          const max = Math.max(...terms.map((x) => x.weight), 1e-9);
          return (
            <li key={c} className={`c-${c} grid gap-2 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-4`}>
              <span className="tag pt-1 text-[13px]">{label(c)}</span>
              <div className="flex flex-wrap gap-1.5">
                {terms.map((x, i) => (
                  <motion.span key={x.term} title={`Weight ${x.weight.toFixed(2)}`}
                    initial={reduce ? false : { opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: r * 0.05 + i * 0.025 }}
                    className="inline-flex h-7 items-center rounded-full border px-2.5 text-[12.5px] font-medium text-ink"
                    style={{
                      background: `color-mix(in srgb, var(--c) ${Math.round(4 + (x.weight / max) * 12)}%, white)`,
                      borderColor: `color-mix(in srgb, var(--c) ${Math.round(14 + (x.weight / max) * 26)}%, white)`,
                    }}>
                    {x.term}
                  </motion.span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        Taken from the {m.category_model.label.toLowerCase()} weights, strongest first; stronger words have a deeper tint. Hover a word to see its weight.
      </p>
    </Section>
  );
}

export function IntendedUse({ m }: { m: ModelCard }) {
  return (
    <Section id="use" title="Intended use and limits" hint="Read before relying on it">
      {m.intended_use && (
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3.5">
          <div className="eyebrow mb-1.5">Built for</div>
          <p className="text-[14px] leading-relaxed text-ink">{m.intended_use}</p>
        </div>
      )}
      {(m.limitations?.length ?? 0) > 0 && (
        <>
          <div className="eyebrow mt-5 mb-2.5">Known limits</div>
          <ul className="grid gap-2.5">
            {m.limitations!.map((l) => (
              <li key={l} className="flex gap-3 text-[13.5px] leading-relaxed text-ink-2">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-none text-ink-3" aria-hidden="true">
                  <path d="M10 2.5l8 14H2z" fill="currentColor" opacity="0.14" />
                  <path d="M10 2.5l8 14H2zM10 8v4M10 14.2v.3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {l}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
