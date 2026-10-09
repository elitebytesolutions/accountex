"use client";

import { Calculator, ChevronDown, ChevronRight, House, LogOut, Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { initialsOf } from "@/features/auth/initials";
import type { NavGroup, NavModule } from "@/features/workspace-nav/nav";
import { FloatingCalculator } from "@/features/calculator/components/floating-calculator";
import { CommandPalette, toggleTheme } from "./command-palette";

type Crumbs = { trail: string[]; title: string };

export type TopbarProps = {
  name: string;
  email: string;
  /** Breadcrumb root: home icon link, then the portal name (template setCrumbs: "Workspace" / "Platform"). */
  homeHref: string;
  homeLabel: string;
  rootLabel: string;
  /** Breadcrumb trail and title of a path (null: derived from the URL). */
  crumbsFor: (pathname: string) => Crumbs | null;
  /** Template top-bar actions placed before the theme toggle (e.g. the admin Create menu). */
  actions?: ReactNode;
  /** User-menu entries above "Sign out". */
  menuItems?: (close: () => void) => ReactNode;
  signOut: { run: () => Promise<unknown>; then: string };
  onMenu: () => void;
  /** The permission-filtered nav: the screens the "Search anything…" palette jumps to. */
  nav: { menu: NavModule[]; groups: NavGroup[] };
};

/** Template top bar (99-app.js renderTopbar): mobile menu, breadcrumbs, search palette, calculator, theme toggle, user menu. */
export function Topbar({ name, email, homeHref, homeLabel, rootLabel, crumbsFor, actions, menuItems, signOut, onMenu, nav }: TopbarProps) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname) ?? fallbackCrumbs(pathname);

  return (
    <header className="topbar">
      <button className="menu-btn" type="button" aria-label="Open menu" onClick={onMenu}><Menu /></button>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link className="crumb-home" href={homeHref} aria-label={homeLabel}><House /></Link>
        <span className="c-hide">{rootLabel}</span>
        {crumbs.trail.map((t) => (
          <span key={t} style={{ display: "contents" }}><ChevronRight /><span>{t}</span></span>
        ))}
        <ChevronRight />
        <b>{crumbs.title}</b>
      </nav>
      <div className="top-actions">
        <CommandPalette nav={nav} rootLabel={rootLabel} />
        {actions}
        <CalculatorButton />
        <ThemeButton />
        <UserMenu name={name} email={email} menuItems={menuItems} signOut={signOut} />
      </div>
    </header>
  );
}

/** Screens outside the sidebar (e.g. My Profile tabs): "Profile › Leave". */
function fallbackCrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean).map((p) => p.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
  return { trail: parts.slice(0, -1), title: parts.at(-1) ?? "Dashboard" };
}

/** Template calculator button (99-app.js #calcBtn) and the C shortcut: opens the floating calculator (9K-calc.js). */
function CalculatorButton() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as Element | null;
      if (t?.closest?.("input, textarea, select, [contenteditable], .cx-float, .overlay")) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button ref={setAnchor} className="round-btn hide-sm" type="button" aria-label="Calculator" title="Calculator (C)" onClick={() => setOpen(true)}>
        <Calculator />
      </button>
      {/* stays mounted: the current sum and pane inputs survive between opens, as in the template */}
      <FloatingCalculator open={open} onClose={() => setOpen(false)} anchor={anchor} />
    </>
  );
}

/** Light/dark toggle; same storage key and attribute as the template (fs-theme, html[data-theme]). */
function ThemeButton() {
  return (
    <button className="round-btn theme-btn" type="button" aria-label="Toggle theme" onClick={toggleTheme}>
      <Sun className="ic-sun" />
      <Moon className="ic-moon" />
    </button>
  );
}

/** Template user pill + popover (in the workspace, the only way into My Profile). */
function UserMenu({ name, email, menuItems, signOut: so }: { name: string; email: string; menuItems?: (close: () => void) => ReactNode; signOut: TopbarProps["signOut"] }) {
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
    await so.run();
    router.replace(so.then);
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
        {menuItems && (
          <>
            {menuItems(() => setOpen(false))}
            <div className="pop-sep" />
          </>
        )}
        <button className="pop-item" role="menuitem" type="button" onClick={signOut}>
          <span className="tone-red"><LogOut /></span>
          <div><b>Sign out</b></div>
        </button>
      </div>
    </div>
  );
}
