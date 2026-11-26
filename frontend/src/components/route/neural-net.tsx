"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  HOME, INK, REST, SIZES, TEAM, canvasFont, clamp, column, drawNeuron, drawOutput, drawRest, easeOut, hash, ink, lerp, rgba, type Pt,
} from "@/components/net/core";
import { pct } from "@/lib/format";
import { ORDER, type Category, type CategoryInfo, type Decision, type Keyword } from "@/lib/types";

// A picture of what happens to one message, left to right:
//   words -> text features -> two hidden layers -> one output per team.
// What is real: the words and how much each one moved the decision, and every team's probability.
// What is illustration: the hidden layers. Each new decision plays as a forward pass (the signal
// crosses one layer at a time, in ink), then the route is traced back from the chosen team to the
// words that carried it, in that team's colour. Nothing is random: the same message always draws
// the same picture.

const [FEATURES, H1, H2] = SIZES;
/** When the signal crosses each gap, in seconds after the decision arrives. */
const WIN = [[0, 0.12], [0.12, 0.34], [0.34, 0.56], [0.56, 0.78]];
const ARRIVE = WIN.map((w) => w[1]);
const TRACE = 0.92, TRACE_STEP = 0.12, SETTLED = TRACE + 4 * TRACE_STEP;

interface Token { text: string; w: number; cells: number[]; y: number; ty: number }
/** A connection carrying signal across gap g (0 words to features ... 3 hidden 2 to teams), strength 0..1. */
interface Edge { g: number; i: number; j: number; f: number }
interface Pass {
  edges: Edge[]; path: Edge[]; onPath: Set<string>; color: string; t0: number;
  ghost: boolean; model: number; routed: number;
}

/** The rule's trigger phrase when a rule decided, otherwise the model's evidence. */
export function evidence(d: Decision): Keyword[] {
  const r = d.rules_applied.find((x) => x.rule === "fraud_escalation");
  const kw = r?.detail.match(/“([^”]+)”/)?.[1];
  if (!kw) return d.keywords;
  const at = d.text.toLowerCase().replace(/’/g, "'").indexOf(kw.toLowerCase());
  return at < 0 ? [] : [{ word: d.text.slice(at, at + kw.length), start: at, end: at + kw.length, impact: 1 }];
}

function tokensFor(d: Decision | null): { text: string; w: number }[] {
  if (!d) return [];
  const ev = evidence(d);
  const impact = new Map<number, number>();
  ev.forEach((k) => { for (const m of d.text.slice(k.start, k.end).matchAll(/\S+/g)) impact.set(k.start + (m.index ?? 0), k.impact); });
  const max = Math.max(0.0001, ...ev.map((k) => k.impact));
  const words = [...d.text.matchAll(/\S+/g)].map((m, i) => ({
    text: m[0].replace(/^[^\w[]+|[^\w\]]+$/g, "") || m[0], i, imp: (impact.get(m.index ?? 0) ?? 0) / max,
  }));
  const keep = words.length > 8 ? [...words].sort((a, b) => b.imp - a.imp || a.i - b.i).slice(0, 8).sort((a, b) => a.i - b.i) : words;
  return keep.map((t) => ({ text: t.text, w: ev.length ? 0.2 + 0.8 * t.imp : 0.5 }));
}

/** The strongest n of a scored list. */
function top(n: number, score: (i: number) => number, keep: number) {
  return Array.from({ length: n }, (_, i) => ({ i, s: score(i) })).filter((x) => x.s > 0.02).sort((a, b) => b.s - a.s).slice(0, keep);
}

/** Every pair across one gap, scaled to the strongest, keeping only the connections worth drawing. */
function gap(g: number, n: number, m: number, flow: (i: number, j: number) => number): Edge[] {
  const all: Edge[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) all.push({ g, i, j, f: flow(i, j) });
  const max = Math.max(1e-6, ...all.map((e) => e.f));
  return all.map((e) => ({ ...e, f: e.f / max })).filter((e) => e.f > 0.14).sort((a, b) => b.f - a.f).slice(0, 26);
}

/** Activations, signal-carrying connections and the traced route for one decision. */
function plan(d: Decision, tokens: Token[]) {
  const p = ORDER.map((c) => d.probabilities[c] ?? 0);
  const key = d.text.toLowerCase();
  const feat = new Array<number>(FEATURES).fill(0);
  tokens.forEach((t) => t.cells.forEach((c) => { feat[c] = Math.max(feat[c], t.w); }));
  // Hidden neurons follow the teams' probabilities, nudged a little by the exact wording.
  const hidden = (l: 1 | 2) => Array.from({ length: SIZES[l] }, (_, i) =>
    clamp(p.reduce((a, pk, k) => a + pk * HOME[k][l][i], 0) + ((hash(key, l * 31 + i) % 100) / 100) * 0.2 - 0.07));
  const a1 = hidden(1), a2 = hidden(2);

  const edges: Edge[] = [];
  tokens.forEach((t, i) => t.cells.forEach((c) => edges.push({ g: 0, i, j: c, f: t.w })));
  edges.push(
    ...gap(1, FEATURES, H1, (i, j) => feat[i] * a1[j] * (0.3 + 0.7 * REST[0][i][j])),
    ...gap(2, H1, H2, (i, j) => a1[i] * a2[j] * (0.3 + 0.7 * REST[1][i][j])),
    ...gap(3, H2, ORDER.length, (i, k) => a2[i] * p[k] * (0.25 + 0.75 * HOME[k][2][i])),
  );

  // The route: from the model's team back through its strongest inputs, layer by layer, to the words.
  const m = ORDER.indexOf(d.model_category);
  const path: Edge[] = [];
  const add = (g: number, i: number, j: number, f: number) => {
    if (!path.some((e) => e.g === g && e.i === i && e.j === j)) path.push({ g, i, j, f: clamp(f, 0.4, 1) });
  };
  const h2 = top(H2, (i) => a2[i] * HOME[m][2][i], 3);
  h2.forEach((h) => add(3, h.i, m, h.s / h2[0].s));
  const h1 = new Set<number>();
  h2.forEach((h) => {
    const best = top(H1, (i) => a1[i] * (0.3 + 0.7 * REST[1][i][h.i]), 2);
    best.forEach((x) => { add(2, x.i, h.i, (x.s / best[0].s) * (h.s / h2[0].s)); h1.add(x.i); });
  });
  const feats = new Set<number>();
  h1.forEach((i1) => {
    const best = top(FEATURES, (f) => feat[f] * (0.3 + 0.7 * REST[0][f][i1]), 2);
    best.forEach((x) => { add(1, x.i, i1, x.s / best[0].s); feats.add(x.i); });
  });
  tokens.forEach((t, ti) => { if (t.w >= 0.5) t.cells.forEach((c) => { if (feats.has(c)) add(0, ti, c, t.w); }); });

  const onPath = new Set<string>();
  path.forEach((e) => { onPath.add(`${e.g}:${e.i}`); onPath.add(`${e.g + 1}:${e.j}`); });
  return { target: [feat, a1, a2, p], edges, path, onPath, model: m, routed: ORDER.indexOf(d.category) };
}

/** A faint pass with no words and no winner: the network ticking over while it waits. */
function idlePass(): Pick<Pass, "edges"> & { target: number[][] } {
  const k = Math.floor(Math.random() * ORDER.length);
  const acts = [0, 1, 2].map((l) => HOME[k][l].map((v) => clamp(v * 0.7)));
  return {
    target: [...acts, new Array<number>(ORDER.length).fill(0)],
    edges: [
      ...gap(1, FEATURES, H1, (i, j) => acts[0][i] * acts[1][j] * (0.3 + 0.7 * REST[0][i][j])),
      ...gap(2, H1, H2, (i, j) => acts[1][i] * acts[2][j] * (0.3 + 0.7 * REST[1][i][j])),
      ...gap(3, H2, ORDER.length, (i, j) => (j === k ? acts[2][i] : 0)),
    ],
  };
}

export function NeuralNet({ decision, busy, categories }: {
  decision: Decision | null; busy?: boolean; categories: Record<Category, CategoryInfo> | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const outs = useRef<Record<string, HTMLLIElement | null>>({});
  const [cols, setCols] = useState({ words: 70, features: 200, hidden: 340, teams: 520, ready: false });
  const eng = useRef({
    w: 0, h: 0, narrow: false, labelW: 112, x0: 0, cardX: 0, top: 34, bottom: 0,
    tokens: [] as Token[], cols: [[], [], [], []] as Pt[][],
    target: SIZES.map((n) => new Array<number>(n).fill(0)), shown: SIZES.map((n) => new Array<number>(n).fill(0)),
    pass: null as Pass | null, prev: null as { pass: Pass; from: number; dur: number } | null,
    now: 0, nextIdle: 0.9, idleEnds: 0, decision: null as Decision | null, busy: false, font: "sans-serif",
  });
  useEffect(() => { eng.current.busy = !!busy; }, [busy]);

  function placeTokens(snap: boolean) {
    const e = eng.current, n = e.tokens.length;
    const pitch = Math.min(e.narrow ? 26 : 32, (e.bottom - e.top) / Math.max(n, 1));
    const start = (e.top + e.bottom) / 2 - (pitch * (n - 1)) / 2;
    e.tokens.forEach((t, i) => { t.ty = start + pitch * i; if (snap) t.y = t.ty; });
  }

  // A new decision: swap in its words, fade the old pass out and start the new forward pass.
  useEffect(() => {
    const e = eng.current;
    e.decision = decision;
    if (e.pass) e.prev = { pass: e.pass, from: e.now, dur: e.pass.ghost ? 0.5 : 0.22 };
    const old = e.tokens;
    e.tokens = tokensFor(decision).map((t, i) => {
      const a = hash(t.text.toLowerCase(), 1) % FEATURES, b = hash(t.text.toLowerCase(), 2) % FEATURES;
      return { ...t, cells: a === b ? [a] : [a, b], y: old[i]?.y ?? 0, ty: 0 };
    });
    placeTokens(false);
    e.tokens.forEach((t, i) => { if (!old[i]) t.y = t.ty; });
    if (decision) {
      const pl = plan(decision, e.tokens);
      e.target = pl.target;
      e.pass = { ...pl, color: TEAM[decision.model_category], t0: e.now, ghost: false };
    } else {
      e.pass = null;
      e.target = SIZES.map((n) => new Array<number>(n).fill(0));
      e.nextIdle = e.now + 0.6;
    }
  }, [decision]);

  useEffect(() => {
    const e = eng.current;
    if (!canvas.current || !wrap.current) return;
    const ctx = canvas.current.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    e.font = canvasFont();

    const layout = () => {
      // The page can be hidden or unmounted (Next keeps routes alive) while a resize is pending.
      const el = wrap.current, cv = canvas.current;
      if (!el || !cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      e.w = el.clientWidth; e.h = el.clientHeight;
      cv.width = Math.round(e.w * dpr); cv.height = Math.round(e.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = el.getBoundingClientRect();
      const ys: number[] = [];
      e.cardX = e.w;
      ORDER.forEach((c) => {
        const r = outs.current[c]?.getBoundingClientRect();
        if (!r) return;
        ys.push(r.top - base.top + r.height / 2);
        e.cardX = Math.min(e.cardX, r.left - base.left);
      });
      if (ys.length < ORDER.length) return;
      e.narrow = e.w < 560;
      e.labelW = e.narrow ? 60 : 112;
      e.top = 34; e.bottom = e.h - 8;
      e.x0 = e.labelW + 12;
      const outX = e.cardX - (e.narrow ? 16 : 32), span = outX - e.x0;
      e.cols = [
        column(e.x0 + span * 0.26, FEATURES, e.top, e.bottom, 30),
        column(e.x0 + span * 0.52, H1, e.top, e.bottom, 37),
        column(e.x0 + span * 0.77, H2, e.top, e.bottom, 42),
        ys.map((y) => ({ x: outX, y })),
      ];
      placeTokens(true);
      setCols({ words: e.x0 - e.labelW / 2, features: e.cols[0][0].x, hidden: (e.cols[1][0].x + e.cols[2][0].x) / 2, teams: e.cardX, ready: true });
    };

    const at = (layer: number, i: number): Pt | undefined =>
      layer === 0 ? (e.tokens[i] ? { x: e.x0, y: e.tokens[i].y } : undefined) : e.cols[layer - 1][i];
    const seg = (a: Pt, b: Pt) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    const dot = (p: Pt, r: number) => { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); };

    /** One pass at time t since it started, drawn at strength k (the outgoing pass fades through k). */
    const drawPass = (ps: Pass, t: number, k: number, words: boolean) => {
      const dim = ps.ghost ? 0.45 : 1;
      ctx.lineCap = "round";
      for (const ed of ps.edges) {
        if (ed.g === 0 && !words) continue;
        const u = clamp((t - WIN[ed.g][0]) / (WIN[ed.g][1] - WIN[ed.g][0]));
        const a = at(ed.g, ed.i), b = at(ed.g + 1, ed.j);
        if (u <= 0 || !a || !b) continue;
        const head = lerp(a, b, easeOut(u));
        ctx.strokeStyle = ink((0.05 + 0.34 * ed.f) * k * dim); ctx.lineWidth = 1 + 0.8 * ed.f;
        seg(a, head);
        if (u < 1 && ed.f > 0.4) { ctx.fillStyle = ink(0.75 * k * dim); dot(head, 1.7); }
      }
      // the route, traced back from the team to the words
      for (const ed of ps.path) {
        if (ed.g === 0 && !words) continue;
        const u = clamp((t - (TRACE + (3 - ed.g) * TRACE_STEP)) / TRACE_STEP);
        const a = at(ed.g, ed.i), b = at(ed.g + 1, ed.j);
        if (u <= 0 || !a || !b) continue;
        ctx.strokeStyle = rgba(ps.color, (0.4 + 0.55 * ed.f) * k); ctx.lineWidth = 1.5 + 1.4 * ed.f;
        seg(b, lerp(b, a, easeOut(u)));
      }
    };

    const draw = (dt: number) => {
      const ps = e.pass;
      const still = reduce.matches;
      const t = ps ? (still ? 99 : e.now - ps.t0) : 0;
      const r = e.narrow ? { tok: 2.6, feat: 3.4, hid: 4.3, out: 6 } : { tok: 3.4, feat: 5, hid: 6.5, out: 8.5 };
      ctx.clearRect(0, 0, e.w, e.h);

      // words: ease towards their rows; with no message, hollow placeholders keep the first layer visible
      const glide = still ? 1 : 1 - Math.exp(-dt * 14);
      e.tokens.forEach((tk) => { tk.y += (tk.ty - tk.y) * glide; });
      const ghosts = e.tokens.length ? [] : column(e.x0, 5, e.top, e.bottom, 34);
      ctx.strokeStyle = ink(0.07); ctx.lineWidth = 1;
      ghosts.forEach((g, i) => [i * 2 + 1, (i * 5 + 4) % FEATURES].forEach((c) => seg(g, e.cols[0][c])));

      drawRest(ctx, e.cols);

      if (e.prev) {
        const k = 1 - (e.now - e.prev.from) / e.prev.dur;
        if (k <= 0 || still) e.prev = null; else drawPass(e.prev.pass, 99, k, false);
      }
      if (ps) drawPass(ps, t, 1, true);

      // a pulse keeps running along the settled route, words to team
      const live = ps && !ps.ghost && !still && t > SETTLED;
      const wave = live ? ((t - SETTLED) * 1.9) % 5.6 : -1;
      if (ps && live) {
        ctx.fillStyle = ps.color;
        for (const ed of ps.path) {
          const u = wave - ed.g;
          const a = at(ed.g, ed.i), b = at(ed.g + 1, ed.j);
          if (u < 0 || u > 1 || !a || !b) continue;
          const q = lerp(a, b, u);
          ctx.globalAlpha = Math.min(1, u * 6, (1 - u) * 6); dot(q, 2.6); ctx.globalAlpha = 1;
        }
      }

      // team connectors, and the switch a rule throws when it overrides the model
      const hop = ps && !ps.ghost && ps.model !== ps.routed;
      ORDER.forEach((c, k) => {
        const o = e.cols[3][k];
        const won = !!ps && !ps.ghost && k === ps.routed && !hop;
        const grow = won ? clamp((t - ARRIVE[3]) / 0.18) : 0;
        ctx.strokeStyle = rgba(TEAM[c], 0.28); ctx.lineWidth = 1.25;
        seg({ x: o.x + r.out, y: o.y }, { x: e.cardX, y: o.y });
        if (grow > 0) {
          ctx.strokeStyle = TEAM[c]; ctx.lineWidth = 2.25;
          seg({ x: o.x + r.out, y: o.y }, { x: o.x + r.out + (e.cardX - o.x - r.out) * easeOut(grow), y: o.y });
        }
      });
      if (ps && hop) {
        const a = e.cols[3][ps.model], b = e.cols[3][ps.routed], show = clamp((t - TRACE) / 0.3);
        const mid = a.x + r.out + (e.cardX - a.x - r.out) * 0.55, bend = Math.min(7, Math.abs(b.y - a.y) / 2);
        if (show > 0) {
          ctx.globalAlpha = show;
          ctx.strokeStyle = TEAM[ORDER[ps.routed]]; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = still ? 0 : -e.now * 26;
          ctx.beginPath(); ctx.moveTo(a.x + r.out, a.y);
          ctx.arcTo(mid, a.y, mid, b.y, bend); ctx.arcTo(mid, b.y, e.cardX, b.y, bend); ctx.lineTo(e.cardX, b.y);
          ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      }

      // neurons fill as the signal reaches their layer, then take the team colour as the trace passes back
      const ease = still ? 1 : 1 - Math.exp(-dt * 16);
      for (let l = 0; l < 4; l++) {
        const reveal = ps ? clamp((t - ARRIVE[l] + 0.05) / 0.14) : 1;
        e.cols[l].forEach((p, i) => {
          e.shown[l][i] += (e.target[l][i] * reveal - e.shown[l][i]) * ease;
          if (l === 3) return;
          const traced = ps && ps.onPath.has(`${l + 1}:${i}`) ? clamp((t - (TRACE + (3 - l) * TRACE_STEP)) / 0.12) : 0;
          drawNeuron(ctx, p, l === 0 ? r.feat : r.hid, e.shown[l][i], ps?.color ?? INK, traced);
        });
      }
      ORDER.forEach((c, k) => {
        const o = e.cols[3][k];
        const mine = !!ps && !ps.ghost && k === ps.model;
        const landed = mine ? clamp((t - ARRIVE[3]) / 0.5) : 0;
        if (mine && landed > 0 && landed < 1) { // the decision landing
          ctx.strokeStyle = rgba(TEAM[c], (1 - landed) * 0.55); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(o.x, o.y, r.out + 3 + easeOut(landed) * 16, 0, 7); ctx.stroke();
        }
        const beat = mine && wave >= 4 ? clamp(1 - (wave - 4) / 1.2) : 0;
        drawOutput(ctx, o, r.out, e.shown[3][k], TEAM[c], Math.max(beat, mine ? 0.35 * clamp(landed * 2) : 0));
      });

      // input words: heavier ink for the words that moved the decision most
      ctx.textBaseline = "middle"; ctx.textAlign = "right";
      e.tokens.forEach((tk, i) => {
        const traced = ps && ps.onPath.has(`0:${i}`) ? clamp((t - SETTLED + 0.1) / 0.14) : 0;
        const p = { x: e.x0, y: tk.y };
        if (traced > 0 && ps) { ctx.fillStyle = rgba(ps.color, 0.16 * traced); dot(p, r.tok + 5); }
        ctx.fillStyle = traced > 0 && ps ? rgba(ps.color, 0.5 + 0.5 * traced) : ink(0.3 + 0.55 * tk.w); dot(p, r.tok + tk.w * 1.2);
        ctx.font = `${tk.w > 0.6 ? 600 : 500} ${e.narrow ? 11 : 12.5}px ${e.font}`;
        let label = tk.text;
        while (label.length > 1 && ctx.measureText(label).width > e.labelW - 10) label = label.slice(0, -1);
        if (label !== tk.text) label = `${label.slice(0, -1)}…`;
        ctx.fillStyle = ink(0.5 + 0.5 * tk.w);
        ctx.fillText(label, p.x - 11, p.y + 0.5);
      });
      ghosts.forEach((g, i) => {
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = ink(0.24); ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.arc(g.x, g.y, r.tok + 0.6, 0, 7); ctx.fill(); ctx.stroke();
        const wdt = [46, 62, 34, 54, 40][i] * (e.narrow ? 0.6 : 1);
        ctx.fillStyle = ink(0.08); ctx.beginPath(); ctx.roundRect(g.x - 12 - wdt, g.y - 4, wdt, 8, 4); ctx.fill();
      });
    };

    let raf = 0, last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
      last = ts; e.now = ts / 1000;
      if (document.hidden || !e.w || !e.cols[3].length) return;
      // waiting for a message: a faint pass every few seconds (quicker while a request is in flight)
      if (!e.decision && !reduce.matches) {
        if (e.pass?.ghost && e.now > e.idleEnds) {
          e.prev = { pass: e.pass, from: e.now, dur: 0.7 }; e.pass = null;
          e.target = SIZES.map((n) => new Array<number>(n).fill(0));
        }
        if (!e.pass && e.now > e.nextIdle) {
          const g = idlePass();
          e.target = g.target;
          e.pass = { edges: g.edges, path: [], onPath: new Set(), color: INK, t0: e.now, ghost: true, model: -1, routed: -1 };
          e.idleEnds = e.now + 1.25; e.nextIdle = e.now + (e.busy ? 1.5 : 3.4);
        }
      }
      draw(dt);
    };

    layout();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(layout);
    ro.observe(wrap.current);
    document.fonts?.ready.then(() => { e.font = canvasFont(); });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const d = decision;
  const byRule = !!d?.rules_applied.some((r) => r.rule === "fraud_escalation");
  return (
    <div className="flex min-h-[440px] flex-1 flex-col">
      <div ref={wrap} className="relative flex-1">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img"
          aria-label={d ? `Network diagram: the message is routed to ${categories?.[d.category]?.label ?? d.category}.` : "Network diagram: words, text features, hidden layers and five teams. Waiting for a message."} />
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-6 transition-opacity duration-300 ${cols.ready ? "opacity-100" : "opacity-0"}`} aria-hidden="true">
          {[["Words", cols.words, ""], ["Text features", cols.features, "hidden sm:block"], ["Hidden layers", cols.hidden, ""]].map(([l, x, cls]) => (
            <span key={l as string} className={`eyebrow absolute top-1 -translate-x-1/2 text-[10px] whitespace-nowrap ${cls}`} style={{ left: x as number }}>{l}</span>
          ))}
          <span className="eyebrow absolute top-1 text-[10px]" style={{ left: cols.teams }}>Teams</span>
        </div>
        <ol className="absolute top-8 right-0 bottom-0 grid w-[128px] grid-rows-5 gap-2 sm:w-[212px]" aria-label="Team probabilities">
          {ORDER.map((c) => {
            const p = d?.probabilities[c] ?? 0;
            const win = d?.category === c;
            const model = byRule && d?.model_category === c;
            return (
              <motion.li key={c} ref={(el) => { outs.current[c] = el; }}
                className={`c-${c} relative grid grid-cols-[1fr_auto] content-center gap-x-2.5 overflow-hidden rounded-xl border px-3 py-2`}
                animate={{
                  borderColor: win ? "var(--c)" : "var(--border)",
                  backgroundColor: win ? "color-mix(in srgb, var(--c) 7%, #ffffff)" : "#ffffff",
                  boxShadow: win ? "0 0 0 3px color-mix(in srgb, var(--c) 14%, transparent), 0 14px 28px -16px var(--c)" : "0 1px 2px rgba(14,20,32,0.05), 0 0 0 0 transparent",
                }}
                transition={{ duration: 0.3, delay: win ? 0.7 : 0, ease: [0.2, 0.8, 0.2, 1] }}>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                  <span className="truncate">{categories?.[c]?.label ?? c}</span>
                  {(win || model) && (
                    <span className={`hidden rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase sm:inline ${win ? "bg-cat text-white" : "text-ink-2 ring-1 ring-line-strong"}`}>
                      {win ? (d!.needs_review ? "Review" : "Routed") : "Model"}
                    </span>
                  )}
                </span>
                <span className={`row-span-2 self-center font-mono text-[14px] tabular ${win ? "font-semibold text-ink" : "text-ink-3"}`}>
                  {!d ? "" : win && byRule ? "Rule" : pct(p)}
                </span>
                <span className="hidden truncate text-[11px] text-ink-3 sm:block">{categories?.[c]?.department}</span>
                <span className="absolute right-3 bottom-1.5 left-3 h-0.5 overflow-hidden rounded bg-surface-3">
                  <motion.span className="block h-full origin-left bg-cat" style={{ width: "100%" }} initial={false}
                    animate={{ scaleX: p }} transition={{ duration: 0.5, delay: d ? 0.7 : 0, ease: [0.2, 0.8, 0.2, 1] }} />
                </span>
              </motion.li>
            );
          })}
        </ol>
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug text-ink-3">
        The words, their weight and each team’s score are this message’s real values. The hidden layers illustrate the computation.
      </p>
    </div>
  );
}
