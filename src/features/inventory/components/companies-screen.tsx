"use client";

import {
  ArrowUpDown, Barcode, Building, Building2, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CirclePause, Clock, History, Link, Mail, MapPin, MoonStar,
  Package, Phone, Plus, Save, Search, Tag, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_COLOURS, companyInitials, type ProductCompany } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createCompany, deleteCompany, listCompanies, nextCompanyCode, updateCompany } from "../api";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = { code: string; name: string; status: "ACTIVE" | "INACTIVE"; address: string; city: string; brandColour: string; country: string; phone: string; email: string; website: string; notes: string };
const PER_PAGE = 9;
const CITIES = ["Lahore", "Karachi", "Islamabad", "Faisalabad", "Sialkot", "Multan", "Peshawar"];
const COUNTRIES = ["Pakistan", "United Arab Emirates", "China", "Turkey", "Saudi Arabia"];
const blank = (colour: string): Form => ({ code: "", name: "", status: "ACTIVE", address: "", city: "", brandColour: colour, country: "Pakistan", phone: "", email: "", website: "", notes: "" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "Just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.round(d / 7);
  return w < 5 ? `${w} week${w === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function Logo({ c, colour }: { c: { name: string; shortName: string | null }; colour: string }) {
  return <span className="pr-logo" style={{ ["--co" as string]: colour }}><b>{companyInitials(c)}</b></span>;
}

function Pager({ page, pages, go }: { page: number; pages: number; go: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== "…") nums.push("…");
  return (
    <div className="pr-pager">
      <button type="button" className="nav" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft /></button>
      {nums.map((p, i) => (p === "…" ? <span key={`d${i}`} className="dots">…</span> : <button key={p} type="button" className={cn(p === page && "on")} onClick={() => go(p)}>{p}</button>))}
      <button type="button" className="nav" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight /></button>
    </div>
  );
}

/** Template app/inventory/companies (4B-products.html + 9F-products.js §3): KPI tiles, filters, company cards and the side panel form. */
export function CompaniesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [rows, setRows] = useState<ProductCompany[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [prod, setProd] = useState("");
  const [sort, setSort] = useState("name");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<ProductCompany | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank(BRAND_COLOURS[0]));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<ProductCompany | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCompanies()
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setError(null);
        // The template opens the create panel on wide screens.
        setPanel((p) => p ?? (can.create && window.innerWidth >= 1280 ? "new" : null));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load companies" }));
    return () => { cancelled = true; };
  }, [attempt, can.create]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const all = useMemo(() => rows ?? [], [rows]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = all.filter((c) => (!s || `${c.code} ${c.name} ${c.city ?? ""}`.toLowerCase().includes(s)) && (!city || c.city === city) && (!status || c.status === status)
      && (!prod || (prod === "with" ? c.productCount > 0 : c.productCount === 0)));
    const by: Record<string, (a: ProductCompany, b: ProductCompany) => number> = {
      name: (a, b) => a.name.localeCompare(b.name), code: (a, b) => a.code.localeCompare(b.code), products: (a, b) => b.productCount - a.productCount,
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    };
    return list.sort(by[sort]);
  }, [all, q, city, status, prod, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const cities = [...new Set(all.map((c) => c.city).filter((x): x is string => !!x))].sort();
  const active = all.filter((c) => c.status === "ACTIVE").length;
  const top = [...all].sort((a, b) => b.productCount - a.productCount)[0];

  const edit = panel && panel !== "new" ? panel : null;
  const openPanel = (c: ProductCompany | "new") => {
    setPanel(c);
    setErrs({});
    setHistory(false);
    setForm(c === "new" ? blank(BRAND_COLOURS[all.length % BRAND_COLOURS.length]) : {
      code: c.code, name: c.name, status: c.status as Form["status"], address: c.address ?? "", city: c.city ?? "", brandColour: c.brandColour, country: c.country,
      phone: c.phone ?? "", email: c.email ?? "", website: c.website ?? "", notes: c.notes ?? "",
    });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const generate = async () => {
    try { set("code", (await nextCompanyCode()).code); } catch (e) { toast(apiMessage(e, "Could not get the next code"), { tone: "danger" }); }
  };

  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = { ...form, address: form.address || null, city: form.city || null, phone: form.phone || null, email: form.email || null, website: form.website || null, notes: form.notes || null };
    try {
      const c = edit ? await updateCompany(edit.id, { ...body, rowVersion: edit.rowVersion }) : await createCompany(body);
      toast(`${c.code} · ${c.name} ${edit ? "saved" : "created"}`, { tone: "good" });
      setFlash(c.id);
      setTimeout(() => setFlash(null), 1700);
      if (edit) openPanel(c); else openPanel("new");
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the company"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const writable = edit ? can.edit : can.create;
  const previewName = form.name.trim() || "New Company";

  return (
    <div className={cn("pr-co-layout", panel && "with-panel")}>
      <div className="pr-co-main">
        <div className="pr-head">
          <span className="pr-cube"><Building2 /></span>
          <div className="pr-head-t"><h1>Product Companies</h1><p>Manage product manufacturing companies and brands used in your business.</p></div>
        </div>
        <div className="pr-co-kpis">
          {([
            [<Building2 key="i" />, "", "Total Companies", String(all.length), "Across all products"],
            [<CircleCheck key="i" />, "", "Active Companies", String(active), "Currently in use"],
            [<CirclePause key="i" />, "n", "Inactive Companies", String(all.length - active), "Not in use"],
            [<Tag key="i" />, "", "Most Used Company", top && top.productCount > 0 ? top.code : "—", top && top.productCount > 0 ? `${top.name} · ${top.productCount} products` : "Products arrive in Phase 8"],
          ] as const).map(([icon, tone, label, value, sub], i) => (
            <div key={label} className="pr-co-kpi" style={{ ["--i" as string]: i }}><span className={tone}>{icon}</span><div><small>{label}</small><b>{rows ? value : "…"}</b><em>{sub}</em></div></div>
          ))}
        </div>
        <div className="pr-co-tool">
          <label className="pr-ctl pr-co-search"><Search /><input type="search" placeholder="Search companies by code, name or city…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search companies" /></label>
          {can.create && <button className="btn primary" type="button" onClick={() => openPanel("new")}><Plus />New Company</button>}
        </div>
        <div className="pr-co-filters">
          <div className="pr-ctl"><select value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} aria-label="City"><option value="">All Cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</select><ChevronDown className="pr-chev" /></div>
          <div className="pr-ctl"><select value={prod} onChange={(e) => { setProd(e.target.value); setPage(1); }} aria-label="Products"><option value="">All Companies</option><option value="with">With products</option><option value="none">No products yet</option></select><ChevronDown className="pr-chev" /></div>
          <div className="pr-ctl"><ArrowUpDown /><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="name">Sort by: Company Name</option><option value="code">Sort by: Code</option><option value="products">Sort by: Most Products</option><option value="updated">Sort by: Recently Updated</option></select><ChevronDown className="pr-chev" /></div>
          <span className="spacer" />
          <div className="seg pr-seg">{([["", "All"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"]] as const).map(([v, l]) => <button key={l} type="button" className={cn(status === v && "active")} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>)}</div>
        </div>
        <div className="pr-co-grid">
          {!rows && [0, 1, 2].map((i) => <div key={i} className="pr-co-card"><Skeleton style={{ height: 110 }} /></div>)}
          {shown.map((c, i) => (
            <article key={c.id} className={cn("pr-co-card", c.status === "INACTIVE" && "off", flash === c.id && "pr-flash")} style={{ ["--i" as string]: i, ["--co" as string]: c.brandColour }}
              tabIndex={0} role="button" aria-label={`${c.name} details`} onClick={() => openPanel(c)} onKeyDown={(e) => e.key === "Enter" && openPanel(c)}>
              <div className="pr-co-top"><Logo c={c} colour={c.brandColour} /><div className="pr-co-tt"><b>{c.code}</b><span>{c.name}</span></div><span className={cn("pr-cobadge", c.status === "ACTIVE" ? "on" : "off")}>{c.status === "ACTIVE" ? "Active" : "Inactive"}</span></div>
              <div className="pr-co-meta"><span><Package />{c.productCount} Products</span><span><MapPin />{c.city || "—"}, {c.country}</span><span><Clock />Updated: {ago(c.updatedAt)}</span></div>
            </article>
          ))}
          {rows && !shown.length && (
            <div className="pr-emptybox"><span><Building /></span><b>{all.length ? "No companies match" : "No companies yet"}</b><small>{all.length ? "Try another search or status." : "Add the manufacturers and brands your products belong to."}</small></div>
          )}
        </div>
        <div className="pr-co-foot"><span>{filtered.length ? `Showing ${(current - 1) * PER_PAGE + 1}–${(current - 1) * PER_PAGE + shown.length} of ${filtered.length} companies` : "No companies"}</span><Pager page={current} pages={pages} go={setPage} /></div>
      </div>

      <aside className="pr-co-panel" aria-label={edit ? "Edit company" : "Create new company"}>
        <div className="pr-co-ph">
          <div><h2>{edit ? edit.name : "Create New Company"}</h2><p>{edit ? `${edit.code} · ${edit.productCount} products` : "Add a new product company to your system."}</p></div>
          <span className="row" style={{ gap: 6, alignItems: "flex-start" }}>
            {edit && <button className={cn("x", history && "on")} type="button" onClick={() => setHistory((h) => !h)} title={history ? "Back to the form" : "Row history"} aria-label="Row history"><History /></button>}
            {edit && can.remove && !history && <button className="x" type="button" style={{ color: "var(--danger)" }} onClick={() => setRemoving(edit)} title="Delete company" aria-label="Delete company"><Trash2 /></button>}
            <button className="x" type="button" onClick={() => setPanel(null)} aria-label="Close panel"><X /></button>
          </span>
        </div>
        {edit && history ? <div className="pr-co-form"><HistoryTab schema="Inventory" table="ProductCompanies" id={edit.id} /></div> : (
          <form className="pr-co-form" noValidate autoComplete="off" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label className={cn("pr-ff", errs.code && "err")}><span>Company Code{!edit && <small> (blank = next free)</small>}</span>
              <div className="pr-in"><input name="code" placeholder="e.g. CO-13" maxLength={8} style={{ textTransform: "uppercase" }} value={form.code} disabled={!writable} onChange={(e) => set("code", e.target.value.toUpperCase())} />
                {!edit && <button type="button" className="pr-in-cell" onClick={generate} title="Generate next code" aria-label="Generate next code"><Barcode /></button>}</div>
              <small className="pr-err">{errs.code}</small></label>
            <label className={cn("pr-ff", errs.name && "err")}><span>Company Name<em>*</em></span><div className="pr-in"><input name="name" placeholder="Enter company name" value={form.name} disabled={!writable} onChange={(e) => set("name", e.target.value)} /></div><small className="pr-err">{errs.name}</small></label>
            <div className="pr-ff"><span>Status</span><div className="pr-radios">{(["ACTIVE", "INACTIVE"] as const).map((s) => <button key={s} type="button" disabled={!writable} className={cn(form.status === s && "on")} onClick={() => set("status", s)}><i />{s === "ACTIVE" ? "Active" : "Inactive"}</button>)}</div></div>
            <label className="pr-ff"><span>Address <small>(Optional)</small></span><div className="pr-in"><input name="address" placeholder="e.g. Gulberg, Lahore" value={form.address} disabled={!writable} onChange={(e) => set("address", e.target.value)} /></div></label>
            <div className="pr-fg c2">
              <label className="pr-ff"><span>City</span><div className="pr-in"><input name="city" placeholder="e.g. Lahore" list="pr-cities" value={form.city} disabled={!writable} onChange={(e) => set("city", e.target.value)} /></div></label>
              <div className="pr-ff"><span>Brand colour</span><div className="pr-swatches">{BRAND_COLOURS.map((c) => <button key={c} type="button" disabled={!writable} style={{ ["--co" as string]: c }} className={cn(form.brandColour === c && "on")} onClick={() => set("brandColour", c)} aria-label={`Colour ${c}`} />)}</div></div>
            </div>
            <datalist id="pr-cities">{CITIES.map((c) => <option key={c}>{c}</option>)}</datalist>
            <label className="pr-ff"><span>Country <small>(Optional)</small></span><div className="pr-in lead"><i className="pr-flag" title="Pakistan" aria-hidden><MoonStar /></i>
              <select name="country" value={form.country} disabled={!writable} onChange={(e) => set("country", e.target.value)}>{[...new Set([...COUNTRIES, form.country])].map((c) => <option key={c}>{c}</option>)}</select></div></label>
            <label className={cn("pr-ff", errs.phone && "err")}><span>Phone <small>(Optional)</small></span><div className="pr-in lead"><i><Phone /></i><input name="phone" placeholder="e.g. 021-1234567" value={form.phone} disabled={!writable} onChange={(e) => set("phone", e.target.value)} /></div><small className="pr-err">{errs.phone}</small></label>
            <label className={cn("pr-ff", errs.email && "err")}><span>Email <small>(Optional)</small></span><div className="pr-in lead"><i><Mail /></i><input name="email" type="email" placeholder="e.g. info@company.com" value={form.email} disabled={!writable} onChange={(e) => set("email", e.target.value)} /></div><small className="pr-err">{errs.email}</small></label>
            <label className={cn("pr-ff", errs.website && "err")}><span>Website <small>(Optional)</small></span><div className="pr-in lead"><i><Link /></i><input name="web" placeholder="e.g. www.company.com" value={form.website} disabled={!writable} onChange={(e) => set("website", e.target.value)} /></div><small className="pr-err">{errs.website}</small></label>
            <label className="pr-ff"><span>Notes <small>(Optional)</small></span><div className="pr-in"><textarea name="notes" rows={2} placeholder="Add any additional notes…" value={form.notes} disabled={!writable} onChange={(e) => set("notes", e.target.value)} /></div></label>
            <div className="pr-co-preview"><small>Card preview</small>
              <div className="pr-co-card mini" style={{ ["--co" as string]: form.brandColour }}><div className="pr-co-top"><Logo c={{ name: previewName, shortName: edit?.shortName ?? null }} colour={form.brandColour} /><div className="pr-co-tt"><b>{form.code || edit?.code || "CO-…"}</b><span>{previewName}</span></div><span className={cn("pr-cobadge", form.status === "ACTIVE" ? "on" : "off")}>{form.status === "ACTIVE" ? "Active" : "Inactive"}</span></div></div>
            </div>
          </form>
        )}
        <div className="pr-co-pfoot">
          <button className="btn secondary" type="button" onClick={() => (history ? setHistory(false) : edit && can.create ? openPanel("new") : setPanel(null))}>{history ? "Back" : "Cancel"}</button>
          {writable && !history && <button className="btn primary" type="button" onClick={save} disabled={busy}><Save /><span>{busy ? "Saving…" : "Save Company"}</span></button>}
        </div>
      </aside>

      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteCompany(removing.id, removing.rowVersion);
          toast(`${removing.name} deleted`, { tone: "good" });
          if (can.create) openPanel("new"); else setPanel(null);
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete"), { tone: "danger" });
        } finally {
          setRemoving(null);
        }
      }}>Only companies without products can be deleted, and the code can&apos;t be used again. Otherwise set it to Inactive.</ConfirmDialog>
    </div>
  );
}
