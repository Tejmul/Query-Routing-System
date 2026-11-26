// What each model is, side by side. Facts about the two models, not test results.

const ROWS: { what: string; ours: string; laya: string }[] = [
  { what: "Kind of model", ours: "Classic machine learning: TF-IDF text features + Logistic Regression", laya: "Transformer: ModernBERT-large encoder + a decision head" },
  { what: "Size", ours: "27.6 MB", laya: "808 MB, 421M parameters" },
  { what: "Learned from", ours: "Our 10,519 labelled banking messages", laya: "General decision data; never trained on ours (zero-shot)" },
  { what: "New team or category", ours: "Retrain (about 36 s)", laya: "Add an option to the question; no retraining" },
  { what: "Hardware", ours: "Any CPU", laya: "Runs on CPU; a GPU is recommended" },
  { what: "Languages", ours: "English", laya: "English checkpoint; a multilingual one covers 100+ languages" },
  { what: "Answers with", ours: "Team, topic, confidence and the words that decided it", laya: "A probability for every option, plus abstain and a prediction set" },
  { what: "Licence", ours: "Ours", laya: "Apache 2.0, open weights" },
  { what: "In this app", ours: "Routes every message", laya: "Integrated, switched off" },
];

export function SpecTable() {
  return (
    <div className="card overflow-x-auto">
      <table className="data w-full min-w-[640px] text-[13px]">
        <thead>
          <tr><th className="w-[22%] text-left" /><th className="text-left">Our model</th><th className="text-left">Laya</th></tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.what}>
              <td className="py-3 font-medium text-ink">{r.what}</td>
              <td className="py-3 text-ink">{r.ours}</td>
              <td className="py-3 text-ink-2">{r.laya}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
