"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Panel, PageHead } from "@/components/page-head";
import { api, send } from "@/lib/api";
import { ruleName } from "@/lib/labels";
import { capital, clock, dueText, pct, relTime, topicLabel } from "@/lib/format";
import { ORDER, type Ticket } from "@/lib/types";

const STATUS_LABEL = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;

export function InboxView() {
  const { taxonomy, label, refreshBadge, toast } = useApp();
  const [status, setStatus] = useState("open,in_progress");
  const [dept, setDept] = useState("");
  const [priority, setPriority] = useState("");
  const [review, setReview] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const latestFetch = useRef<typeof fetchPage | null>(null);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const fetchPage = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), page_size: "30" });
    if (status) params.set("status", status);
    if (dept) params.set("department", dept);
    if (priority) params.set("priority", priority);
    if (review) params.set("needs_review", "true");
    if (query) params.set("q", query);
    return api<{ total: number; items: Ticket[] }>(`/api/v1/tickets?${params}`);
  }, [status, dept, priority, review, query]);

  // First page whenever the filters change; a newer request wins over a slower older one.
  useEffect(() => {
    let current = true;
    latestFetch.current = fetchPage;
    fetchPage(1)
      .then((r) => { if (current) { setError(""); setTotal(r.total); setItems(r.items); setPage(1); } })
      .catch((err) => current && setError((err as Error).message));
    return () => { current = false; };
  }, [fetchPage]);

  // One page at a time, and a page fetched for old filters is dropped instead of appended.
  function loadMore() {
    if (loadingMore) return;
    const source = fetchPage;
    setLoadingMore(true);
    source(page + 1)
      .then((r) => {
        if (latestFetch.current !== source) return;
        setTotal(r.total);
        setItems((prev) => {
          const seen = new Set(prev.map((t) => t.ref));
          return [...prev, ...r.items.filter((t) => !seen.has(t.ref))];
        });
        setPage(page + 1);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingMore(false));
  }

  // Clicking through tickets quickly: only the last click is shown, whatever order replies arrive in.
  const openSeq = useRef(0);
  const open = useCallback((ref: string) => {
    const mine = ++openSeq.current;
    api<Ticket>(`/api/v1/tickets/${encodeURIComponent(ref)}`)
      .then((t) => { if (mine === openSeq.current) setSelected(t); })
      .catch((err) => { if (mine === openSeq.current) setError((err as Error).message); });
  }, []);

  // Opened from a toast link: /inbox?ticket=TKT-000123
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ticket");
    if (!ref) return;
    let current = true;
    api<Ticket>(`/api/v1/tickets/${encodeURIComponent(ref)}`).then((t) => current && setSelected(t)).catch((err) => current && setError((err as Error).message));
    return () => { current = false; };
  }, []);

  async function patch(body: Record<string, unknown>, message?: string) {
    if (!selected) return;
    const updated = await send<Ticket>(`/api/v1/tickets/${encodeURIComponent(selected.ref)}`, "PATCH", { actor: "you", ...body });
    setSelected(updated);
    setItems((list) => list.map((t) => (t.ref === updated.ref ? updated : t)));
    refreshBadge();
    if (message) toast(message);
  }

  const depts = taxonomy ? [...ORDER.map((c) => taxonomy.categories[c].department), taxonomy.review_department] : [];

  return (
    <Panel>
      <PageHead title="Inbox">Every routed ticket, most urgent first. Moving a ticket to another team teaches the next model.</PageHead>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="seg" role="group" aria-label="Status">
          {[["open,in_progress", "Active"], ["resolved", "Resolved"], ["", "All"]].map(([v, l]) => (
            <button key={l} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <select className="input" aria-label="Team" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All teams</option>{depts.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className="input" aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Any priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option>
        </select>
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> Needs review
        </label>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages or TKT-…" aria-label="Search tickets"
          className="input w-full sm:ml-auto sm:w-64" />
      </div>
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-xs text-ink-3">{total ? `${total.toLocaleString()} tickets` : "No tickets match these filters"}</div>
          <ol className="max-h-[calc(100vh-260px)] overflow-auto">
            <AnimatePresence initial={false}>
              {items.map((t) => {
                const cat = t.needs_review ? "review" : t.category;
                const late = t.status !== "resolved" && t.sla_breached;
                return (
                  <motion.li key={t.ref} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-b border-line last:border-0">
                    <button type="button" onClick={() => open(t.ref)} aria-current={selected?.ref === t.ref}
                      className={`relative grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${selected?.ref === t.ref ? "bg-surface-2" : ""}`}>
                      {selected?.ref === t.ref && <motion.span layoutId="inbox-sel" className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-ink" />}
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-xs text-ink-3">{t.ref}</span>
                        {t.priority !== "normal" && <span className={`badge ${t.priority === "urgent" ? "badge-urgent" : "badge-high"}`}>{capital(t.priority)}</span>}
                        <span className={`tag c-${cat} text-[13px]`}>{t.needs_review ? "Needs review" : t.label}</span>
                      </span>
                      <span className={`font-mono text-xs whitespace-nowrap ${late ? "text-danger" : "text-ink-3"}`}>{dueText(t)}</span>
                      <span className="col-span-2 truncate text-[14px]">{t.text}</span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
          {items.length < total && (
            <div className="p-3"><button type="button" className="btn btn-ghost w-full" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button></div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.article key={selected.ref} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }} className="card p-6 lg:sticky lg:top-24">
              <TicketDetail t={selected} label={label} depts={taxonomy ? ORDER.map((c) => [c, taxonomy.categories[c].department]) : []} onPatch={patch} />
            </motion.article>
          ) : (
            <div className="card grid min-h-[380px] place-items-center p-8 text-center text-ink-3">
              <div><p className="font-semibold text-ink">Select a ticket</p><p className="mt-1">See why it was routed there, change its status, or send it to another team.</p></div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

function TicketDetail({ t, label, depts, onPatch }: {
  t: Ticket; label: (c: string) => string; depts: string[][]; onPatch: (b: Record<string, unknown>, msg?: string) => Promise<void>;
}) {
  const [team, setTeam] = useState<string>(t.category);
  const [assignee, setAssignee] = useState(t.assignee ?? "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const cat = t.needs_review ? "review" : t.category;
  const late = t.status !== "resolved" && t.sla_breached;
  // One change at a time, so a double click can't send the same update twice.
  const run = async (b: Record<string, unknown>, msg?: string) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try { await onPatch(b, msg); } catch (e) { setErr((e as Error).message); throw e; } finally { setBusy(false); }
  };
  const teamChanged = team !== t.category;
  const assigneeChanged = assignee.trim() !== (t.assignee ?? "");
  const next = { open: [["in_progress", "Start work"], ["resolved", "Resolve"]], in_progress: [["resolved", "Resolve"], ["open", "Back to queue"]], resolved: [["open", "Reopen"]] }[t.status];
  const EVENT: Record<string, (d: Record<string, any>) => string> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    created: (d) => `Routed to ${d.department} at ${pct(d.confidence)} confidence`,
    rerouted: (d) => `Moved from ${label(d.from.category)} to ${label(d.to.category)}`,
    status: (d) => `Status changed to ${STATUS_LABEL[d.to as keyof typeof STATUS_LABEL] ?? d.to}`,
    assigned: (d) => (d.assignee ? `Assigned to ${d.assignee}` : "Unassigned"),
    note: (d) => `Note: “${d.note}”`,
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-semibold">{t.ref}</div>
          <div className="text-xs text-ink-3">{t.channel} · {t.customer_ref ? `${t.customer_ref} · ` : ""}created {relTime(t.created_at)}</div>
        </div>
        <div className="flex gap-1.5">
          <span className={`badge ${t.priority === "urgent" ? "badge-urgent" : t.priority === "high" ? "badge-high" : ""}`}>{capital(t.priority)}</span>
          <span className="badge">{STATUS_LABEL[t.status]}</span>
        </div>
      </div>
      <p className="my-5 rounded-xl bg-surface-2 px-4 py-3.5 text-[15px] leading-relaxed">{t.text}</p>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 text-[13px]">
        <div><dt className="text-xs text-ink-3">Team</dt><dd className="mt-0.5 font-medium">{t.department}</dd></div>
        <div><dt className="text-xs text-ink-3">Category</dt><dd className="mt-0.5 font-medium"><span className={`tag c-${cat}`}>{t.needs_review ? "Needs review" : t.label}</span>
          {t.rerouted && <span className="text-xs text-ink-3"> · model said {label(t.model_category)}</span>}</dd></div>
        <div><dt className="text-xs text-ink-3">Topic</dt><dd className="mt-0.5 font-medium">{topicLabel(t.intent)}</dd></div>
        <div><dt className="text-xs text-ink-3">Confidence</dt><dd className="mt-0.5 font-mono font-medium">{pct(t.confidence, 1)}</dd></div>
        <div><dt className="text-xs text-ink-3">Respond by</dt><dd className={`mt-0.5 font-medium ${late ? "text-danger" : ""}`}>{clock(t.due_at)} · {dueText(t)}</dd></div>
        <div><dt className="text-xs text-ink-3">Assignee</dt><dd className="mt-0.5 font-medium">{t.assignee ?? "Unassigned"}</dd></div>
      </dl>
      {t.rules_applied.length > 0 && (
        <ul className="mt-4 grid gap-1.5">
          {t.rules_applied.map((r) => (
            <li key={r.rule} className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2"
              style={{ boxShadow: `inset 3px 0 0 ${r.rule === "low_confidence" ? "var(--review)" : "var(--fraud)"}` }}>
              <b className="whitespace-nowrap text-ink">{ruleName(r.rule)}</b>{r.detail}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 grid gap-2">
        {ORDER.map((c) => (
          <div key={c} className={`c-${c} grid grid-cols-[110px_1fr_44px] items-center gap-3 text-xs text-ink-2`}>
            <span>{label(c)}</span>
            <span className="bar"><motion.span initial={{ width: 0 }} animate={{ width: `${(t.probabilities[c] ?? 0) * 100}%` }} transition={{ duration: 0.6 }} /></span>
            <span className="text-right font-mono text-ink">{pct(t.probabilities[c])}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-3 border-t border-line pt-5">
        <Row label="Status">
          {next.map(([v, l], i) => (
            <button key={v} type="button" className={`btn h-8 px-3 text-[13px] ${i ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={() => run({ status: v }).catch(() => {})}>{l}</button>
          ))}
        </Row>
        <Row label="Route to">
          <select className="input h-8 min-w-40 flex-1" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Route to team">
            {depts.map(([c, d]) => <option key={c} value={c}>{d}</option>)}
          </select>
          <button type="button" className="btn btn-ghost h-8 px-3 text-[13px]" disabled={busy || !teamChanged}
            onClick={() => run({ category: team }, `Moved to ${depts.find((x) => x[0] === team)?.[1]}. Saved as training feedback.`).catch(() => {})}>Re-route</button>
        </Row>
        <Row label="Assignee">
          <input className="input h-8 min-w-40 flex-1" value={assignee} onChange={(e) => setAssignee(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy && assigneeChanged) run({ assignee: assignee.trim() }).catch(() => {}); }} placeholder="Agent name" maxLength={64} aria-label="Assignee" />
          <button type="button" className="btn btn-ghost h-8 px-3 text-[13px]" disabled={busy || !assigneeChanged} onClick={() => run({ assignee: assignee.trim() }).catch(() => {})}>Assign</button>
        </Row>
        <Row label="Note">
          <input className="input h-8 min-w-40 flex-1" value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy && note.trim()) run({ note: note.trim() }).then(() => setNote(""), () => {}); }} placeholder="Internal note for other agents" maxLength={2000} aria-label="Internal note" />
          <button type="button" className="btn btn-ghost h-8 px-3 text-[13px]" disabled={busy || !note.trim()} onClick={() => run({ note: note.trim() }).then(() => setNote(""), () => {})}>Add</button>
        </Row>
        {err && <p className="text-[13px] text-danger">{err}</p>}
      </div>
      <ol className="mt-5 grid gap-3 border-l border-line pl-4">
        {(t.events ?? []).slice().reverse().map((e, i) => (
          <motion.li key={`${e.at}-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="relative text-[13px] text-ink-2">
            <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-line-strong" />
            <time className="block font-mono text-[11px] text-ink-3">{clock(e.at)} · {e.actor}</time>
            {(EVENT[e.type] ?? (() => e.type))(e.data)}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[88px_1fr]">
      <span className="text-xs text-ink-3">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
