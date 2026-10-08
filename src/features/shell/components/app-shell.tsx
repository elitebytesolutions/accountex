"use client";

import { CircleUser } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import type { SessionUser } from "@/shared";
import { logout } from "@/features/auth/api";
import { initialsOf } from "@/features/auth/initials";
import { crumbsFor, navFor, navPathFor } from "@/features/workspace-nav/nav";
import { ShellFrame } from "./shell-frame";
import { SupportAccessBanner } from "./support-access-banner";

/** Template shell (20-shell-open.html) for the company workspace: NAV.app sidebar, TOP.app top bar. */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // An admin-set password must be replaced first; the API refuses everything else meanwhile (AUTH_PASSWORD_CHANGE_REQUIRED).
  const mustChange = user.mustChangePassword && pathname !== "/profile/security";
  useEffect(() => {
    if (mustChange) router.replace("/profile/security?tab=security");
  }, [mustChange, router]);
  const nav = useMemo(() => navFor(user.permissions), [user.permissions]);

  return (
    <ShellFrame
      sidebar={{
        nav,
        homeHref: "/dashboard",
        workspace: { initials: initialsOf(user.tenantName), name: user.tenantName, sub: "Company workspace" },
        navPath: navPathFor,
      }}
      topbar={{
        name: user.name,
        email: user.email,
        homeHref: "/dashboard",
        homeLabel: "Dashboard",
        rootLabel: "Workspace",
        crumbsFor,
        signOut: { run: logout, then: "/login" },
        menuItems: (close) => (
          <Link className="pop-item" role="menuitem" href="/profile" onClick={close}>
            <span className="tone-violet"><CircleUser /></span>
            <div><b>My Profile</b><small>My day, leave, pay &amp; requests</small></div>
          </Link>
        ),
      }}
      footer={
        <>
          <b>Accountex</b>
          <span>·</span>
          <span>{user.tenantName}</span>
          <span>·</span>
          <span>Financial Accounting &amp; HRMS</span>
        </>
      }
    >
      <SupportAccessBanner />
      {children}
    </ShellFrame>
  );
}
