"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { SessionUser } from "@/shared";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

// Collapsed rail preference, same storage key as the template ("fs-collapsed").
const COLLAPSED_KEY = "fs-collapsed";
const collapsedListeners = new Set<() => void>();
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
};
const subscribeCollapsed = (onChange: () => void) => {
  collapsedListeners.add(onChange);
  return () => collapsedListeners.delete(onChange);
};
const writeCollapsed = (value: boolean) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {}
  collapsedListeners.forEach((l) => l());
};

/** Template shell (20-shell-open.html): sidebar, mobile scrim, top bar, content, footer. */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // An admin-set password must be replaced first; the API refuses everything else meanwhile (AUTH_PASSWORD_CHANGE_REQUIRED).
  const mustChange = user.mustChangePassword && pathname !== "/profile/security";
  useEffect(() => {
    if (mustChange) router.replace("/profile/security?tab=security");
  }, [mustChange, router]);
  // Server renders expanded; the client then applies the saved preference.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  // The mobile menu closes whenever the route changes (adjusted during render, no effect).
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setMobileOpen(false);
  }

  return (
    <div className={cn("shell", collapsed && "collapsed", mobileOpen && "mobile-open")}>
      <Sidebar permissions={user.permissions} tenantName={user.tenantName} onCollapse={() => writeCollapsed(!collapsed)} />
      <button className="mobile-scrim" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
      <main className="main">
        <Topbar name={user.name} email={user.email} onMenu={() => setMobileOpen(true)} />
        <div className="content">{children}</div>
      </main>
      <footer className="app-footer">
        <b>Accountex</b>
        <span>·</span>
        <span>{user.tenantName}</span>
        <span>·</span>
        <span>Financial Accounting &amp; HRMS</span>
      </footer>
    </div>
  );
}
