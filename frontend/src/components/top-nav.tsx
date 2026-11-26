"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useApp } from "./app-provider";

const NAV = [
  { href: "/", label: "Route" },
  { href: "/batch", label: "Bulk routing" },
  { href: "/inbox", label: "Inbox" },
  { href: "/analytics", label: "Analytics" },
  { href: "/model", label: "Model" },
  { href: "/laya", label: "Laya" },
];

export function Logo() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand">
      <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
        <path d="M6 16h7l4-6h9M13 16l4 6h9" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function TopNav() {
  const path = usePathname();
  const { urgentOpen, modelVersion, online } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:gap-6 sm:px-8" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="hidden font-display text-[16px] font-semibold tracking-tight sm:inline">Routing Desk</span>
        </Link>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors
                  ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}>
                {active && (
                  <motion.span layoutId="nav-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    className="absolute inset-0 rounded-lg bg-surface-3" />
                )}
                <span className="relative">{n.label}</span>
                {n.href === "/inbox" && urgentOpen > 0 && (
                  <span className="relative rounded-full bg-[var(--fraud)] px-1.5 font-mono text-[10px] font-bold text-white" title={`${urgentOpen} urgent tickets open`}>{urgentOpen}</span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 md:flex">
          {online ? <span className="live-dot" /> : <span className={`h-2 w-2 rounded-full ${online === false ? "bg-danger" : "bg-ink-3"}`} />}
          <span className="font-mono text-[11px] text-ink-2">{online === false ? "API offline" : modelVersion ? `model ${modelVersion}` : "connecting…"}</span>
        </div>
        <a href="/docs" target="_blank" rel="noopener" className="hidden text-[13px] font-medium text-ink-2 hover:text-ink sm:inline">API docs</a>
      </nav>
    </header>
  );
}
