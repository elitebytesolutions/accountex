"use client";

import { Handshake, Link2, TicketPercent } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageHead } from "@/components/ui/page";
import { ResellersTab } from "@/features/platform-config/components/resellers-tab";
import { CouponsTab } from "./coupons-tab";

type TabKey = "res" | "cou";
type TabDef = { key: TabKey; label: string; icon: ReactNode; render: () => ReactNode };

/**
 * Template admin/partners (3A-admin-plus.html:89, 9B-admin-plus.js 1316+): page head and the Resellers / Coupons tabs.
 * Phase 36 builds the Coupons tab; Phase 38 adds the Resellers tab (template order: Resellers, then Coupons) to TABS.
 * The open tab is the `?tab=` query (res / cou).
 */
export function PartnersScreen({ tab }: { tab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [focusKey, setFocusKey] = useState(0);
  const [inviting, setInviting] = useState(false);
  const TABS: TabDef[] = [
    { key: "res", label: "Resellers", icon: <Handshake />, render: () => <ResellersTab openNew={inviting} onNewClosed={() => setInviting(false)} /> }, // Phase 38
    { key: "cou", label: "Coupons", icon: <TicketPercent />, render: () => <CouponsTab focusKey={focusKey} /> },
  ];
  const active = TABS.find((t) => t.key === tab || (tab === "coupons" && t.key === "cou")) ?? TABS[0]!;
  const go = (key: TabKey) => router.replace(`${pathname}?tab=${key}`, { scroll: false });

  return (
    <>
      <PageHead eyebrow="Growth / Partners & Coupons" title="Partners & Coupons"
        description="Reseller network, commission payouts and discount codes for campaigns like Ramzan and 14 August."
        actions={<>
          {/* Phase 38: inviting a partner = adding a reseller; each one gets its own invite code. */}
          <button className="btn secondary" type="button" onClick={() => { if (active.key !== "res") go("res"); setInviting(true); }}><Link2 />Partner invite link</button>
          <button className="btn primary" type="button" onClick={() => { if (active.key !== "cou") go("cou"); setFocusKey((n) => n + 1); }}><TicketPercent />New coupon</button>
        </>} />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === active.key} className={t.key === active.key ? "active" : undefined} onClick={() => go(t.key)}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div className="tab-pane active">{active.render()}</div>
    </>
  );
}
