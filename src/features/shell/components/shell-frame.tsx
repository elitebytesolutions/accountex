"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Sidebar, type SidebarProps } from "./sidebar";
import { Topbar, type TopbarProps } from "./topbar";

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

export type ShellFrameProps = {
  sidebar: Omit<SidebarProps, "onCollapse">;
  topbar: Omit<TopbarProps, "onMenu">;
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Template shell (20-shell-open.html): sidebar, mobile scrim, top bar, content, footer. Shared by the workspace
 * (AppShell: NAV.app / TOP.app) and the Super Admin portal (AdminShell: NAV.admin / TOP.admin).
 */
export function ShellFrame({ sidebar, topbar, footer, children }: ShellFrameProps) {
  const pathname = usePathname();
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
      <Sidebar {...sidebar} onCollapse={() => writeCollapsed(!collapsed)} />
      <button className="mobile-scrim" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
      <main className="main">
        <Topbar {...topbar} onMenu={() => setMobileOpen(true)} />
        <div className="content">{children}</div>
      </main>
      <footer className="app-footer">{footer}</footer>
    </div>
  );
}
