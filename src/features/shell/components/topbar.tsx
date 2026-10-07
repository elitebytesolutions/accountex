"use client";

import { ChevronDown, ChevronRight, CircleUser, House, LogOut, Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { logout } from "@/features/auth/api";
import { initialsOf } from "@/features/auth/initials";
import { crumbsFor } from "@/features/workspace-nav/nav";

/** Template top bar (99-app.js renderTopbar): mobile menu, breadcrumbs, theme toggle, user menu. */
export function Topbar({ name, email, onMenu }: { name: string; email: string; onMenu: () => void }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname) ?? fallbackCrumbs(pathname);

  return (
    <header className="topbar">
      <button className="menu-btn" type="button" aria-label="Open menu" onClick={onMenu}><Menu /></button>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link className="crumb-home" href="/dashboard" aria-label="Dashboard"><House /></Link>
        <span className="c-hide">Workspace</span>
        {crumbs.trail.map((t) => (
          <span key={t} style={{ display: "contents" }}><ChevronRight /><span>{t}</span></span>
        ))}
        <ChevronRight />
        <b>{crumbs.title}</b>
      </nav>
      <div className="top-actions">
        <ThemeButton />
        <UserMenu name={name} email={email} />
      </div>
    </header>
  );
}

/** Screens outside the sidebar (e.g. My Profile tabs): "Profile › Leave". */
function fallbackCrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean).map((p) => p.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
  return { trail: parts.slice(0, -1), title: parts.at(-1) ?? "Dashboard" };
}

/** Light/dark toggle; same storage key and attribute as the template (fs-theme, html[data-theme]). */
function ThemeButton() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("fs-theme", next);
    } catch {}
  };
  return (
    <button className="round-btn theme-btn" type="button" aria-label="Toggle theme" onClick={toggle}>
      <Sun className="ic-sun" />
      <Moon className="ic-moon" />
    </button>
  );
}

/** Template user pill + popover: the only way into My Profile. */
function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
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

  async function signOut() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="pop-wrap" ref={ref}>
      <button className="user-pill" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initialsOf(name)}</span>
        <div><b>{name}</b><small>{email}</small></div>
        <ChevronDown />
      </button>
      <div className={cn("pop", open && "open")} role="menu">
        <Link className="pop-item" role="menuitem" href="/profile" onClick={() => setOpen(false)}>
          <span className="tone-violet"><CircleUser /></span>
          <div><b>My Profile</b><small>My day, leave, pay &amp; requests</small></div>
        </Link>
        <div className="pop-sep" />
        <button className="pop-item" role="menuitem" type="button" onClick={signOut}>
          <span className="tone-red"><LogOut /></span>
          <div><b>Sign out</b></div>
        </button>
      </div>
    </div>
  );
}
