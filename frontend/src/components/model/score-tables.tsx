"use client";

import { motion } from "motion/react";
import { useApp } from "@/components/app-provider";
import { clock, num, pct } from "@/lib/format";
import { type ModelCard, type Version, score } from "./types";
import { PassIcon, Section, useGrow } from "./ui";

const INK = { color: "var(--text)" };

function Th({ title, sub, right = true }: { title: string; sub?: string; right?: boolean }) {
  return (
    <th style={right ? { textAlign: "right" } : undefined}>
      <span className="block text-ink-2">{title}</span>
      {sub && <span className="block text-[11px] font-normal text-ink-3">{sub}</span>}
    </th>
  );
}

export function PerCategory({ m }: { m: ModelCard }) {
  const { label } = useApp();
  const grow = useGrow();
  const t = m.metrics.category;
  return (
    <Section id="per-category" title="Per-category scores" hint="Fraud caught matters most" bodyClass="">
      <ul className="divide-y divide-line sm:hidden">
        {t.labels.map((c, i) => {
          const p = t.per_class[c];
          if (!p) return null;
          return (
            <li key={c} className={`c-${c} px-5 py-4`}>
              <div className="flex items-center justify-between gap-3">
                <span className="tag text-[14px]">{label(c)}</span>
                <span className="font-mono text-xs text-ink-3">{num(p.support)} messages</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div><dt className="text-ink-3">Precision</dt><dd className="mt-0.5 font-mono text-[14px] text-ink">{pct(p.precision, 1)}</dd></div>
                <div>
                  <dt className="text-ink-3">Recall</dt>
                  <dd className="mt-0.5 font-mono text-[14px] text-ink">
                    {pct(p.recall, 1)}
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3">
                      <motion.span className="block h-full rounded-full bg-cat" {...grow(`${p.recall * 100}%`, 0.1 + i * 0.06)} />
                    </span>
                  </dd>
                </div>
                <div><dt className="text-ink-3">F1</dt><dd className="mt-0.5 font-mono text-[14px] font-semibold text-ink">{score(p.f1)}</dd></div>
              </dl>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="data min-w-[520px]">
          <thead>
            <tr>
              <Th title="Category" right={false} />
              <Th title="Precision" sub="Right when it says X" />
              <Th title="Recall" sub="X messages caught" />
              <Th title="F1" sub="Balance of the two" />
              <Th title="Count" sub="Test messages" />
            </tr>
          </thead>
          <tbody>
            {t.labels.map((c, i) => {
              const p = t.per_class[c];
              if (!p) return null;
              return (
                <tr key={c} className={`c-${c}`}>
                  <td className="whitespace-nowrap"><span className="tag">{label(c)}</span></td>
                  <td className="num" style={INK}>{pct(p.precision, 1)}</td>
                  <td className="num" style={INK}>
                    <span className="inline-flex items-center justify-end gap-2.5">
                      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-3 sm:block">
                        <motion.span className="block h-full rounded-full bg-cat" {...grow(`${p.recall * 100}%`, 0.1 + i * 0.06)} />
                      </span>
                      {pct(p.recall, 1)}
                    </span>
                  </td>
                  <td className="num font-semibold" style={INK}>{score(p.f1)}</td>
                  <td className="num">{num(p.support)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3.5 text-xs leading-relaxed text-ink-3 sm:px-6">
        <span className="sm:hidden">Precision: right when it says that category. Recall: share of that category&rsquo;s messages caught. </span>
        <span className="hidden sm:inline">X is the category in that row. </span>A low precision means false alarms; a low recall means messages slip through to the wrong team.
      </p>
    </Section>
  );
}

export function Versions({ versions }: { versions: Version[] }) {
  return (
    <Section id="versions" title="Versions" hint={<>Promote with <code className="font-mono text-ink-2">make promote V=…</code>, then reload without downtime</>} bodyClass="">
      {versions.length === 0 ? (
        <p className="px-6 py-8 text-center text-ink-3">No trained versions yet.</p>
      ) : (
        <>
        <ul className="divide-y divide-line sm:hidden">
          {versions.map((v) => (
            <li key={v.version} className={`px-5 py-4 ${v.production ? "bg-[color-mix(in_srgb,var(--ok)_4%,white)]" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] text-ink">{v.version}</span>
                {v.production && (
                  <span className="inline-flex h-[20px] items-center gap-1.5 rounded-full bg-ok px-2 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />Live
                  </span>
                )}
                <span className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${v.gate_passed ? "text-ok" : "text-danger"}`}>
                  <PassIcon passed={v.gate_passed} className="h-3.5 w-3.5" />{v.gate_passed ? "Passed" : "Failed"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{v.model} · {clock(v.created_at)}</div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div><dt className="text-ink-3">Balanced</dt><dd className="mt-0.5 font-mono text-[14px] text-ink">{score(v.macro_f1)}</dd></div>
                <div><dt className="text-ink-3">Fraud caught</dt><dd className="mt-0.5 font-mono text-[14px] text-ink">{pct(v.fraud_recall, 1)}</dd></div>
                <div><dt className="text-ink-3">Topic</dt><dd className="mt-0.5 font-mono text-[14px] text-ink">{pct(v.intent_accuracy, 1)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="data min-w-[760px]">
            <thead>
              <tr>
                <Th title="Version" right={false} />
                <Th title="Trained" right={false} />
                <Th title="Model" right={false} />
                <Th title="Balanced score" sub="Macro F1" />
                <Th title="Fraud caught" sub="Recall" />
                <Th title="Topic accuracy" />
                <Th title="Release check" right={false} />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version} className={v.production ? "bg-[color-mix(in_srgb,var(--ok)_4%,white)]" : ""}>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-[13px]">{v.version}</span>
                    {v.production && (
                      <span className="ml-2 inline-flex h-[20px] items-center gap-1.5 rounded-full bg-ok px-2 align-middle text-[11px] font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />Live
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{clock(v.created_at)}</td>
                  <td className="whitespace-nowrap">{v.model}</td>
                  <td className="num" style={INK}>{score(v.macro_f1)}</td>
                  <td className="num" style={INK}>{pct(v.fraud_recall, 1)}</td>
                  <td className="num" style={INK}>{pct(v.intent_accuracy, 1)}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap ${v.gate_passed ? "text-ok" : "text-danger"}`}>
                      <PassIcon passed={v.gate_passed} className="h-4 w-4" />{v.gate_passed ? "Passed" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Section>
  );
}
