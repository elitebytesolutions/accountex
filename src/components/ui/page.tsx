import type { ReactNode } from "react";
import { cn } from "./cn";

/** Template `.page-head`: eyebrow trail, title, description and actions. */
export function PageHead({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

/** Template `.panel` with an optional `.panel-head`. `flush` removes padding (for tables). */
export function Panel({ title, description, actions, flush, className, children }: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("panel", flush && "flush", className)}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h3>{title}</h3>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Template `.icon-well` (coloured icon tile). */
export function IconWell({ tone, large, children }: { tone?: "blue" | "red" | "yellow" | "violet" | "teal"; large?: boolean; children: ReactNode }) {
  return <span className={cn("icon-well", large && "lg", tone)}>{children}</span>;
}
