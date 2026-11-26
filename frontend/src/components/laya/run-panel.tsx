// How to switch Laya on for a comparison run. Routing never changes.

const STEPS = [
  { t: "Install it (optional dependency)", cmd: 'pip install -e ".[laya]"' },
  { t: "Score both models on the same test messages", cmd: "python -m bankq.ml.laya_eval" },
  { t: "Results are served to this page", cmd: "GET /api/v1/model/challengers" },
];

export function RunPanel() {
  return (
    <div className="card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">Run the comparison</h2>
      <p className="mt-0.5 text-xs text-ink-3">Laya never routes a message. It only runs when you start a comparison.</p>
      <ol className="mt-4 grid gap-3">
        {STEPS.map((s, i) => (
          <li key={s.cmd} className="flex items-start gap-3">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full border border-line-strong text-[11px] font-semibold text-ink-2">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[13px] text-ink">{s.t}</div>
              <code className="mt-1 block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12px] whitespace-nowrap text-ink">{s.cmd}</code>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-ink-3">
        Code: <span className="font-mono">bankq/ml/laya_challenger.py</span> (the adapter) and <span className="font-mono">bankq/ml/laya_eval.py</span> (the comparison).
      </p>
    </div>
  );
}
