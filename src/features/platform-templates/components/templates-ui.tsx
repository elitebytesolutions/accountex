"use client";

import {
  Briefcase, Building, Factory, HeartHandshake, History, KeyRound, Landmark, Layers, ListTree, Percent, PlugZap, Store, UploadCloud, type LucideIcon,
} from "lucide-react";
import type { AdminHistoryItem } from "@/shared";
import { EmptyState } from "@/components/ui/states";

/** COA template icons (ChartOfAccountsTemplates.icon, template card icons). */
export const COA_ICONS: Record<string, [LucideIcon, string]> = {
  "list-tree": [ListTree, ""], store: [Store, ""], briefcase: [Briefcase, "teal"], factory: [Factory, "yellow"],
  "heart-handshake": [HeartHandshake, "violet"], layers: [Layers, "teal"],
};
export const coaIcon = (icon: string | null) => COA_ICONS[icon ?? ""] ?? COA_ICONS["list-tree"]!;

/** Template COA status badges: Default (good), Published (neutral), Draft (warn), Retired (danger). */
export const COA_STATUS: Record<string, [string, string]> = {
  DEFAULT: ["Default", "good"], PUBLISHED: ["Published", "neutral"], DRAFT: ["Draft", "warn"], RETIRED: ["Retired", "danger"],
};

export const fmtDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n.toFixed(4))}%`);
export const rs = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`);
export const today = () => new Date().toISOString().slice(0, 10);

const VERB: Record<string, string> = { INSERT: "Added", UPDATE: "Changed", DELETE: "Removed" };
const TONE: Record<string, string> = { INSERT: "good", UPDATE: "warn", DELETE: "danger" };
const TABLE_ICON: Record<string, LucideIcon> = {
  TaxMasterAuthorities: KeyRound, TaxMasterSalesTaxRates: Percent, TaxMasterWithholdingRates: Percent, TaxMasterSalarySlabs: Layers, SystemRoleGrants: KeyRound,
};
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** One platform-log entry as a sentence ("Changed TaxMasterSalesTaxRates FBR 18% …"), via `describe`. */
export function LogTimeline({ items, total, describe, empty }: {
  items: AdminHistoryItem[];
  total: number;
  describe: (h: AdminHistoryItem) => string;
  empty?: string;
}) {
  if (!items.length) return <EmptyState icon={<History />} title="No changes yet" description={empty ?? "Changes will appear here."} />;
  return (
    <>
      <div className="timeline">
        {items.map((h, i) => {
          const published = h.action === "UPDATE" && h.changes && "publishedAt" in h.changes;
          const tested = h.action === "UPDATE" && h.changes && "lastTestAt" in h.changes;
          const Icon = published ? UploadCloud : tested ? PlugZap : TABLE_ICON[h.table] ?? (h.table.includes("Authorit") ? Landmark : Building);
          return (
            <div key={h.entryId} className="tl-item" style={{ ["--i" as string]: i }}>
              <span className={`ap-tl-ic ${published ? "good" : tested ? "info" : TONE[h.action] ?? "info"}`}><Icon /></span>
              <div>
                <b>{describe(h)}</b>
                <small>{fmtWhen(h.occurredAt)} · {h.actor.name ?? "system"}</small>
                {h.action === "UPDATE" && h.changes && !published && !tested && (
                  <p className="small muted">
                    {Object.entries(h.changes as Record<string, { before?: unknown; after?: unknown }>).slice(0, 4).map(([field, c]) => (
                      <span key={field} style={{ display: "block" }}>{field}: {show(c.before)} → {show(c.after)}</span>
                    ))}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {total > items.length && <p className="muted small">Showing the latest {items.length} of {total} changes.</p>}
    </>
  );
}

export const verbOf = (action: string) => VERB[action] ?? action;
