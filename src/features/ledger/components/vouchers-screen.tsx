"use client";

import {
  ArrowDownLeft, Ban, Banknote, Calendar, ClipboardList, Clock, Copy, Download, Eye, FilePen, Filter, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, Undo2, User, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GlOptions, VoucherList, VoucherListItem } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay, Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { deleteVoucher, duplicateVoucher, getVoucher, listVouchers, postVoucher, reverseVoucher, voucherOptions } from "../api";
import { amt, errMsg, initials, StatusBadge, typeUi, VoucherActModal, type ActTarget } from "./vouchers-ui";

type Can = { create: boolean; edit: boolean; post: boolean; remove: boolean; exportCsv: boolean };
type Range = { label: string; from: string; to: string; title: string };
const PAGE = 14;
const CHIPS = ["JV", "CPV", "CRV", "BPV", "BRV", "CON"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ranges(options: GlOptions | null): Range[] {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const month = (yy: number, mm: number): Range => {
    const a = new Date(yy, mm, 1), b = new Date(yy, mm + 1, 0);
    return { label: `${dateLabel(isoDay(a)).slice(0, 6)} – ${dateLabel(isoDay(b))}`, from: isoDay(a), to: isoDay(b), title: `${MONTHS[a.getMonth()]} ${a.getFullYear()}` };
  };
  const q = Math.floor(m / 3) * 3;
  const out = [month(y, m), month(y, m - 1), { label: `Quarter · ${dateLabel(isoDay(new Date(y, q, 1))).slice(3, 6)} – ${dateLabel(isoDay(new Date(y, q + 3, 0))).slice(3)}`, from: isoDay(new Date(y, q, 1)), to: isoDay(new Date(y, q + 3, 0)), title: "this quarter" }];
  const today = isoDay(now);
  const fy = options?.fiscalYears.find((f) => f.startDate <= today && f.endDate >= today);
  if (fy) out.push({ label: `${fy.code} to date`, from: fy.startDate, to: today, title: `${fy.code} to date` });
  out.push({ label: "All dates", from: "", to: "", title: "all dates" });
  return out;
}

/** Template app/accounting/vouchers (40-acc-core.html): KPIs, type chips, filters, register table, post / reverse modal. */
export function VouchersScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [options, setOptions] = useState<GlOptions | null>(null);
  const [data, setData] = useState<VoucherList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [range, setRange] = useState<Range>(() => ranges(null)[0]!);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [big, setBig] = useState(false);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [act, setAct] = useState<{ mode: "post" | "reverse"; target: ActTarget } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; docNo: string; rowVersion: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    voucherOptions().then(setOptions).catch(() => setOptions(null));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listVouchers({ from: range.from, to: range.to, type, status, branch, search, mine, minAmount: big ? 100000 : undefined, page, pageSize: PAGE })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load vouchers" }));
    return () => {
      cancelled = true;
    };
  }, [range, type, status, branch, search, mine, big, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    setPicked(new Set());
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const allCount = Object.values(data?.typeCounts ?? {}).reduce((s, n) => s + n, 0);
  const pageDr = items.reduce((s, v) => s + v.totalDebit, 0);
  const pageCr = items.reduce((s, v) => s + v.totalCredit, 0);
  const filtered = !!(type || status || branch || search || mine || big);

  const target = async (v: VoucherListItem): Promise<ActTarget> => {
    const full = await getVoucher(v.id);
    return { id: full.id, docNo: full.docNo, voucherType: full.voucherType, status: full.status, postingDate: full.postingDate, totalDebit: full.totalDebit, lineCount: full.lines.length, rowVersion: full.rowVersion };
  };
  const open = async (mode: "post" | "reverse", v: VoucherListItem) => {
    try {
      setAct({ mode, target: await target(v) });
    } catch (e) {
      toast(errMsg(e, "Could not open the voucher"), { tone: "danger" });
    }
  };
  const duplicate = async (v: VoucherListItem) => {
    setBusy(true);
    try {
      const d = await duplicateVoucher(v.id);
      toast(`${v.docNo} duplicated as ${d.docNo}`, { tone: "good", action: { label: "Open", onClick: () => router.push(`/accounting/vouchers/${d.id}`) } });
      reload();
    } catch (e) {
      toast(errMsg(e, "Could not duplicate"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const rowMenu = (v: VoucherListItem): MenuItem[] => {
    const out: MenuItem[] = [{ label: "Open voucher", icon: <Eye />, onClick: () => router.push(`/accounting/vouchers/${v.id}`) }];
    if (v.status === "DRAFT" && can.edit && v.voucherType !== "OB" && v.voucherType !== "SYSTEM") out.push({ label: "Edit draft", icon: <Pencil />, onClick: () => router.push(`/accounting/vouchers/${v.id}/edit`) });
    if (v.status === "DRAFT" && can.post) out.push({ label: "Post voucher…", icon: <Send />, onClick: () => open("post", v) });
    if (v.status === "PENDING_APPROVAL") out.push({ label: "Review approval", icon: <Clock />, onClick: () => router.push(`/accounting/vouchers/${v.id}`) });
    if (v.status === "POSTED" && can.post) out.push({ label: "Reverse voucher…", icon: <Undo2 />, onClick: () => open("reverse", v) });
    if (v.status === "REVERSED") out.push({ label: "Already reversed", icon: <Ban />, onClick: () => toast(`${v.docNo} was reversed${v.reversedBy ? ` by ${v.reversedBy}` : ""}`, { tone: "info" }) });
    if (can.create && v.voucherType !== "OB" && v.voucherType !== "SYSTEM") out.push({ label: "Duplicate as draft", icon: <Copy />, onClick: () => duplicate(v) });
    if (v.status === "DRAFT" && can.remove) {
      out.push({ sep: true });
      out.push({
        label: "Delete draft", icon: <Trash2 />, danger: true,
        onClick: async () => {
          try {
            const full = await getVoucher(v.id);
            setRemoving({ id: v.id, docNo: v.docNo, rowVersion: full.rowVersion });
          } catch (e) {
            toast(errMsg(e, "Could not open the voucher"), { tone: "danger" });
          }
        },
      });
    }
    return out;
  };
  const filterMenu = (anchor: HTMLElement) =>
    setMenu({
      anchor,
      items: [
        { label: mine ? "✓ Created by me" : "Created by me", icon: <User />, onClick: () => filter(setMine)(!mine) },
        { label: big ? "✓ Amount above Rs 100,000" : "Amount above Rs 100,000", icon: <Banknote />, onClick: () => filter(setBig)(!big) },
        { sep: true },
        { label: "Clear filters", icon: <X />, onClick: () => { setType(""); setStatus(""); setBranch(""); setQ(""); setSearch(""); setMine(false); setBig(false); setPage(1); } },
      ],
    });
  const exportRows = () => {
    const rows = picked.size ? items.filter((v) => picked.has(v.id)) : items;
    downloadCsv(`vouchers-${isoDay(new Date())}.csv`, [
      ["Voucher #", "Date", "Type", "Narration", "Reference", "Branch", "Debit", "Credit", "Status", "Created by"],
      ...rows.map((v) => [v.docNo, v.postingDate, v.voucherType, v.narration, v.referenceNo, v.branch.name, v.totalDebit.toFixed(2), v.totalCredit.toFixed(2), v.status, v.preparedBy?.name ?? null]),
    ]);
    toast(`Voucher register exported (${rows.length} rows)`, { tone: "good" });
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const k = data?.kpis;
  return (
    <>
      <PageHead
        eyebrow="Accounting / Vouchers"
        title="Voucher Register"
        description="Track, review and manage every journal, cash, bank and contra voucher."
        actions={
          <>
            <Button icon={<Calendar />} onClick={(e) => setMenu({ anchor: e.currentTarget, items: ranges(options).map((r) => ({ label: r.label, icon: <Calendar />, onClick: () => filter(setRange)(r) })) })}>{range.label}</Button>
            {can.exportCsv && <Button icon={<Download />} disabled={!items.length} onClick={exportRows}>Export</Button>}
            {can.create && <ButtonLink variant="primary" icon={<Plus />} href="/accounting/vouchers/new">New Voucher</ButtonLink>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Total vouchers</span><span className="icon-well"><ClipboardList /></span></div><strong>{k ? k.count.toLocaleString("en-US") : "—"}</strong><small>{range.title === "all dates" ? "All dates" : `In ${range.title}`}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Total debit</span><span className="icon-well"><ArrowDownLeft /></span></div><strong>{k ? <Money value={k.totalDebit} dec={0} /> : "—"}</strong><small>Posted · balanced with credits</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending approval</span><span className="icon-well"><Clock /></span></div><strong>{k?.pending ?? "—"}</strong><small>Waiting in the approval inbox</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Drafts</span><span className="icon-well"><FilePen /></span></div><strong>{k?.drafts ?? "—"}</strong><small>Not yet posted</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Vouchers — {range.title === "all dates" ? "all dates" : range.title}</h3><p>{total.toLocaleString("en-US")} vouchers{filtered ? " match the filters" : " · debits equal credits"}</p></div></div>
        <div className="toolbar">
          <div className="chips">
            <button type="button" className={cn(!type && "active")} onClick={() => filter(setType)("")}>All <i>{allCount}</i></button>
            {CHIPS.map((t) => <button key={t} type="button" className={cn(type === t && "active")} onClick={() => filter(setType)(t)}>{typeUi(t).label} <i>{data?.typeCounts[t] ?? 0}</i></button>)}
          </div>
          <span className="spacer" />
          <label className="search-field"><Search /><input placeholder="Search vouchers, narration, amount…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
            <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PENDING_APPROVAL">Pending</option><option value="POSTED">Posted</option><option value="REVERSED">Reversed</option>
          </select>
          <select value={branch} onChange={(e) => filter(setBranch)(e.target.value)}>
            <option value="">All branches</option>
            {options?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Button size="sm" icon={<Filter />} className={cn((mine || big) && "active")} onClick={(e) => filterMenu(e.currentTarget)}>Filters{mine || big ? ` · ${Number(mine) + Number(big)}` : ""}</Button>
        </div>
        {!data ? (
          <div style={{ padding: 18 }}><Skeleton style={{ height: 320 }} /></div>
        ) : !items.length ? (
          <EmptyState
            icon={<ClipboardList />}
            title={filtered ? "No vouchers match" : "No vouchers in this period"}
            description={filtered ? "Try another type, status or search." : "Vouchers you save or post appear here."}
            action={can.create && !filtered ? <ButtonLink variant="primary" icon={<Plus />} href="/accounting/vouchers/new">New Voucher</ButtonLink> : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select page" checked={picked.size === items.length} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((v) => v.id)) : new Set())} /></th>
                  <th>Voucher #</th><th>Date</th><th>Type</th><th>Narration</th><th>Branch</th><th className="num">Debit</th><th className="num">Credit</th><th>Status</th><th>Created by</th><th />
                </tr>
              </thead>
              <tbody>
                {items.map((v) => {
                  const t = typeUi(v.voucherType);
                  return (
                    <tr key={v.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input")) router.push(`/accounting/vouchers/${v.id}`); }} style={{ cursor: "pointer" }}>
                      <td><input type="checkbox" aria-label={`Select ${v.docNo}`} checked={picked.has(v.id)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(v.id); else s.delete(v.id); setPicked(s); }} /></td>
                      <td><Link className="link" href={`/accounting/vouchers/${v.id}`}><Hl text={v.docNo} q={search} /></Link><small>{v.reversalOf ? `Reverses ${v.reversalOf}` : v.referenceNo ?? t.name.replace(/ voucher$/, "")}</small></td>
                      <td>{dateLabel(v.postingDate)}</td>
                      <td><Badge tone={t.tone}>{t.label}</Badge></td>
                      <td><Hl text={v.narration} q={search} />{(v.partyName || v.reversedBy) && <small>{v.reversedBy ? `Reversed by ${v.reversedBy}` : v.partyName}</small>}</td>
                      <td>{v.branch.name}</td>
                      <td className="num dr">{amt(v.totalDebit)}</td>
                      <td className="num cr">{amt(v.totalCredit)}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td>{v.preparedBy ? <div className="cell-user"><span className="avatar sm">{initials(v.preparedBy.name)}</span><div><b>{v.preparedBy.name}</b></div></div> : <span className="muted">System</span>}</td>
                      <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Actions for ${v.docNo}`} disabled={busy} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(v) })}><MoreHorizontal /></button></td>
                    </tr>
                  );
                })}
                <tr className="total"><td colSpan={6}>Page total ({items.length} voucher{items.length === 1 ? "" : "s"})</td><td className="num">{amt(pageDr)}</td><td className="num">{amt(pageCr)}</td><td colSpan={3} /></tr>
              </tbody>
            </table>
          </div>
        )}
        {data && total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total.toLocaleString("en-US")}</span>
            <Pager page={page} pages={pages} onPage={setPage} />
          </div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      {act && (
        <VoucherActModal
          mode={act.mode}
          target={act.target}
          options={options}
          onClose={() => setAct(null)}
          onPost={async (postingDate) => {
            const v = await postVoucher(act.target.id, act.target.rowVersion, postingDate);
            setAct(null);
            toast(`${v.docNo} posted to the general ledger`, { tone: "good" });
            reload();
          }}
          onReverse={async (body) => {
            const r = await reverseVoucher(act.target.id, { ...body, rowVersion: act.target.rowVersion });
            setAct(null);
            toast(`Reversal ${r.docNo} posted for ${act.target.docNo}`, { tone: "warn", action: { label: "Open", onClick: () => router.push(`/accounting/vouchers/${r.id}`) } });
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.docNo ?? "draft"}?`}
        confirmLabel="Delete draft"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          try {
            await deleteVoucher(removing.id, removing.rowVersion);
            toast(`${removing.docNo} deleted`, { tone: "good" });
            setRemoving(null);
            reload();
          } catch (e) {
            toast(errMsg(e, "Could not delete the draft"), { tone: "danger" });
          } finally {
            setBusy(false);
          }
        }}
      >
        The draft and its lines are removed. Posted vouchers are never deleted; they are reversed.
      </ConfirmDialog>
    </>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const list: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) list.push(p);
    else if (list[list.length - 1] !== "…") list.push("…");
  }
  return (
    <div className="pager">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      {list.map((p, i) => (p === "…" ? <button key={`g${i}`} type="button" disabled>…</button> : <button key={p} type="button" className={cn(p === page && "active")} onClick={() => onPage(p)}>{p}</button>))}
      <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}
