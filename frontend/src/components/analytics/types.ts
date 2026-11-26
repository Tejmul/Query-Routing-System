import type { Category } from "@/lib/types";

/** Shape of GET /api/v1/analytics/summary (see bankq/db/repository.py `analytics`). */
export interface AnalyticsSummary {
  window_days: number;
  generated_at: string;
  kpis: {
    tickets: number;
    auto_routed_rate: number | null;
    review_rate: number | null;
    reroute_rate: number | null;
    open: number;
    open_sla_breached: number;
    sla_met_rate: number | null;
    avg_confidence: number | null;
    latency_p50_ms: number | null;
    latency_p95_ms: number | null;
  };
  by_day: DayRow[];
  category_mix: Record<Category, number>;
  channels: Record<string, number>;
  open_by_department: { department: string; open: number; breached: number }[];
  confidence_histogram: { bin: string; count: number }[];
  top_corrections: { from: Category; to: Category; count: number }[];
}

export type DayRow = { date: string } & Record<Category, number>;
