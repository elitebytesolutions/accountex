"use client";

import { Activity, ChevronDown, ChevronRight, PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { navFor, navPathFor, type NavModule } from "@/features/workspace-nav/nav";
import { initialsOf } from "@/features/auth/initials";

/** Template sidebar (99-app.js renderSidebar + 10-styles.css "SHELL"): brand, workspace pill, menu search, sections. */
export function Sidebar({ permissions, tenantName, onCollapse }: { permissions: string[]; tenantName: string; onCollapse: () => void }) {
  const pathname = usePathname();
  const nav = useMemo(() => navFor(permissions), [permissions]);
  const [query, setQuery] = useState("");
  const [shut, setShut] = useState<string[]>([]);
  const q = query.trim().toLowerCase();
  const navRef = useRef<HTMLElement>(null);
  const hlRef = useRef<HTMLSpanElement>(null);

  // Template sliding highlight (99-app.js moveHl): sits behind the active item; again after a sub-menu finishes opening.
  useEffect(() => {
    const move = () => {
      const nav = navRef.current, hl = hlRef.current;
      if (!nav || !hl) return;
      const el = q ? null : nav.querySelector<HTMLElement>(".sb-item.active, .sb-leaf.active");
      if (!el || !el.offsetParent) return hl.classList.remove("on");
      hl.style.transform = `translateY(${el.getBoundingClientRect().top - nav.getBoundingClientRect().top}px)`;
      hl.style.height = `${el.offsetHeight}px`;
      hl.style.left = `${el.classList.contains("sb-leaf") ? 19 : 0}px`;
      hl.classList.add("on");
    };
    move();
    const t = setTimeout(move, 360);
    // Opening or closing a module moves the rows below it.
    const ro = new ResizeObserver(move);
    if (navRef.current) ro.observe(navRef.current);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [pathname, q, shut]);

  const match = (m: NavModule) => !q || m.label.toLowerCase().includes(q) || (m.children ?? []).some((c) => c.label.toLowerCase().includes(q));
  const sections = [{ title: "Menu", modules: nav.menu }, ...nav.groups.map((g) => ({ title: g.title, modules: g.modules }))]
    .map((s) => ({ ...s, modules: s.modules.filter(match) }))
    .filter((s) => s.modules.length > 0);

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sb-top">
        <Link className="sb-logo" href="/dashboard">
          <span className="sb-mark"><Activity /></span>
          <b>Accountex</b>
        </Link>
        <button className="sb-collapse" type="button" aria-label="Collapse sidebar" onClick={onCollapse}><PanelLeft /></button>
      </div>
      <div className="pop-wrap">
        <div className="sb-ws">
          <span className="sb-ws-ava">{initialsOf(tenantName)}</span>
          <div><b>{tenantName}</b><small>Company workspace</small></div>
        </div>
      </div>
      <label className="sb-find">
        <Search />
        <input placeholder="Search menu…" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="sb-scroll">
        <nav className="sb-nav" ref={navRef}>
          <span className="sb-hl" ref={hlRef} aria-hidden />
          {sections.map((s) => (
            <div key={s.title} className={cn("sb-sec", shut.includes(s.title) && !q && "shut")}>
              <button className="sb-sec-h" type="button" onClick={() => setShut((x) => (x.includes(s.title) ? x.filter((t) => t !== s.title) : [...x, s.title]))}>
                {s.title}
                <ChevronDown />
              </button>
              <div className="sb-sec-b">
                <div className="sb-sec-in">
                  {s.modules.map((m) => <ModuleItem key={m.label} module={m} pathname={pathname} forceOpen={Boolean(q)} />)}
                </div>
              </div>
            </div>
          ))}
          {sections.length === 0 && <div className="sb-empty">No menu items match.</div>}
        </nav>
      </div>
    </aside>
  );
}

function ModuleItem({ module: m, pathname, forceOpen }: { module: NavModule; pathname: string; forceOpen: boolean }) {
  const here = navPathFor(pathname);
  const leafActive = (href: string) => here === href || here.startsWith(`${href}/`);
  const childActive = (m.children ?? []).some((c) => leafActive(c.href));
  const [open, setOpen] = useState(childActive);
  const Icon = m.icon;

  if (!m.children) {
    return (
      <Link className={cn("sb-item", pathname === m.href && "active")} href={m.href} aria-current={pathname === m.href ? "page" : undefined}>
        <Icon />
        <span className="sb-label">{m.label}</span>
        {m.badge && <em className="sb-count">{m.badge}</em>}
      </Link>
    );
  }
  return (
    <div className={cn("sb-mod", (open || forceOpen) && "open")}>
      <button className={cn("sb-item sb-parent", childActive && "current")} type="button" onClick={() => setOpen((o) => !o)}>
        <Icon />
        <span className="sb-label">{m.label}</span>
        <ChevronRight className="sb-chev" />
      </button>
      <div className="sb-sub">
        <div className="sb-sub-in">
          {m.children.map((c) => (
            <Link key={c.href} className={cn("sb-leaf", leafActive(c.href) && "active")} href={c.href}>
              <span className="sb-label">{c.label}</span>
              {c.badge && <em className="sb-count">{c.badge}</em>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
