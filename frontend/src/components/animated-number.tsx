"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

/** A number that springs smoothly to each new value instead of jumping. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const target = useMotionValue(value);
  const spring = useSpring(target, { stiffness: 80, damping: 20, mass: 0.6 });
  const text = useTransform(spring, (v) => Math.round(v).toLocaleString());
  useEffect(() => { target.set(value); }, [value, target]);
  return <motion.span className={className}>{text}</motion.span>;
}
