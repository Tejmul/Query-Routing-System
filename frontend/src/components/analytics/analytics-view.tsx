"use client";

import Link from "next/link";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Panel, PageHead } from "@/components/page-head";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { ORDER } from "@/lib/types";
import { Channels, CategoryMix, Corrections, TeamLoad } from "./breakdowns";
import { ChartCard, rise, stagger, ViewToggle } from "./chart-kit";
import { ConfidenceChart } from "./confidence-chart";
import { CategoryLegend, DailyChart, DailyTable } from "./daily-chart";
import { KpiRow } from "./kpis";
import type { AnalyticsSummary } from "./types";

const WINDOWS = [7, 14, 30] as const;

export function AnalyticsView() {
  const { taxonomy, label } = useApp();
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let live = true;
    api<AnalyticsSummary>(`/api/v1/analytics/summary?days=${days}`)
      .then((r) => { if (live) { setData(r); setError(""); } })
      .catch((err) => { if (live) setError((err as Error).message); });
    return () => { live = false; };
  }, [days, attempt]);

  const deptCategory = useMemo(() => {
    const m: Record<string, string> = {};
    if (taxonomy) {
      ORDER.forEach((c) => { m[taxonomy.categories[c].department] = c; });
      m[taxonomy.review_department] = "review";
    }
    return m;
  }, [taxonomy]);

  // While a new window loads, the previous render stays on screen, dimmed: no skeleton flash.
  const stale = data != null && data.window_days !== days;
  const updated = data ? new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <MotionConfig reducedMotion="user">
      <Panel>
        <PageHead title="Analytics"
          aside={
            <div className="flex items-center gap-3">
              {updated && <span className="hidden text-xs text-ink-3 sm:inline">Updated {updated}</span>}
              <div className="seg" role="group" aria-label="Time range">
                {WINDOWS.map((w) => (
                  <button key={w} type="button" aria-pressed={days === w} onClick={() => setDays(w)}>{w}d</button>
                ))}
              </div>
            </div>
          }>
          Volumes, deadlines and how often agents had to correct the model.
        </PageHead>

        {error && (
          <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4" role="alert">
            <p className="text-[13px] text-danger">Couldn&apos;t load analytics: {error}</p>
            <button type="button" className="btn btn-ghost h-8" onClick={() => { setError(""); setAttempt((a) => a + 1); }}>Try again</button>
          </div>
        )}

        {!data ? (!error && <Skeleton />) : (
          <div className={`transition-opacity duration-300 ${stale ? "pointer-events-none opacity-55" : ""}`} aria-busy={stale}>
            {data.kpis.tickets === 0 ? (
              <EmptyState days={data.window_days} />
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="show">
                <KpiRow data={data} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <ChartCard className="lg:col-span-8" title="Tickets per day" sub="By final category, after agent corrections."
                    aside={<ViewToggle table={table} onChange={setTable} label="Tickets per day view" />}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={table ? "table" : "chart"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }} className="flex flex-1 flex-col">
                        {table ? <DailyTable days={data.by_day} label={label} /> : (
                          <>
                            <CategoryLegend label={label} />
                            <DailyChart days={data.by_day} label={label} runKey={data.window_days} />
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </ChartCard>

                  <ChartCard className="lg:col-span-4" title="Category mix" sub={`Share of ${data.kpis.tickets.toLocaleString()} tickets in the period.`}>
                    <CategoryMix mix={data.category_mix} label={label} runKey={data.window_days} />
                    <div className="mt-5 border-t border-line pt-5">
                      <h3 className="mb-3.5 text-[13px] font-semibold text-ink">By channel</h3>
                      <Channels channels={data.channels} runKey={data.window_days} />
                    </div>
                  </ChartCard>

                  <ChartCard className="lg:col-span-7" title="Model confidence"
                    sub={`Tickets by top-category confidence · average ${pct(data.kpis.avg_confidence, 1)}`}>
                    <ConfidenceChart bins={data.confidence_histogram} threshold={taxonomy?.review_threshold} runKey={data.window_days} />
                  </ChartCard>

                  <ChartCard className="lg:col-span-5" title="Open work by team"
                    sub={`${data.kpis.open.toLocaleString()} open or in progress; hatched is past its response deadline.`}>
                    <TeamLoad rows={data.open_by_department} deptCategory={deptCategory} runKey={data.window_days} />
                  </ChartCard>

                  <ChartCard className="lg:col-span-12" title="Where agents corrected the model"
                    sub={<>{pct(data.kpis.reroute_rate, 1)} of tickets were moved to another team. Each one is training data for the next model (<code className="font-mono text-[12px]">make retrain</code>).</>}>
                    <Corrections rows={data.top_corrections} label={label} />
                  </ChartCard>

                </div>
              </motion.div>
            )}
          </div>
        )}
      </Panel>
    </MotionConfig>
  );
}

function EmptyState({ days }: { days: number }) {
  return (
    <motion.div variants={rise} initial="hidden" animate="show" className="card grid place-items-center px-6 py-16 text-center">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      </div>
      <p className="text-[16px] font-semibold tracking-tight text-ink">No tickets in the last {days} days</p>
      <p className="mt-1.5 max-w-sm text-[13.5px] text-ink-2">
        Route some messages, or run <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">make seed</code> to load demo traffic.
      </p>
      <Link href="/" className="btn btn-primary mt-6">Route a message</Link>
    </motion.div>
  );
}

function Skeleton() {
  const block = "animate-pulse rounded-md bg-surface-3";
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card p-5"><div className={`${block} h-3 w-20`} /><div className={`${block} mt-4 h-6 w-16`} /><div className={`${block} mt-3 h-2.5 w-24`} /></div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="card h-[380px] p-6 lg:col-span-8"><div className={`${block} h-4 w-32`} /></div>
        <div className="card h-[380px] p-6 lg:col-span-4"><div className={`${block} h-4 w-28`} /></div>
      </div>
    </div>
  );
}
