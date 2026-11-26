"use client";

import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { Panel } from "@/components/page-head";
import { api } from "@/lib/api";
import { ConfusionMatrix } from "./confusion-matrix";
import { FigureGallery } from "./figure-gallery";
import { LayaTeaser } from "./laya-teaser";
import { ModelComparison } from "./model-comparison";
import { ModelHero } from "./model-hero";
import { ModelFacts, ReleaseCheck } from "./release-check";
import { PerCategory, Versions } from "./score-tables";
import type { ModelCard, Version } from "./types";
import { IndicatorWords, IntendedUse } from "./words-and-use";

export function ModelView() {
  const [model, setModel] = useState<ModelCard | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState("");

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      api<ModelCard>("/api/v1/model"),
      api<{ versions: Version[] } | Version[]>("/api/v1/model/versions"),
    ])
      .then(([m, v]) => {
        if (!live) return;
        setModel(m);
        setVersions(Array.isArray(v) ? v : v.versions ?? []);
      })
      .catch((err: Error) => live && setError(err.message));
    return () => { live = false; };
  }, [attempt]);

  return (
    <MotionConfig reducedMotion="user">
      <Panel>
        {error ? (
          <div className="card mx-auto mt-10 max-w-md p-8 text-center">
            <p className="font-semibold text-ink">Couldn&rsquo;t load the model report</p>
            <p className="mt-1 text-[13px] text-ink-2">{error}</p>
            <button type="button" className="btn btn-ghost mt-5" onClick={() => { setError(""); setAttempt((a) => a + 1); }}>Try again</button>
          </div>
        ) : !model ? (
          <Skeleton />
        ) : (
          <>
            <ModelHero m={model} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ReleaseCheck m={model} />
              <ModelFacts m={model} />
              <ModelComparison m={model} />
              <ConfusionMatrix m={model} />
              <div className="min-w-0 lg:col-span-2"><LayaTeaser /></div>
              <div className="min-w-0 lg:col-span-2"><PerCategory m={model} /></div>
              <div className="min-w-0 lg:col-span-2"><Versions versions={versions} /></div>
              <IndicatorWords m={model} />
              <IntendedUse m={model} />
            </div>
            <FigureGallery />
          </>
        )}
      </Panel>
    </MotionConfig>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the model report" className="animate-pulse">
      <div className="h-3 w-32 rounded bg-surface-3" />
      <div className="mt-3 h-10 w-64 rounded-lg bg-surface-3" />
      <div className="mt-3 h-4 w-full max-w-[520px] rounded bg-surface-2" />
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-[178px]" />)}
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-[360px]" />)}
      </div>
    </div>
  );
}
