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
    <header className="flex min-w-0 flex-col gap-5 border-b border-border/35 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-[0.82rem] text-ink-muted">
          {eyebrow}
        </p>
        <h1 className="font-display text-[2.4rem] leading-[1] text-ink sm:text-[3rem]">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl break-words text-[0.95rem] leading-7 text-ink-secondary">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
