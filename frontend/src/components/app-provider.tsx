"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, KEY_STORE } from "@/lib/api";
import type { Category, Taxonomy, Ticket } from "@/lib/types";

interface Toast { id: number; text: string; action?: { label: string; href: string } }

interface AppState {
  taxonomy: Taxonomy | null;
  modelVersion: string | null;
  online: boolean | null;
  urgentOpen: number;
  refreshBadge: () => void;
  toast: (text: string, action?: Toast["action"]) => void;
  label: (c: Category | string) => string;
}

const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [urgentOpen, setUrgentOpen] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [needsKey, setNeedsKey] = useState(false);
  const toastId = useRef(0);

  const refreshBadge = useCallback(() => {
    api<{ total: number; items: Ticket[] }>("/api/v1/tickets?status=open,in_progress&priority=urgent&page_size=1")
      .then((r) => setUrgentOpen(r.total))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([api<Taxonomy>("/api/v1/taxonomy"), api<{ model_version: string }>("/ready")])
      .then(([t, r]) => { setTaxonomy(t); setModelVersion(r.model_version); setOnline(true); refreshBadge(); })
      .catch(() => setOnline(false));
    const onKey = () => setNeedsKey(true);
    window.addEventListener("bankq:needs-key", onKey);
    return () => window.removeEventListener("bankq:needs-key", onKey);
  }, [refreshBadge]);

  const toast = useCallback((text: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const label = useCallback((c: string) => taxonomy?.categories[c as Category]?.label ?? c, [taxonomy]);

  return (
    <AppContext.Provider value={{ taxonomy, modelVersion, online, urgentOpen, refreshBadge, toast, label }}>
      {needsKey && <KeyBar />}
      {children}
      <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="pointer-events-auto flex items-center gap-4 rounded-xl bg-brand px-4 py-3 text-[13px] text-on-brand shadow-card">
              <span>{t.text}</span>
              {t.action && <a className="font-semibold underline" href={t.action.href}>{t.action.label}</a>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  );
}

function KeyBar() {
  const [key, setKey] = useState("");
  return (
    <form className="flex flex-wrap items-center gap-3 bg-brand px-6 py-2.5 text-on-brand"
      onSubmit={(e) => { e.preventDefault(); try { localStorage.setItem(KEY_STORE, key.trim()); } catch {} location.reload(); }}>
      <label htmlFor="api-key" className="text-[13px]">This server requires an API key.</label>
      <input id="api-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste API key"
        className="input h-8 text-ink" />
      <button className="btn h-8 bg-on-brand text-brand" type="submit">Use key</button>
    </form>
  );
}
