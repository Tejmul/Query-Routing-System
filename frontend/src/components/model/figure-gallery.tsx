"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const FIGURES = [
  { file: "class_distribution", title: "Messages per category", note: "Training and test split" },
  { file: "query_length", title: "Message length", note: "Words per message" },
  { file: "model_comparison", title: "Model comparison", note: "Cross-validated scores" },
  { file: "confusion_matrix", title: "Confusion matrix", note: "Test set" },
  { file: "top_terms", title: "Indicator words", note: "Top weights per category" },
] as const;

const src = (f: string) => `/api/v1/model/figures/${f}.png`;
const SMALL = { height: 32, padding: "0 12px", fontSize: 13 };
const EASE = [0.22, 1, 0.36, 1] as const;

export function FigureGallery() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fig = open == null ? null : FIGURES[open];

  useEffect(() => {
    if (open == null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + 1) % FIGURES.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i + FIGURES.length - 1) % FIGURES.length));
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open]);

  return (
    <section aria-labelledby="figures-title" className="mt-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="figures-title" className="text-[18px] font-semibold tracking-tight">Report figures</h2>
        <span className="text-xs text-ink-3">The charts used in the written report. Click one to view it full size.</span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {FIGURES.map((f, i) => (
          <motion.li key={f.file} className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}
            initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Open ${f.title} full size`}
              className="card card-hover group block w-full overflow-hidden text-left">
              <span className="relative block aspect-[16/9] border-b border-line bg-white">
                <Image src={src(f.file)} alt={f.title} fill unoptimized sizes="(min-width: 1024px) 400px, 100vw"
                  className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.03]" />
              </span>
              <span className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{f.title}</span>
                  <span className="block truncate text-xs text-ink-3">{f.note}</span>
                </span>
                <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none text-ink-3 transition-colors group-hover:text-ink" aria-hidden="true">
                  <path d="M12 3h5v5M17 3l-6 6M8 17H3v-5M3 17l6-6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>

      <AnimatePresence>
        {fig && (
          <motion.div key="lightbox" role="dialog" aria-modal="true" aria-label={fig.title}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,16,32,0.55)] p-3 backdrop-blur-sm sm:p-8"
            onClick={() => setOpen(null)}>
            <motion.figure initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25, ease: EASE }}
              className="card flex max-h-full w-full max-w-[1200px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{fig.title}</span>
                  <span className="block text-xs text-ink-3">{fig.note} · {open! + 1} of {FIGURES.length} · ← → to browse</span>
                </span>
                <span className="flex gap-2">
                  <a className="btn btn-ghost" style={SMALL} href={src(fig.file)} target="_blank" rel="noopener">Open original</a>
                  <button ref={closeRef} type="button" className="btn btn-ghost" style={SMALL} onClick={() => setOpen(null)}>Close</button>
                </span>
              </figcaption>
              <div className="min-h-0 flex-1 overflow-auto bg-white p-3 sm:p-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- full-size figure at its natural aspect ratio */}
                <img src={src(fig.file)} alt={fig.title} className="mx-auto block h-auto max-h-[calc(100vh-170px)] w-auto max-w-full" />
              </div>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
