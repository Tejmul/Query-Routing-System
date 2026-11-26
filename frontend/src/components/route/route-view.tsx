"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Panel } from "@/components/page-head";
import { AnimatedNumber } from "@/components/animated-number";
import { api, send } from "@/lib/api";
import { capital, clock, pct, pctSoft, slaText } from "@/lib/format";
import type { Category, Decision } from "@/lib/types";
import { evidence, NeuralNet } from "./neural-net";

const SAMPLES = [
  "I didn't make this payment",
  "My card was skimmed at the ATM",
  "EMI on a 5 lakh home loan?",
  "My transfer hasn't arrived",
  "My father passed away, close his account",
  "Card 4539 1488 0343 6467 is blocked",
];
const RULE_NAMES: Record<string, string> = {
  fraud_escalation: "Fraud escalation", low_confidence: "Manual review", vulnerable_customer: "Vulnerable customer",
  formal_complaint: "Formal complaint", account_takeover: "Account takeover",
};
const PII_NAMES: Record<string, string> = { CARD: "card number", ACCOUNT: "account number", IBAN: "IBAN", SORT_CODE: "sort code", EMAIL: "email", PHONE: "phone" };
const CHANNELS = [["app", "Mobile app"], ["web", "Web"], ["chat", "Live chat"], ["email", "Email"], ["phone", "Phone"], ["branch", "Branch"]];

export function RouteView() {
  const { taxonomy, label, toast, refreshBadge } = useApp();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("app");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "busy" | "live" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const [created, setCreated] = useState(false);
  const [creating, setCreating] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const classify = useCallback(async (value: string) => {
    ctrl.current?.abort();
    if (value.trim().length < 3) {
      // Invalidate any reply still in flight so it can't bring back a decision for old text.
      seq.current++;
      setDecision(null);
      setState({ kind: "idle" });
      return;
    }
    ctrl.current = new AbortController();
    const mine = ++seq.current;
    setState({ kind: "busy" });
    try {
      const d = await send<Decision>("/api/v1/classify", "POST", { text: value, channel, create_ticket: false }, ctrl.current.signal);
      if (mine !== seq.current) return;
      setDecision(d);
      setState({ kind: "live", msg: `${d.latency_ms} ms` });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ kind: "error", msg: (err as Error).message });
    }
  }, [channel]);

  useEffect(() => {
    const t = setTimeout(() => classify(text), 350);
    return () => clearTimeout(t);
  }, [text, classify]);

  async function createTicket() {
    if (creating || created) return;
    setCreating(true);
    try {
      const d = await send<Decision>("/api/v1/classify", "POST", { text, channel });
      setDecision(d);
      setCreated(true);
      setState({ kind: "saved" });
      refreshBadge();
      toast(`${d.ticket_ref} created for ${d.department}`, { label: "Open", href: `/inbox?ticket=${d.ticket_ref}` });
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    } finally {
      setCreating(false);
    }
  }

  const steps = decision ? [
    { key: "pii", title: "Mask", text: decision.pii_redacted.length ? `${decision.pii_redacted.length} item${decision.pii_redacted.length > 1 ? "s" : ""} masked` : "Nothing to mask", flag: false },
    { key: "cat", title: "Classify", text: `${label(decision.model_category)} · ${pct(decision.probabilities[decision.model_category])}`, flag: false },
    { key: "topic", title: "Topic", text: decision.intent?.label ?? "Not found", flag: false },
    { key: "rules", title: "Rules", text: decision.rules_applied.length ? decision.rules_applied.map((r) => RULE_NAMES[r.rule] ?? r.rule).join(", ") : "None triggered",
      flag: decision.rules_applied.some((r) => r.rule !== "low_confidence") },
  ] : [
    { key: "pii", title: "Mask", text: "personal data", flag: false },
    { key: "cat", title: "Classify", text: "5 categories", flag: false },
    { key: "topic", title: "Topic", text: "83 topics", flag: false },
    { key: "rules", title: "Rules", text: "business rules", flag: false },
  ];

  return (
    <Panel>
      <Hero />

      <div className="stage stage-grid relative isolate grid overflow-hidden rounded-[18px] lg:grid-cols-[minmax(300px,348px)_minmax(0,1fr)]">
        <div className="relative flex flex-col gap-3.5 border-b border-line bg-surface p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="query" className="font-semibold">Customer message</label>
            <LiveState state={state} />
          </div>
          <textarea id="query" rows={5} maxLength={2000} value={text}
            onChange={(e) => { setText(e.target.value); setCreated(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && decision && !created) { e.preventDefault(); createTicket(); } }}
            placeholder="e.g. There’s a payment on my card I didn’t make"
            className="input min-h-[132px] flex-1 resize-none px-3.5 py-3 text-[16px] leading-snug" />
          <div>
            <div className="eyebrow mb-2 text-[10px]">Or try one</div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button key={s} type="button" onClick={() => { setText(s); setCreated(false); }} aria-pressed={text === s}
                  className="chip h-7 px-2.5 text-[12.5px]">{s}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2.5">
            <select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} className="input h-10 cursor-pointer px-2.5">
              {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" onClick={createTicket} disabled={!decision || created || creating} className="btn btn-primary h-10 flex-1">
              {created ? (
                <><svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>Ticket created</>
              ) : (
                <>Create ticket<kbd className="hidden rounded border border-white/25 px-1.5 font-mono text-[10px] font-medium text-white/70 sm:inline">⌘↵</kbd></>
              )}
            </button>
          </div>
          {state.kind === "error" && <p className="text-[13px] text-danger" role="alert">{state.msg}</p>}
        </div>

        <div className="relative flex min-w-0 flex-col gap-4 p-4 sm:p-5">
          <ol className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface sm:grid-cols-4" aria-label="Processing steps">
            {steps.map((s, i) => (
              <li key={s.key} className={`flex min-w-0 items-center gap-2.5 px-3 py-2.5 ${i % 2 ? "border-l border-line" : ""} ${i > 1 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
                <motion.span key={decision ? `${s.key}-${decision.text}-${decision.category}` : s.key}
                  initial={{ scale: decision ? 0.3 : 1, opacity: decision ? 0 : 1 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: decision ? 0.12 + 0.2 * i : 0, type: "spring", stiffness: 520, damping: 24 }}
                  className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full text-white"
                  style={decision ? { background: s.flag ? "var(--fraud)" : "var(--text)" } : { border: "1.5px solid var(--border-strong)" }}>
                  {decision && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {s.flag ? <path d="M6 2.5v4M6 9.2v.3" /> : <path d="m2.5 6.3 2.3 2.2 4.7-5" />}
                    </svg>
                  )}
                </motion.span>
                <span className="min-w-0">
                  <b className="block text-[12px] leading-tight font-semibold">{s.title}</b>
                  <em className="block truncate text-[11.5px] text-ink-3 not-italic" title={s.text}>{s.text}</em>
                </span>
              </li>
            ))}
          </ol>
          <NeuralNet decision={decision} busy={state.kind === "busy"} categories={taxonomy?.categories ?? null} />
        </div>
      </div>

      <AnimatePresence>
        {decision && <DecisionCards key="cards" d={decision} label={label} reviewDept={taxonomy?.review_department} />}
      </AnimatePresence>
    </Panel>
  );
}

function LiveState({ state }: { state: { kind: string; msg?: string } }) {
  const text = { idle: "Waiting for input", busy: "Analysing…", live: `Live · ${state.msg} · not saved`, saved: "Saved as a ticket", error: "Paused" }[state.kind];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap text-ink-3">
      <span className={`h-1.5 w-1.5 rounded-full ${state.kind === "live" ? "live-dot" : ""}`}
        style={{ background: state.kind === "live" ? "var(--ok)" : state.kind === "busy" ? "var(--text)" : "var(--border-strong)" }} />
      {text}
    </span>
  );
}

function highlight(d: Decision) {
  const ev = [...evidence(d)].sort((a, b) => a.start - b.start);
  if (!ev.length) return d.text;
  const max = Math.max(...ev.map((k) => k.impact));
  const out: React.ReactNode[] = [];
  let pos = 0;
  ev.forEach((k, i) => {
    out.push(d.text.slice(pos, k.start));
    const w = 0.35 + 0.65 * (k.impact / max);
    out.push(
      <mark key={i} title={`Removing this word lowers confidence by ${pct(k.impact, 1)}`} className="rounded px-0.5 text-inherit"
        style={{ background: `color-mix(in srgb, var(--c) ${Math.round(w * 26)}%, transparent)`, boxShadow: "inset 0 -2px 0 var(--c)" }}>
        {d.text.slice(k.start, k.end)}
      </mark>,
    );
    pos = k.end;
  });
  out.push(d.text.slice(pos));
  return out;
}

function DecisionCards({ d, label, reviewDept }: { d: Decision; label: (c: string) => string; reviewDept?: string }) {
  const cat = d.needs_review ? "review" : d.category;
  const byRule = d.rules_applied.some((r) => r.rule === "fraud_escalation");
  const topics = [d.intent, ...d.intent_alternatives].filter(Boolean) as NonNullable<Decision["intent"]>[];
  const card = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 },
    transition: { delay: 0.05 * i, type: "spring" as const, stiffness: 300, damping: 28 } });
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
      <motion.article {...card(0)} className={`card c-${cat} p-5`}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Decision</h2>
          <span className={`badge ${d.priority === "urgent" ? "badge-urgent" : d.priority === "high" ? "badge-high" : ""}`}>{capital(d.priority)} priority</span>
        </div>
        <div className="mb-4 flex items-start gap-2.5">
          <span className="mt-2 h-3 w-3 flex-none rounded-[3px] bg-cat" />
          <div>
            <div className="font-display text-[24px] leading-tight font-semibold tracking-tight">{d.needs_review ? "Manual review" : d.label}</div>
            {(d.needs_review || byRule) && (
              <div className="mt-1 text-[13px] text-ink-3">
                {d.needs_review ? `Best guess: ${d.label} at ${pct(d.confidence)}` : `Set by the fraud rule; the model said ${label(d.model_category)}`}
              </div>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
          <dt className="text-ink-3">Team</dt><dd className="font-medium">{d.needs_review ? reviewDept : d.department}</dd>
          <dt className="text-ink-3">Confidence</dt>
          <dd className="flex items-center gap-2.5 font-medium">
            {byRule ? "Decided by rule" : <>
              <span className="font-mono">{pct(d.confidence, 1)}</span>
              <span className="bar w-[90px]"><motion.span initial={{ width: 0 }} animate={{ width: pct(d.confidence) }} transition={{ duration: 0.6 }} /></span>
            </>}
          </dd>
          <dt className="text-ink-3">Respond by</dt>
          <dd className="font-medium">{slaText(d.sla_hours)} · by {clock(d.due_at)}</dd>
          <dt className="text-ink-3">Also about</dt>
          <dd className="font-medium">{d.secondary_category ? `${label(d.secondary_category)} (${pct(d.probabilities[d.secondary_category as Category])})` : "None"}</dd>
        </dl>
      </motion.article>

      <motion.article {...card(1)} className={`card c-${d.category} p-5`}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Why</h2><span className="text-xs text-ink-3">Highlighted words moved the decision most</span>
        </div>
        <p className="text-[15px] leading-[1.7]">{highlight(d)}</p>
        <ul className="mt-3.5 grid gap-1.5">
          {d.pii_redacted.length > 0 && (
            <li className="flex gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs text-ink-2 shadow-[inset_3px_0_0_var(--ok)]">
              <b className="whitespace-nowrap text-ink">Masked</b>{d.pii_redacted.map((p) => PII_NAMES[p] ?? p).join(", ")} before storing
            </li>
          )}
          {d.rules_applied.map((r) => (
            <li key={r.rule} className="flex gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs text-ink-2"
              style={{ boxShadow: `inset 3px 0 0 ${r.rule === "low_confidence" ? "var(--review)" : "var(--fraud)"}` }}>
              <b className="whitespace-nowrap text-ink">{RULE_NAMES[r.rule] ?? r.rule}</b>{r.detail}
            </li>
          ))}
        </ul>
      </motion.article>

      <motion.article {...card(2)} className={`card c-${d.category} p-5`}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Topic</h2><span className="text-xs text-ink-3">Most likely specific issue</span>
        </div>
        <ol className="grid gap-3">
          {topics.map((t, i) => (
            <li key={t.intent} className="grid gap-1.5 text-[13px]">
              <div className="flex justify-between gap-2"><span className={i ? "text-ink-2" : "font-medium"}>{t.label}</span><span className="font-mono">{pctSoft(t.confidence)}</span></div>
              <span className="bar"><motion.span initial={{ width: 0 }} animate={{ width: `${t.confidence * 100}%` }} transition={{ duration: 0.6, delay: 0.1 * i }} /></span>
            </li>
          ))}
        </ol>
      </motion.article>
    </div>
  );
}


interface ModelCard {
  metrics: { category: { accuracy: number; per_class: Record<string, { recall: number; support: number }> }; intent: { accuracy: number; n_intents: number } };
  data: { test_rows: number };
}

function Hero() {
  const [card, setCard] = useState<ModelCard | null>(null);
  useEffect(() => { api<ModelCard>("/api/v1/model").then(setCard).catch(() => {}); }, []);
  const fraud = card?.metrics.category.per_class.fraud;
  const stats = card ? [
    { v: card.metrics.category.accuracy * 100, suffix: "%", d: 1, l: `right team, on ${card.data.test_rows.toLocaleString()} unseen messages` },
    { v: Math.round(fraud!.recall * fraud!.support), suffix: ` / ${fraud!.support}`, d: 0, l: "fraud reports caught" },
    { v: card.metrics.intent.n_intents, suffix: " topics", d: 0, l: `exact topic ${(card.metrics.intent.accuracy * 100).toFixed(1)}% of the time` },
    { v: 1000000, suffix: "", d: 0, l: "messages routed in 19.3 s on one laptop" },
  ] : [];
  return (
    <section className="mb-6 grid items-end gap-x-10 gap-y-5 pt-1 sm:pt-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
        <span className="eyebrow">Banking customer messages · live routing</span>
        <h1 className="mt-2.5 text-[32px] leading-[1.08] font-semibold tracking-[-0.025em] text-balance sm:text-[42px]">
          Every customer message, <br className="hidden sm:inline" />to the <span className="headline-accent whitespace-nowrap">right team</span>, instantly.
        </h1>
      </motion.div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 lg:grid-cols-2 lg:pb-1 xl:w-[440px]">
        {(stats.length ? stats : Array.from({ length: 4 }, () => null)).map((st, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.06, duration: 0.4 }}
            className="border-l border-line-strong pl-3.5">
            {st ? (
              <>
                <dd className="font-display text-[22px] leading-none font-semibold tracking-tight tabular">
                  {st.d ? `${st.v.toFixed(st.d)}` : <AnimatedNumber value={st.v} />}{st.suffix}
                </dd>
                <dt className="mt-1.5 text-[12px] leading-snug text-ink-3">{st.l}</dt>
              </>
            ) : <div className="h-[52px] w-[120px] animate-pulse rounded-md bg-surface-2" />}
          </motion.div>
        ))}
      </dl>
    </section>
  );
}
