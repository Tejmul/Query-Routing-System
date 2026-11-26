"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** A number that counts up from zero to `value`, rendered through `format`. Static when reduced motion is on. */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const target = useMotionValue(reduce ? value : 0);
  const spring = useSpring(target, { stiffness: 60, damping: 18, mass: 0.9 });
  const text = useTransform(spring, format);
  useEffect(() => { target.set(value); }, [value, target]);
  if (reduce) return <span className={className}>{format(value)}</span>;
  return <motion.span className={className}>{text}</motion.span>;
}

/** Props for a bar that grows to `width` (a CSS length) when it scrolls into view. */
export function useGrow() {
  const reduce = useReducedMotion();
  return (width: string, delay = 0) =>
    reduce
      ? { initial: false as const, animate: { width } }
      : {
          initial: { width: "0%" },
          whileInView: { width },
          viewport: { once: true, amount: 0.4 },
          transition: { duration: 0.9, delay, ease: EASE },
        };
}

/** A card section that fades up as it enters the viewport. */
export function Section({ title, hint, children, className = "", bodyClass = "p-5 sm:p-6", id }: {
  title: string; hint?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section id={id} aria-labelledby={id ? `${id}-title` : undefined}
      initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.55, ease: EASE }}
      className={`card min-w-0 ${className}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-4 sm:px-6">
        <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </header>
      <div className={bodyClass}>{children}</div>
    </motion.section>
  );
}

export function PassIcon({ passed, className = "h-5 w-5" }: { passed: boolean; className?: string }) {
  return passed ? (
    <svg viewBox="0 0 20 20" className={`${className} flex-none text-ok`} aria-label="Passed" role="img">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path d="M6 10.4l2.6 2.6L14 7.6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className={`${className} flex-none text-danger`} aria-label="Failed" role="img">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
