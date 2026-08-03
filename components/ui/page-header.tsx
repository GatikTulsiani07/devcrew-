import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-3.5 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-accent">
          {eyebrow}
        </p>
        <h1 className="font-display text-[1.7rem] leading-[1.05] text-ink sm:text-[2rem]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl break-words text-[0.8rem] leading-5 text-ink-secondary">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
