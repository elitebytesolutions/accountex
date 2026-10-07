"use client";

import { Building2, Hash, History, Landmark, MapPin, Palette, Percent, ShoppingCart, Users, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CompanySettings } from "@/shared";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { getCompanySettings } from "../api";
import { BranchesTab } from "./branches-tab";
import { BrandingTab } from "./branding-tab";
import { FinanceTab } from "./finance-tab";
import { HrTab } from "./hr-tab";
import { NumberingTab } from "./numbering-tab";
import { ProfileTab } from "./profile-tab";
import { SalesTab } from "./sales-tab";
import { TaxTab } from "./tax-tab";
import type { SettingsTab } from "../tabs";


const TABS: { key: SettingsTab; label: string; icon: LucideIcon }[] = [
  { key: "profile", label: "Company Profile", icon: Building2 },
  { key: "branches", label: "Branches", icon: MapPin },
  { key: "finance", label: "Finance", icon: Landmark },
  { key: "sales", label: "Sales & Purchases", icon: ShoppingCart },
  { key: "hr", label: "HR & Payroll", icon: Users },
  { key: "tax", label: "Tax", icon: Percent },
  { key: "numbering", label: "Numbering Series", icon: Hash },
  { key: "branding", label: "Branding", icon: Palette },
];
/** Tabs saved through the company settings row (the profile must exist first). */
const NEEDS_PROFILE = new Set<SettingsTab>(["finance", "sales", "hr", "tax", "branding"]);

/** Template app/settings: vertical tabs (`?tab=`), one form per tab. */
export function SettingsScreen({ initialTab, tenantName, canEdit }: { initialTab: SettingsTab; tenantName: string; canEdit: boolean }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCompanySettings()
      .then((s) => !cancelled && (setSettings(s), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load settings" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const select = useCallback((key: SettingsTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  }, []);

  const props = settings && { settings, onSaved: setSettings, canEdit };

  return (
    <>
      <PageHead
        eyebrow="Settings / Company"
        title="Company Settings"
        description={`Legal profile, branches, finance defaults, tax registration and document numbering for ${settings?.saved ? settings.legalName : tenantName}.`}
        actions={settings?.saved && <Button icon={<History />} onClick={() => setHistoryOpen(true)}>History</Button>}
      />
      <div className="split-l">
        <div className="panel vnav tabs" role="tablist" aria-orientation="vertical">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : undefined} onClick={() => select(key)}>
              <Icon />
              {label}
            </button>
          ))}
        </div>
        <div className="tab-pane active" role="tabpanel">
          {settings && !settings.saved && NEEDS_PROFILE.has(tab) && (
            <div className="mb">
              <Banner
                tone="warn"
                title="Complete the company profile first"
                action={<Button size="sm" onClick={() => select("profile")}>Open profile</Button>}
              >
                These settings are saved with the company profile. The values below are the defaults until then.
              </Banner>
            </div>
          )}
          {tab === "branches" ? (
            <BranchesTab canEdit={canEdit} />
          ) : tab === "numbering" ? (
            <NumberingTab canEdit={canEdit} />
          ) : error ? (
            <ErrorState {...error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : !props ? (
            <div className="panel"><Skeleton style={{ height: 18, width: "40%" }} /><div className="mt"><Skeleton style={{ height: 260 }} /></div></div>
          ) : tab === "profile" ? (
            <ProfileTab {...props} />
          ) : tab === "finance" ? (
            <FinanceTab {...props} />
          ) : tab === "sales" ? (
            <SalesTab {...props} />
          ) : tab === "hr" ? (
            <HrTab {...props} />
          ) : tab === "tax" ? (
            <TaxTab {...props} />
          ) : (
            <BrandingTab {...props} />
          )}
        </div>
      </div>
      {settings?.id && (
        <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Company settings history" subtitle="Every saved change, who made it and what changed" wide>
          <HistoryTab schema="Company" table="CompanySettings" id={settings.id} />
        </Drawer>
      )}
    </>
  );
}
