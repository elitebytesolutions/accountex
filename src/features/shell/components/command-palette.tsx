"use client";

import { FileText, Search, SunMoon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";
import type { NavGroup, NavModule } from "@/features/workspace-nav/nav";

type Item = { t: string; href: string; icon: LucideIcon; g: string };
const THEME = "__theme";

/** Every reachable screen of the (permission-filtered) nav, as the template's paletteItems(): label, trail, icon. */
function itemsOf(nav: { menu: NavModule[]; groups: NavGroup[] }, rootLabel: string): Item[] {
  const out: Item[] = [{ t: "Toggle light / dark theme", href: THEME, icon: SunMoon, g: "Action" }];
  const seen = new Set<string>();
  const add = (t: string, href: string, icon: LucideIcon, trail: string[]) => {
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ t, href, icon, g: [rootLabel, ...trail].join(" · ") });
  };
  for (const m of nav.menu) add(m.label, m.href, m.icon, ["Menu"]);
  for (const g of nav.groups) {
    for (const m of g.modules) {
      if (m.children?.length) for (const c of m.children) add(c.label, c.href, m.icon ?? FileText, [g.title, m.label]);
      else add(m.label, m.href, m.icon, [g.title]);
    }
  }
  return out;
}

export function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem("fs-theme", next);
  } catch {}
}

/** Template top-bar "Search anything…" button + command palette (80-shell-close.html #palette, 99-app.js renderPalette; Ctrl K). */
export function CommandPalette({ nav, rootLabel }: { nav: { menu: NavModule[]; groups: NavGroup[] }; rootLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => itemsOf(nav, rootLabel), [nav, rootLabel]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return all.filter((x) => !s || `${x.t} ${x.g} ${x.href}`.toLowerCase().includes(s)).slice(0, 40);
  }, [all, q]);

  const show = () => {
    setQ("");
    setIdx(0);
    setClosing(false);
    setOpen(true);
  };
  const hide = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 200);
  };

  // Ctrl/⌘ K anywhere (a screen with its own Ctrl K search, e.g. the Reports Centre, handles it first and prevents it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.defaultPrevented) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(".hl")?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const pick = (x: Item | undefined) => {
    if (!x) return;
    hide();
    if (x.href === THEME) setTimeout(toggleTheme, 120);
    else router.push(x.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return hide();
    if (!list.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(list[idx]);
    }
  };

  return (
    <>
      <button className="top-search" type="button" onClick={show}>
        <Search />
        <span>Search anything…</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>
      {open &&
        createPortal(
          <div className={cn("overlay open", closing && "closing")} onMouseDown={(e) => e.target === e.currentTarget && hide()}>
            <div className="modal palette" role="dialog" aria-label="Search">
              <div className="palette-input">
                <Search />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setIdx(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Jump to a screen… (try “invoice”, “payroll”, “reports”)"
                  autoComplete="off"
                  aria-label="Search screens"
                />
                <span className="kbd">Esc</span>
              </div>
              <div className="palette-list" ref={listRef}>
                {list.length ? (
                  list.map((x, i) => {
                    const Icon = x.icon;
                    return (
                      <a
                        key={x.href}
                        href={x.href === THEME ? "#" : x.href}
                        className={cn(i === idx && "hl")}
                        onMouseEnter={() => setIdx(i)}
                        onClick={(e) => {
                          e.preventDefault();
                          pick(x);
                        }}
                      >
                        <Icon />
                        {x.t}
                        <small>{x.g}</small>
                      </a>
                    );
                  })
                ) : (
                  <div className="empty-state"><h4>No matches</h4><p>Try another keyword.</p></div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
