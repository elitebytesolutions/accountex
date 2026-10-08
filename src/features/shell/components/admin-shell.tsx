"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdminSession } from "@/shared";
import { cn } from "@/components/ui/cn";
import { adminLogout } from "@/features/admin-auth/api";
import { ADMIN_CREATE, adminCrumbsFor, adminNav, adminNavPathFor } from "@/features/admin-nav/nav";
import { ShellFrame } from "./shell-frame";

/**
 * Template shell for the Super Admin portal (NAV.admin / TOP.admin in template/src/90-nav.js and 99-app.js):
 * "Accountex Cloud" workspace pill, admin nav, breadcrumb root "Platform", Create menu, admin sign-out.
 */
export function AdminShell({ admin, children }: { admin: AdminSession; children: ReactNode }) {
  const nav = useMemo(() => adminNav(), []);

  return (
    <ShellFrame
      sidebar={{
        nav,
        homeHref: "/admin/dashboard",
        workspace: { initials: "AC", name: "Accountex Cloud", sub: "Production · Platform Console" },
        navPath: adminNavPathFor,
      }}
      topbar={{
        name: admin.name,
        email: admin.email,
        homeHref: "/admin/dashboard",
        homeLabel: "Platform overview",
        rootLabel: "Platform",
        crumbsFor: adminCrumbsFor,
        actions: ADMIN_CREATE.length > 0 ? <CreateMenu /> : null,
        signOut: { run: adminLogout, then: "/admin/login" },
      }}
      footer={
        <>
          <b>Accountex</b>
          <span>·</span>
          <span>Accountex Cloud</span>
          <span>·</span>
          <span>Platform Console</span>
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}

/** Template top-bar "Create" button + popover (TOP.admin.create, built entries only). */
function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="pop-wrap" ref={ref}>
      <button className="create-btn" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus />
        <span>Create</span>
      </button>
      <div className={cn("pop", open && "open")} role="menu">
        {ADMIN_CREATE.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} className="pop-item" role="menuitem" href={c.href} onClick={() => setOpen(false)}>
              <span className={c.tone ?? ""}><Icon /></span>
              <div><b>{c.title}</b><small>{c.sub}</small></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
