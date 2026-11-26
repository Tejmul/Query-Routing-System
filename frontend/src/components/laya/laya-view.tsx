"use client";

import { MotionConfig, motion } from "motion/react";
import { useApp } from "@/components/app-provider";
import { Panel } from "@/components/page-head";
import { LAYA_GITHUB, LAYA_MODEL_CARD } from "./links";
import { Pipelines } from "./pipelines";
import { QuestionCard } from "./question-card";
import { RunPanel } from "./run-panel";
import { SpecTable } from "./spec-table";
import { TimeRace, TimeTable, useSpeeds } from "./time-race";

const EASE = [0.22, 1, 0.36, 1] as const;

export function LayaView() {
  const { modelVersion } = useApp();
  const speeds = useSpeeds();
  const rise = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.06 * i, ease: EASE } });

  return (
    <MotionConfig reducedMotion="user">
      <Panel>
        <motion.header {...rise(0)} className="mb-8">
          <div className="eyebrow">Challenger model</div>
          <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.025em] sm:text-[40px]">Laya, side by side with our model</h1>
          <p className="mt-2 max-w-[680px] text-[15px] leading-relaxed text-ink-2">
            Laya is an open-weights decision model: give it a message and a question, and it answers with a probability for every option in one
            forward pass. It is plugged in next to our model so the two can be compared on the same messages. It is switched off: every message is still
            routed by our model.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a href={LAYA_GITHUB} target="_blank" rel="noreferrer" className="btn btn-primary h-9 px-4 text-[13px]">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Laya on GitHub ↗
            </a>
            <a href={LAYA_MODEL_CARD} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 px-4 text-[13px]">Model card ↗</a>
            <span className="chip ml-1"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Routing: our model{modelVersion ? ` · ${modelVersion}` : ""}</span>
            <span className="chip"><span className="h-1.5 w-1.5 rounded-full bg-[#8b93a7]" />Laya: integrated, not routing</span>
          </div>
        </motion.header>

        <motion.section {...rise(1)} aria-label="How each model decides">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-2">How each one decides</h2>
          <Pipelines />
        </motion.section>

        <motion.section {...rise(2)} className="mt-8" aria-label="Time">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-2">Time</h2>
          {speeds === undefined ? (
            <div className="card h-[260px] animate-pulse" aria-busy="true" />
          ) : speeds ? (
            <div className="grid gap-4">
              <TimeRace report={speeds} />
              <TimeTable report={speeds} />
            </div>
          ) : (
            <div className="card p-6 text-[13px] text-ink-2">No timings yet. Run the comparison below and they appear here.</div>
          )}
        </motion.section>

        <motion.section {...rise(3)} className="mt-8" aria-label="Side by side">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-2">Side by side</h2>
          <SpecTable />
        </motion.section>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <QuestionCard />
          <RunPanel />
        </div>
      </Panel>
    </MotionConfig>
  );
}
