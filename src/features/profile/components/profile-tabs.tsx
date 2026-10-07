"use client";

import { usePathname, useRouter } from "next/navigation";
import { tabsFor } from "../tabs";

/** Template `.tabs` strip across the My Profile screens (same as the template's profile-tabs); scrolls sideways. */
export function ProfileTabs({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="tabs" role="tablist" style={{ marginBottom: 22 }}>
      {tabsFor(permissions).map((tab) => {
        const active = pathname === tab.href;
        return (
          <button
            key={tab.href}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : undefined}
            onClick={() => router.push(tab.href)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
