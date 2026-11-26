// The network both live scenes draw: text features -> two hidden layers -> one output per team.
// It is a picture of the computation, not the model's literal weights. What makes it readable is
// that every team has a home region in each layer, so different kinds of message visibly light
// different neurons and the streams separate as they move right.

import { ORDER, type Category } from "@/lib/types";

export const TEAM: Record<Category, string> = { payments: "#00806a", cards: "#2b4fd8", loans: "#a86b12", account: "#7a3e9d", fraud: "#c81e33" };
export const REVIEW = "#6c7385";
export const INK = "#0e1420";
/** Neurons per layer: text features, hidden 1, hidden 2, team outputs. */
export const SIZES = [12, 9, 7, 5] as const;

export interface Pt { x: number; y: number }

const rgbOf = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const rgba = (hex: string, a: number) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; };
export const ink = (a: number) => `rgba(14,20,32,${a})`;
export function mix(a: string, b: string, f: number) {
  const A = rgbOf(a), B = rgbOf(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, "0")).join("");
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const easeOut = (u: number) => 1 - (1 - u) ** 3;
export const smooth = (u: number) => u * u * (3 - 2 * u);
export const lerp = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

export function hash(s: string, seed: number) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

// A fixed seed, so the network looks the same on every visit.
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(77);

/**
 * HOME[k][l][i]: how strongly neuron i of layer l (0 features, 1 hidden 1, 2 hidden 2) belongs to team k.
 * Teams sit in the same top-to-bottom order as their outputs, plus one stray neuron each so lanes cross a little.
 */
export const HOME: number[][][] = ORDER.map((_, k) =>
  [0, 1, 2].map((l) => {
    const n = SIZES[l], centre = ((k + 0.5) / ORDER.length) * n - 0.5, width = n * 0.12 + 0.4;
    const stray = Math.floor(rand() * n);
    return Array.from({ length: n }, (_, i) => clamp(Math.exp(-(((i - centre) / width) ** 2)) + (i === stray ? 0.45 : 0) + rand() * 0.12));
  }),
);

/** REST[l][i][j]: a fixed weight in 0..1 for the connection from neuron i of layer l to neuron j of layer l + 1. */
export const REST: number[][][] = [0, 1, 2].map((l) =>
  Array.from({ length: SIZES[l] }, () => Array.from({ length: SIZES[l + 1] }, () => rand())),
);

/** Pick an index with probability proportional to its weight. */
export function pick(weights: number[]) {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

/** Evenly pitched node positions for one column, centred vertically (the classic tapered-network look). */
export function column(x: number, n: number, top: number, bottom: number, maxPitch: number): Pt[] {
  const pitch = Math.min(maxPitch, (bottom - top) / n), start = (top + bottom) / 2 - (pitch * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => ({ x, y: start + pitch * i }));
}

/** Every connection between neighbouring layers as a hairline, heavier where the fixed weight is larger. */
export function drawRest(ctx: CanvasRenderingContext2D, cols: Pt[][], strength = 1) {
  ctx.lineWidth = 1;
  for (let l = 0; l < 3; l++) {
    for (const [lo, hi, alpha] of [[0, 0.5, 0.05], [0.5, 1.01, 0.1]] as const) {
      ctx.strokeStyle = ink(alpha * strength);
      ctx.beginPath();
      cols[l].forEach((a, i) => cols[l + 1].forEach((b, j) => {
        const w = REST[l][i][j];
        if (w >= lo && w < hi) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      }));
      ctx.stroke();
    }
  }
}

/** A hidden or feature neuron: white disc, ink ring, filled from the centre by its activation. */
export function drawNeuron(ctx: CanvasRenderingContext2D, p: Pt, r: number, act: number, color = INK, tint = 0) {
  const a = clamp(act);
  if (tint > 0.02 && a > 0.05) { ctx.fillStyle = rgba(color, 0.16 * tint * a); ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = tint > 0.02 ? rgba(mix(INK, color, tint), 0.3 + 0.7 * a) : ink(0.26 + 0.6 * a);
  ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.stroke();
  if (a > 0.03) {
    ctx.fillStyle = rgba(mix(INK, color, tint), 0.2 + 0.8 * a);
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, (r - 2.2) * Math.sqrt(a)), 0, 7); ctx.fill();
  }
}

/** A team's output neuron: ringed in the team colour, filled by its share (probability or volume). */
export function drawOutput(ctx: CanvasRenderingContext2D, p: Pt, r: number, share: number, color: string, glow = 0) {
  if (glow > 0.02) { ctx.fillStyle = rgba(color, 0.2 * glow); ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + glow * 7, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = color; ctx.lineWidth = 1.75;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.stroke();
  const s = clamp(share);
  if (s > 0.004) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.6, (r - 2.6) * Math.sqrt(s)), 0, 7); ctx.fill(); }
}

/** The interface typeface, for text drawn on a canvas. */
export function canvasFont() {
  return getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() || "system-ui, sans-serif";
}
