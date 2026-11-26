// Shapes returned by GET /api/v1/model and GET /api/v1/model/versions.

import type { Category } from "@/lib/types";

export interface PerClass { precision: number; recall: number; f1: number; support: number }

export interface Candidate {
  key: string;
  model: string;
  best_params: Record<string, string | number>;
  cv_macro_f1: number;
  cv_macro_f1_std: number;
  configs_tried?: number;
  seconds?: number;
  test_accuracy: number;
  test_macro_f1: number;
}

export interface GateCheck { check: string; value: number; op: string; threshold: number; passed: boolean }

export interface ModelCard {
  version: string;
  created_at: string;
  category_model: { key?: string; label: string; params: Record<string, string | number> };
  intent_model?: { label: string; n_intents: number };
  data: {
    train_rows: number;
    test_rows: number;
    train_counts: Partial<Record<Category, number>>;
    test_counts: Partial<Record<Category, number>>;
    sources: Record<string, number>;
    includes_feedback?: boolean;
    fingerprint: string;
  };
  model_selection: { method?: string; candidates: Candidate[] };
  metrics: {
    category: {
      accuracy: number;
      macro_f1: number;
      weighted_f1?: number;
      labels: Category[];
      confusion_matrix: number[][];
      per_class: Record<Category, PerClass>;
      misclassified?: number;
    };
    intent: { accuracy: number; macro_f1?: number; top3_accuracy: number; n_intents: number };
  };
  quality_gate: {
    passed: boolean;
    checks: GateCheck[];
    thresholds?: Record<string, number>;
    compared_with?: string | null;
  };
  top_terms: Partial<Record<Category, { term: string; weight: number }[]>>;
  environment?: Record<string, string>;
  intended_use?: string;
  limitations?: string[];
  training_seconds?: number;
}

export interface Version {
  version: string;
  created_at: string;
  model: string;
  macro_f1: number;
  fraud_recall: number;
  intent_accuracy: number;
  gate_passed: boolean;
  production: boolean;
}

export const score = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(3));

export const params = (o: Record<string, string | number>) =>
  Object.entries(o).map(([k, v]) => `${k} = ${v}`).join(", ") || "Defaults";
