"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { HOME, INK, REVIEW, SIZES, TEAM, canvasFont, clamp, column, drawNeuron, drawOutput, drawRest, ink, mix, pick, rgba, smooth, type Pt } from "@/components/net/core";
import { pct } from "@/lib/format";
import { ORDER, type Category, type CategoryInfo, type Job, type LiveRow } from "@/lib/types";

// The live scene for a running bulk job: the same network the Route page draws, with a file's worth
// of messages streaming through it. Everything shown comes from the job's real progress:
// - labelled packets are sampled routed messages (masked text) travelling through the model to their team;
// - unlabelled dots per team are proportional to how many messages that team received since the
//   previous update, so heavier teams visibly get heavier flow;
// - each team's output neuron fills with its share of everything routed so far.
// A packet enters in ink and takes on its team's colour as it crosses the layers.

const FLOW = 14; // unlabelled dots for the busiest team per update; the other teams scale to it
const STOPS = [0, 0.2, 0.36, 0.52, 0.68, 1]; // t where a packet reaches: features, hidden 1, hidden 2, output, team
const TINT = [0, 0.4, 0.8, 1]; // how much of the team colour a packet carries at each layer

/** A route through the network for one message: mostly its team's home neurons. */
function pickPath(cat: Category): number[] {
  const k = Math.max(0, ORDER.indexOf(cat));
  return [...[0, 1, 2].map((l) => pick(HOME[k][l].map((v) => v * v + 0.01))), k];
}

interface Packet { cat: Category; color: string; label?: string; t: number; speed: number; jitter: number; path: number[]; seg: number; done?: boolean }

export function LiveRouting({ job, categories, running }: { job: Job; categories: Record<Category, CategoryInfo> | null; running: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bins = useRef<Record<string, HTMLDivElement | null>>({});
  const scene = useRef({
    w: 0, h: 0, binX: 0, wide: true, src: { x: 0, y: 0 } as Pt, cols: [[], [], [], []] as Pt[][],
    act: SIZES.map((n) => new Array<number>(n).fill(0)), actCol: SIZES.map((n) => new Array<string>(n).fill(INK)),
    edges: new Map<string, { v: number; col: string }>(),
    packets: [] as Packet[], glow: {} as Record<string, number>, share: {} as Record<string, number>,
    running: true, starting: true, font: "sans-serif",
  });
  const lastCounts = useRef<Record<string, number>>({});
  const seen = useRef(0);
  const queue = useRef<LiveRow[]>([]);
  const [feed, setFeed] = useState<LiveRow[]>([]);
  const [rates, setRates] = useState<number[]>([]);
  const lastTick = useRef<{ n: number; t: number } | null>(null);
  const [ema, setEma] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  const s = job.summary;
  const counts = s.categories ?? ({} as Record<Category, number>);
  const routed = ORDER.reduce((a, c) => a + (counts[c] ?? 0), 0);
  useEffect(() => { scene.current.running = running; }, [running]);

  // Each poll: queue the new sampled rows, spawn flow proportional to real per-team deltas, measure speed.
  useEffect(() => {
    const now = performance.now();
    if (!started.current && job.status === "running") started.current = now;
    const sc = scene.current;
    sc.starting = job.status === "running" && !job.processed;
    const deltas = ORDER.map((c) => {
      const delta = (counts[c] ?? 0) - (lastCounts.current[c] ?? 0);
      lastCounts.current[c] = counts[c] ?? 0;
      sc.share[c] = routed ? (counts[c] ?? 0) / routed : 0;
      return Math.max(0, delta);
    });
    const busiest = Math.max(...deltas);
    ORDER.forEach((c, k) => {
      const dots = deltas[k] ? Math.max(1, Math.round((FLOW * deltas[k]) / busiest)) : 0;
      for (let i = 0; i < dots; i++) {
        sc.packets.push({ cat: c, color: TEAM[c], t: -Math.random() * 0.3, speed: 0.4 + Math.random() * 0.22,
          jitter: (Math.random() - 0.5) * 30, path: pickPath(c), seg: -1 });
      }
    });
    const fresh = (s.live ?? []).filter((r) => r.seq > seen.current);
    if (fresh.length) {
      seen.current = fresh[fresh.length - 1].seq;
      queue.current.push(...fresh);
      if (queue.current.length > 12) queue.current.splice(0, queue.current.length - 12);
    }
    if (lastTick.current && job.processed > lastTick.current.n) {
      const r = (job.processed - lastTick.current.n) / ((now - lastTick.current.t) / 1000);
      setEma((prev) => { const next = prev ? prev * 0.6 + r * 0.4 : r; setRates((x) => [...x.slice(-59), next]); return next; });
    }
    if (!lastTick.current || job.processed > lastTick.current.n) lastTick.current = { n: job.processed, t: now };
    // job.summary changes on every poll; the counts are read through it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  // Release sampled rows one at a time so the feed and the labelled packets flow at a readable pace.
  useEffect(() => {
    let timer = 0;
    const drip = () => {
      const row = queue.current.shift();
      if (row) {
        setFeed((f) => [row, ...f].slice(0, 7));
        const cat = row.category;
        scene.current.packets.push({ cat, color: row.needs_review ? REVIEW : TEAM[cat], label: row.text.slice(0, 30) + (row.text.length > 30 ? "…" : ""),
          t: 0, speed: 0.3 + Math.random() * 0.05, jitter: (Math.random() - 0.5) * 16, path: pickPath(cat), seg: -1 });
      }
      timer = window.setTimeout(drip, queue.current.length > 6 ? 260 : 420);
    };
    drip();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { if (started.current) setElapsed((performance.now() - started.current) / 1000); }, 100);
    return () => clearInterval(id);
  }, [running]);

  // Canvas: file -> network (features, hidden layers, team outputs) -> team cards, with packets moving through.
  useEffect(() => {
    const sc = scene.current;
    if (!canvas.current || !wrap.current) return;
    const ctx = canvas.current.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.font = canvasFont();
    const layout = () => {
      // The page can be hidden or unmounted (Next keeps routes alive) while a resize is pending.
      const el = wrap.current, cv = canvas.current;
      if (!el || !cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sc.w = el.clientWidth; sc.h = el.clientHeight;
      cv.width = Math.round(sc.w * dpr); cv.height = Math.round(sc.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = el.getBoundingClientRect();
      const ys: number[] = [];
      sc.binX = sc.w;
      ORDER.forEach((c) => {
        const r = bins.current[c]?.getBoundingClientRect();
        if (!r) return;
        ys.push(r.top - base.top + r.height / 2);
        sc.binX = Math.min(sc.binX, r.left - base.left);
      });
      if (ys.length < ORDER.length) return;
      sc.wide = sc.w >= 820;
      sc.src = { x: sc.wide ? 64 : 34, y: sc.h / 2 + 8 };
      // On a wide screen the last link is long enough to carry the sampled messages' labels.
      const x0 = sc.src.x + (sc.wide ? 120 : 52), outX = sc.binX - (sc.wide ? 250 : 20), span = outX - x0, top = 56, bottom = sc.h - 16;
      sc.cols = [
        column(x0, SIZES[0], top, bottom, 29),
        column(x0 + span * 0.34, SIZES[1], top, bottom, 36),
        column(x0 + span * 0.67, SIZES[2], top, bottom, 41),
        ys.map((y) => ({ x: outX, y })),
      ];
    };
    const node = (l: number, i: number): Pt => sc.cols[l][i];
    const segOf = (t: number) => { let k = 0; while (k < 4 && t >= STOPS[k + 1]) k++; return k; };
    const pos = (p: Packet, t: number): Pt => {
      const k = segOf(t), u = clamp((t - STOPS[k]) / (STOPS[k + 1] - STOPS[k]));
      if (k === 0) { // file -> feature neuron
        const f = { x: sc.src.x + 26, y: sc.src.y + p.jitter }, n = node(0, p.path[0]), cx = (f.x + n.x) / 2;
        return { x: (1 - u) ** 2 * f.x + 2 * (1 - u) * u * cx + u * u * n.x, y: (1 - u) ** 2 * f.y + 2 * (1 - u) * u * f.y + u * u * n.y };
      }
      if (k < 4) { // neuron -> neuron
        const from = node(k - 1, p.path[k - 1]), to = node(k, p.path[k]), e = smooth(u);
        return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      }
      const o = node(3, p.path[3]); // team output -> team card, straight along the team's lane
      return { x: o.x + (sc.binX - o.x) * u, y: o.y };
    };
    const tintAt = (t: number) => {
      const k = segOf(t);
      if (k === 0) return 0;
      if (k === 4) return 1;
      return TINT[k - 1] + (TINT[k] - TINT[k - 1]) * smooth((t - STOPS[k]) / (STOPS[k + 1] - STOPS[k]));
    };
    const fire = (p: Packet, l: number, col: string) => {
      const strength = p.label ? 0.6 : 0.26, i = p.path[l];
      sc.act[l][i] = Math.min(1, sc.act[l][i] + strength); sc.actCol[l][i] = col;
      if (l > 0) {
        const key = `${l - 1}:${p.path[l - 1]}:${i}`;
        sc.edges.set(key, { v: Math.min(1, (sc.edges.get(key)?.v ?? 0) + strength), col });
      }
    };

    let raf = 0, last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
      if (document.hidden || !sc.w || !sc.cols[3].length) return;
      const L = sc.cols, decay = Math.exp(-dt * 2.4), r = sc.wide ? { feat: 4.6, hid: 6, out: 8.5 } : { feat: 3.2, hid: 4.2, out: 6 };
      ctx.clearRect(0, 0, sc.w, sc.h);
      ctx.lineCap = "round";

      // the file, its rows scrolling while it is being read, fanning out into the feature layer
      const fx = sc.src.x - 22, fy = sc.src.y - 30, fw = 44, fh = 58;
      ctx.strokeStyle = ink(0.07); ctx.lineWidth = 1;
      ctx.beginPath(); for (const n of L[0]) { ctx.moveTo(fx + fw + 2, sc.src.y); ctx.lineTo(n.x, n.y); } ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = ink(0.32); ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.roundRect(fx, fy, fw, fh, 7); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.roundRect(fx + 1, fy + 5, fw - 2, fh - 10, 4); ctx.clip();
      const scroll = sc.running && !sc.starting && !reduce ? (ts / 26) % 9 : 0;
      ctx.strokeStyle = ink(0.26); ctx.lineWidth = 1.6;
      for (let i = 0; i < 8; i++) {
        const y = fy + 11 + i * 9 - scroll;
        ctx.beginPath(); ctx.moveTo(fx + 8, y); ctx.lineTo(fx + fw - 8 - ((i * 7) % 12), y); ctx.stroke();
      }
      ctx.restore();
      if (sc.wide) {
        ctx.fillStyle = ink(0.55); ctx.font = `600 10px ${sc.font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("YOUR FILE", sc.src.x, fy + fh + 14);
        ctx.fillText("TEXT FEATURES", L[0][0].x, 34);
        ctx.fillText("HIDDEN LAYERS", (L[1][0].x + L[2][0].x) / 2, 34);
        ctx.fillText("TEAMS", L[3][0].x, 34);
        ctx.textAlign = "start";
      }

      // the network at rest, then the connections that just carried messages
      drawRest(ctx, L, 0.85);
      for (const [key, e] of sc.edges) {
        const [l, i, j] = key.split(":").map(Number);
        ctx.strokeStyle = rgba(e.col, 0.08 + e.v * 0.55); ctx.lineWidth = 1 + e.v * 1.5;
        ctx.beginPath(); ctx.moveTo(L[l][i].x, L[l][i].y); ctx.lineTo(L[l + 1][j].x, L[l + 1][j].y); ctx.stroke();
        e.v *= decay; if (e.v < 0.02) sc.edges.delete(key);
      }
      // each team's lane from its output to its card
      ORDER.forEach((c, k) => {
        const g = sc.glow[c] ?? 0;
        ctx.strokeStyle = rgba(TEAM[c], 0.26 + g * 0.5); ctx.lineWidth = 1.25 + g * 1.2;
        ctx.beginPath(); ctx.moveTo(L[3][k].x + r.out, L[3][k].y); ctx.lineTo(sc.binX, L[3][k].y); ctx.stroke();
      });

      // packets
      for (const p of sc.packets) {
        p.t += dt * (reduce ? 4 : p.speed);
        if (p.t < 0) continue;
        if (p.t >= 1) { p.done = true; sc.glow[p.cat] = Math.min(1, (sc.glow[p.cat] ?? 0) + (p.label ? 0.5 : 0.16)); continue; }
        const k = segOf(p.t);
        for (let s2 = p.seg + 1; s2 <= k; s2++) if (s2 >= 1) fire(p, s2 - 1, mix(INK, p.color, TINT[s2 - 1]));
        p.seg = k;
        const { x, y } = pos(p, p.t), back = pos(p, Math.max(0, p.t - 0.03));
        const col = mix(INK, p.color, tintAt(p.t)), rad = p.label ? 3.2 : 1.9;
        ctx.strokeStyle = rgba(col, p.label ? 0.4 : 0.28); ctx.lineWidth = rad * 1.1;
        ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(x, y); ctx.stroke();
        if (p.label) { ctx.fillStyle = rgba(col, 0.18); ctx.beginPath(); ctx.arc(x, y, rad + 4, 0, 7); ctx.fill(); }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
      }

      // neurons: lit in the colour of what just passed; while the model loads, a wave runs across the layers
      const boot = sc.starting && !reduce ? (ts / 1000) % 1.5 : -1;
      for (let l = 0; l < 3; l++) {
        const wave = boot < 0 ? 0 : 0.5 * clamp(1 - Math.abs(boot - 0.2 - l * 0.3) / 0.28);
        L[l].forEach((p, i) => {
          const a = sc.act[l][i];
          drawNeuron(ctx, p, l === 0 ? r.feat : r.hid, Math.max(a, wave), sc.actCol[l][i], a > wave ? 1 : 0);
          sc.act[l][i] = a * decay;
        });
      }
      ORDER.forEach((c, k) => {
        const g = sc.glow[c] ?? 0;
        drawOutput(ctx, L[3][k], r.out, sc.share[c] ?? 0, TEAM[c], g);
        sc.act[3][k] *= decay; sc.glow[c] = g * 0.93;
      });

      // labels for sampled messages, riding their team's lane; one at a time per lane
      if (sc.wide) {
        ctx.font = `500 11.5px ${sc.font}`; ctx.textBaseline = "middle";
        const taken = new Set<string>();
        for (const p of sc.packets.filter((q) => q.label && !q.done && q.t > STOPS[4] && q.t < 0.97).sort((a, b) => b.t - a.t)) {
          if (!p.label || taken.has(p.cat)) continue;
          taken.add(p.cat);
          const { x, y } = pos(p, p.t);
          const w = ctx.measureText(p.label).width + 16, o = L[3][p.path[3]];
          const bx = clamp(x - w / 2, o.x + r.out + 8, sc.binX - w - 8), by = y - 25;
          ctx.globalAlpha = Math.min(1, (p.t - STOPS[4]) * 14, (0.97 - p.t) * 14);
          ctx.fillStyle = "#ffffff"; ctx.strokeStyle = rgba(p.color, 0.6); ctx.lineWidth = 1;
          ctx.shadowColor = "rgba(14,20,32,0.12)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
          ctx.beginPath(); ctx.roundRect(bx, by, w, 20, 6); ctx.fill();
          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.stroke();
          ctx.fillStyle = ink(0.88); ctx.fillText(p.label, bx + 8, by + 10.5);
          ctx.globalAlpha = 1;
        }
      }
      sc.packets = sc.packets.filter((p) => !p.done);
    };

    layout();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(layout); ro.observe(wrap.current);
    document.fonts?.ready.then(() => { sc.font = canvasFont(); });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const starting = job.status === "running" && !job.processed;
  const shown = running ? elapsed : (s.seconds ?? elapsed);
  const spark = sparkPath(rates);

  return (
    <div className="grid gap-4">
      <div className="stage stage-grid relative isolate overflow-hidden rounded-[18px]">
        <div ref={wrap} className="relative h-[430px]">
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
          <div className="absolute bottom-3.5 left-4 flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-2.5 text-[12.5px] font-semibold shadow-[var(--shadow-1)]">
            {running ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-ink" />}
            {starting ? "Loading the model on every CPU core…" : running ? "Routing live" : `Finished · ${(s.routed ?? 0).toLocaleString()} messages routed`}
          </div>
          <div className="absolute top-12 right-4 bottom-4 grid w-[150px] grid-rows-5 gap-2 sm:w-[230px]">
            {ORDER.map((c) => (
              <div key={c} ref={(el) => { bins.current[c] = el; }} className={`c-${c} relative grid content-center overflow-hidden rounded-xl border border-line bg-surface px-3 py-1.5 shadow-[var(--shadow-1)]`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{categories?.[c]?.label ?? c}</span>
                  <AnimatedNumber value={counts[c] ?? 0} className="font-mono text-[13px] font-semibold tabular" />
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-surface-3">
                  <motion.div className="h-full rounded bg-cat" animate={{ width: `${routed ? ((counts[c] ?? 0) / routed) * 100 : 0}%` }}
                    transition={{ type: "spring", stiffness: 60, damping: 18 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
        <section className="card min-w-0 p-4" aria-label="Messages being routed">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <b>Live feed</b><span className="ml-auto text-xs text-ink-3">a sample of real messages, the moment each chunk is routed</span>
          </div>
          <ol className="flex h-[388px] flex-col gap-1.5 overflow-hidden [mask-image:linear-gradient(#000_84%,transparent)]">
            {!feed.length && <li className="py-3 text-[13px] text-ink-3">{starting ? "The first routed messages appear here once the model has loaded." : "Waiting for the first results…"}</li>}
            <AnimatePresence initial={false} mode="popLayout">
              {feed.map((r) => {
                const cat = r.needs_review ? "review" : r.category;
                return (
                  <motion.li key={r.seq} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    className={`c-${cat} relative grid flex-none grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 overflow-hidden rounded-lg border border-line bg-surface py-2 pr-2.5 pl-3`}>
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-cat" />
                    <span className="truncate text-[13px]">{r.text}</span>
                    <span className="row-span-2 self-center font-mono text-xs text-ink-2">{pct(r.confidence)}</span>
                    <span className="flex min-w-0 items-center gap-2 overflow-hidden text-xs whitespace-nowrap text-ink-3">
                      <span className={`tag c-${cat} text-ink`}>{r.needs_review ? "Manual review" : categories?.[r.category]?.label}</span>
                      <span>→ {r.needs_review ? "General Support" : r.department}</span>
                      {r.priority === "urgent" && <span className="badge badge-urgent h-5">Urgent</span>}
                      <span>row {r.row.toLocaleString()}</span>
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </section>

        <section className="card grid content-start gap-4 p-4" aria-label="Live totals">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Routed"><AnimatedNumber value={s.routed ?? 0} /></Stat>
            <Stat label="Time">{shown.toFixed(1)} s</Stat>
            <Stat label="Urgent (fraud)"><AnimatedNumber value={s.urgent ?? 0} /></Stat>
            <Stat label="Manual review"><AnimatedNumber value={s.needs_review ?? 0} /></Stat>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <b>Speed</b>
              <span className="font-mono text-xs text-ink-2">
                {running ? `${Math.round(ema).toLocaleString()} msg/s` : `${(s.rows_per_second ?? 0).toLocaleString()} msg/s average`}
              </span>
            </div>
            <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="block h-[70px] w-full" aria-hidden="true">
              <path d={spark.area} fill="color-mix(in srgb, var(--text) 8%, transparent)" />
              <path d={spark.line} fill="none" stroke="var(--text)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div className="mt-1 text-xs text-ink-3">Measured from finished messages between updates, on {s.workers ?? "all"} CPU cores.</div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-2.5">
      <div className="font-display text-[22px] leading-tight font-semibold tracking-tight tabular">{children}</div>
      <div className="text-xs text-ink-3">{label}</div>
    </div>
  );
}

function sparkPath(rates: number[]) {
  const pts = rates.slice(-60);
  if (pts.length < 2) return { line: "", area: "" };
  const w = 300, h = 70, max = Math.max(...pts) * 1.15;
  const x = (i: number) => ((i / (pts.length - 1)) * w).toFixed(1);
  const y = (v: number) => (h - 2 - (v / max) * (h - 8)).toFixed(1);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  return { line, area: `${line}L${w},${h}L0,${h}Z` };
}
