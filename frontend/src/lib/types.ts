// Shapes returned by the FastAPI backend (see bankq/api).

export const ORDER = ["payments", "cards", "loans", "account", "fraud"] as const;
export type Category = (typeof ORDER)[number];
export type Priority = "urgent" | "high" | "normal";

export interface CategoryInfo {
  label: string;
  department: string;
  priority: Priority;
  sla_hours: number;
  description: string;
}

export interface Taxonomy {
  categories: Record<Category, CategoryInfo>;
  review_department: string;
  review_threshold: number;
  secondary_threshold: number;
}

export interface Intent { intent: string; label: string; confidence: number }
export interface Rule { rule: string; detail: string }
export interface Keyword { word: string; start: number; end: number; impact: number }

export interface Decision {
  text: string;
  pii_redacted: string[];
  category: Category;
  label: string;
  intent: Intent | null;
  intent_alternatives: Intent[];
  confidence: number;
  model_category: Category;
  secondary_category: Category | null;
  probabilities: Record<Category, number>;
  needs_review: boolean;
  department: string;
  priority: Priority;
  sla_hours: number;
  due_at: string;
  rules_applied: Rule[];
  keywords: Keyword[];
  model_version: string;
  latency_ms: number;
  ticket_ref: string | null;
}

export interface TicketEvent { at: string; actor: string; type: string; data: Record<string, unknown> }

export interface Ticket {
  ref: string;
  created_at: string;
  channel: string;
  customer_ref: string | null;
  text: string;
  pii_redacted: string[];
  category: Category;
  label: string;
  model_category: Category;
  rerouted: boolean;
  intent: string | null;
  confidence: number;
  probabilities: Record<Category, number>;
  needs_review: boolean;
  rules_applied: Rule[];
  department: string;
  priority: Priority;
  status: "open" | "in_progress" | "resolved";
  assignee: string | null;
  due_at: string;
  resolved_at: string | null;
  sla_breached: boolean;
  events?: TicketEvent[];
}

export interface LiveRow {
  seq: number;
  row: number;
  text: string;
  category: Category;
  department: string;
  priority: Priority;
  confidence: number;
  needs_review: boolean;
  topic: string;
  rules: string;
}

export interface JobSummary {
  rows: number;
  routed: number;
  skipped_empty: number;
  urgent: number;
  needs_review: number;
  categories: Record<Category, number>;
  rules: Record<string, number>;
  seconds: number;
  rows_per_second: number | null;
  workers: number;
  live?: LiveRow[];
}

export interface Job {
  id: string;
  filename: string;
  status: "queued" | "running" | "done" | "failed";
  total: number;
  processed: number;
  progress: number;
  summary: Partial<JobSummary>;
  error: string | null;
  model_version: string | null;
}

export interface BatchResult {
  results: Decision[];
  summary: { total: number; counts: Record<Category, number>; needs_review: number; urgent: number };
}
