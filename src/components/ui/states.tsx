import { CircleCheck, CircleX, Info, Inbox, TriangleAlert } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { IconWell } from "./page";

/** Template `.empty-state` (app/states). */
export function EmptyState({ icon = <Inbox />, tone, title, description, action }: {
  icon?: ReactNode;
  tone?: "blue" | "red";
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <IconWell large tone={tone}>{icon}</IconWell>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

const BANNER_ICONS = { danger: <CircleX />, warn: <TriangleAlert />, info: <Info />, good: <CircleCheck /> };

/** Template `.banner` (errors, warnings, notices). */
export function Banner({ tone, title, children, action }: { tone: keyof typeof BANNER_ICONS; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {BANNER_ICONS[tone]}
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** Error banner for a failed load; shows the API's reference so support can find the error log entry. */
export function ErrorState({ message, reference, onRetry }: { message: string; reference?: string; onRetry?: () => void }) {
  return (
    <Banner
      tone="danger"
      title="Couldn't load this data"
      action={onRetry && <button type="button" className="btn sm secondary" onClick={onRetry}>Retry</button>}
    >
      {message}
      {reference && <> · Reference: <code>{reference}</code></>}
    </Banner>
  );
}

/** Template `.skeleton` placeholder. */
export function Skeleton({ style }: { style?: CSSProperties }) {
  return <div className="skeleton" style={style} aria-hidden />;
}
