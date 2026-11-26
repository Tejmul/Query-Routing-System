"use client";

import { useApp } from "@/components/app-provider";
import { ORDER } from "@/lib/types";

// The exact question Laya is asked for every message (bankq/ml/laya_challenger.py), built from the
// same taxonomy the router uses, so both models choose between the same five teams.

export function QuestionCard() {
  const { taxonomy } = useApp();
  return (
    <div className="card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">The question Laya is asked</h2>
      <p className="mt-0.5 text-xs text-ink-3">For every message, in one forward pass. The options come from the same taxonomy our router uses.</p>
      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
        <div className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">choice</div>
        <div className="mt-1 text-[14px] font-medium text-ink">&ldquo;Which banking team should handle this customer message?&rdquo;</div>
        <ul className="mt-3 grid gap-2">
          {ORDER.map((c) => (
            <li key={c} className={`c-${c} flex items-start gap-2.5 rounded-lg bg-white px-3 py-2`}>
              <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-cat" />
              <div className="min-w-0 text-[13px]">
                <span className="font-mono text-ink">{c}</span>
                <span className="text-ink-3"> · {taxonomy?.categories[c]?.description ?? ""}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
