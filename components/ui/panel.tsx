import type { ReactNode } from "react";

type PanelProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  as?: "section" | "div";
};

export function Panel({
  children,
  title,
  description,
  action,
  className = "",
  as: Element = "section",
}: PanelProps) {
  return (
    <Element
      className={`rounded-[var(--radius-standard)] border border-border/90 bg-panel/70 ${className}`}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-2.5 sm:px-4">
          <div className="min-w-0">
            {title && <h2 className="text-xs font-semibold text-ink">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[0.68rem] leading-4 text-ink-muted">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </Element>
  );
}
