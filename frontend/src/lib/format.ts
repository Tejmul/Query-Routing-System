export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;

export const pctSoft = (x: number) => (x < 0.005 ? "<1%" : pct(x));

export const num = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString());

export const bytes = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toFixed(1)} MB`);

export const clock = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function relTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function span(m: number) {
  m = Math.abs(m);
  return m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

export function dueText(t: { status: string; sla_breached: boolean; due_at: string }) {
  if (t.status === "resolved") return t.sla_breached ? "Closed late" : "Closed on time";
  const mins = Math.round((new Date(t.due_at).getTime() - Date.now()) / 60000);
  return mins < 0 ? `Overdue ${span(mins)}` : `Due in ${span(mins)}`;
}

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const topicLabel = (intent: string | null) =>
  intent ? capital(intent.replace(/_/g, " ").replace(/\?$/, "").trim().toLowerCase()) : "–";

/** Response window in whole minutes or hours: 0.5 → "30 min", 4 → "4 h", 1.5 → "1.5 h". */
export function slaText(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}
