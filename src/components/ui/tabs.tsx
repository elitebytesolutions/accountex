"use client";

import type { ReactNode } from "react";

export type TabItem<K extends string> = { key: K; label: string; icon?: ReactNode; count?: number };

/** Template `.tabs` (controlled). Use for in-page tabs; route tabs use links styled the same way. */
export function Tabs<K extends string>({ items, active, onChange }: { items: TabItem<K>[]; active: K; onChange: (key: K) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={t.key === active ? "active" : undefined}
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="badge neutral">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
