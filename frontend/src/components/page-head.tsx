import type { ReactNode } from "react";

export function PageHead({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {children && <p className="mt-1 text-ink-2">{children}</p>}
      </div>
      {aside}
    </header>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-16 sm:px-10 sm:pt-8">{children}</div>;
}
