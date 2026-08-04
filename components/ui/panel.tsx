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
      className={`rounded-[var(--radius-standard)] bg-panel/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.025)] ${className}`}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/45 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[0.84rem] font-medium text-ink">{title}</h2>}
            {description && (
              <p className="mt-1 text-[0.76rem] leading-5 text-ink-muted">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </Element>
  );
}
