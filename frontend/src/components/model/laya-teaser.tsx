import Link from "next/link";

// A pointer from the Model page to the Laya challenger page.
export function LayaTeaser() {
  return (
    <Link href="/laya" className="card card-hover group flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div className="min-w-0">
        <div className="eyebrow">Challenger model</div>
        <div className="mt-1 text-[15px] font-semibold tracking-tight">Laya, side by side with our model</div>
        <p className="mt-0.5 text-[13px] text-ink-2">An open-weights decision model, integrated and switched off. Compare how each decides and how long each takes.</p>
      </div>
      <span className="btn btn-ghost h-9 px-4 text-[13px]">Open <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
    </Link>
  );
}
