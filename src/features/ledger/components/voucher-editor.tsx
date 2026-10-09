"use client";

import "./voucher-editor.css";
import {
  AlignLeft, ArrowLeft, ArrowLeftRight, Banknote, Building2, Calendar, CalendarCheck, Check, ChevronDown, ChevronRight, CircleCheck, CloudUpload, Copy,
  Ellipsis, FilePenLine, GitBranch, GripVertical, HandCoins, Hash, Info, Landmark, LayoutTemplate, ListOrdered, ListPlus, Lock, NotebookPen, Paperclip,
  PiggyBank, Plus, Save, Scale, Shapes, Trash2, UserCheck, UserRound, Users, Wallet, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ONE_SIDED, voucherErrors, type GlOptions, type Voucher, type VoucherInput } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { createRecurring, createVoucher, getVoucher, listRecurring, postVoucher, submitVoucher, updateVoucher, voucherOptions } from "../api";

type VType = VoucherInput["voucherType"];
type Line = { key: string; id?: string; accountId: string; particulars: string; debit: string; credit: string; costCentreId: string };
type Form = {
  voucherType: VType; docDate: string; postingDate: string; referenceNo: string; branchId: string; department: string; narration: string; remarks: string;
  tags: string[]; cashBankAccountId: string; partyName: string; instrumentType: string; instrumentNo: string; instrumentDate: string; autoReverse: boolean; autoReverseOn: string;
};
type Can = { post: boolean; template: boolean };

/** Template VT (94-purchase-docs.js): per type, its tile, subtitles and the cash / bank side. */
const VT: Record<VType, { name: string; tile: string; small: string; icon: LucideIcon; sub: string; esub: string; box?: "cash" | "bank"; party?: string }> = {
  JV: { name: "Journal Voucher", tile: "Journal", small: "General entry", icon: NotebookPen, sub: "Enter a balanced voucher — every debit has a matching credit.", esub: "Add debit and credit lines. The voucher must be balanced." },
  CPV: { name: "Cash Payment Voucher", tile: "Cash Payment", small: "Cash out", icon: Wallet, box: "cash", party: "Pay to", sub: "Pay out of a cash account — the cash leg is posted for you.", esub: "List what the cash was spent on. The cash credit is added automatically." },
  CRV: { name: "Cash Receipt Voucher", tile: "Cash Receipt", small: "Cash in", icon: HandCoins, box: "cash", party: "Received from", sub: "Receive cash into a drawer — the cash leg is posted for you.", esub: "List what the cash was received for. The cash debit is added automatically." },
  BPV: { name: "Bank Payment Voucher", tile: "Bank Payment", small: "From bank", icon: Landmark, box: "bank", party: "Payee", sub: "Pay from a bank account by cheque or transfer.", esub: "List what the payment covers. The bank credit is added automatically." },
  BRV: { name: "Bank Receipt Voucher", tile: "Bank Receipt", small: "To bank", icon: PiggyBank, box: "bank", party: "Received from", sub: "Receive money into a bank account.", esub: "List what the receipt is for. The bank debit is added automatically." },
  CON: { name: "Contra Voucher", tile: "More", small: "Contra", icon: Ellipsis, sub: "Move money between cash and bank accounts.", esub: "Contra lines may only use cash and bank accounts." },
};
const TYPES = Object.keys(VT) as VType[];
const INSTRUMENTS: Record<"DEBIT" | "CREDIT", [string, string][]> = {
  DEBIT: [["CHEQUE", "Cheque"], ["IBFT", "Online transfer (IBFT)"], ["PAY_ORDER", "Pay order"], ["RTGS", "RTGS"]],
  CREDIT: [["CHEQUE_DEPOSIT", "Cheque deposit"], ["IBFT", "Online transfer (IBFT)"], ["CASH_DEPOSIT", "Cash deposit"]],
};
/** Recurring templates take only these types (RecurringVoucherTemplateVoucherType). */
const TEMPLATE_TYPES: VType[] = ["JV", "BPV", "CPV"];

let seq = 0;
const newKey = () => `l${++seq}`;
const blank = (): Line => ({ key: newKey(), accountId: "", particulars: "", debit: "", credit: "", costCentreId: "" });
const num = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addMonth1 = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
/** The first cash / bank account of a one-sided type, preselected like the template. */
const firstBox = (o: GlOptions, t: VType) => (!ONE_SIDED[t] ? "" : ((t.startsWith("C") ? o.cashAccounts : o.bankAccounts)[0]?.accountId ?? ""));
const label = (a: { code: string; name: string }) => `${a.code} · ${a.name}`;

function emptyForm(type: VType, branchId: string): Form {
  const d = today();
  return {
    voucherType: type, docDate: d, postingDate: d, referenceNo: "", branchId, department: "", narration: "", remarks: "", tags: [], cashBankAccountId: "",
    partyName: "", instrumentType: "", instrumentNo: "", instrumentDate: "", autoReverse: false, autoReverseOn: addMonth1(d),
  };
}

function fromVoucher(v: Voucher): { form: Form; lines: Line[] } {
  return {
    form: {
      voucherType: v.voucherType as VType, docDate: v.docDate, postingDate: v.postingDate, referenceNo: v.referenceNo ?? "", branchId: v.branch.id,
      department: v.department ?? "", narration: v.narration, remarks: v.remarks ?? "", tags: v.tags, cashBankAccountId: v.cashBankAccount?.id ?? "",
      partyName: v.partyName ?? "", instrumentType: v.instrumentType ?? "", instrumentNo: v.instrumentNo ?? "", instrumentDate: v.instrumentDate ?? "",
      autoReverse: !!v.autoReverseOn, autoReverseOn: v.autoReverseOn ?? addMonth1(v.postingDate),
    },
    lines: v.lines.filter((l) => !l.isAutoContra).map((l) => ({
      key: newKey(), id: l.id, accountId: l.account.id, particulars: l.particulars ?? "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "",
      costCentreId: l.costCentre?.id ?? "",
    })),
  };
}

/** Finance › Vouchers › New / Edit (template app/accounting/vouchers/new, the pd-vn editor). Only drafts are editable. */
export function VoucherEditor({ id, initialType, can }: { id: string | null; initialType: string | null; can: Can }) {
  const router = useRouter();
  const toast = useToast();
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "draft" | "main">(null);
  const [asTemplate, setAsTemplate] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [menu, setMenu] = useState<null | { anchor: HTMLElement; items: MenuItem[] }>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const focusKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [o, v] = await Promise.all([voucherOptions(), id ? getVoucher(id) : Promise.resolve(null)]);
      setOpts(o);
      setVoucher(v);
      if (v) {
        const x = fromVoucher(v);
        setForm(x.form);
        setLines(x.lines.length ? x.lines : [blank(), blank()]);
      } else {
        const t = (TYPES as string[]).includes(initialType ?? "") ? (initialType as VType) : "JV";
        setForm({ ...emptyForm(t, o.branches[0]?.id ?? ""), cashBankAccountId: firstBox(o, t) });
        setLines(ONE_SIDED[t] ? [blank()] : [blank(), blank()]);
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "Couldn't reach the server"));
    }
  }, [id, initialType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the data once
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusKey.current) return;
    document.querySelector<HTMLInputElement>(`tr[data-key="${focusKey.current}"] input[data-k="acc"]`)?.focus();
    focusKey.current = null;
  }, [lines]);

  const type = form?.voucherType ?? "JV";
  const side = ONE_SIDED[type];
  const cfg = VT[type];
  const boxList = useMemo(() => (opts ? (cfg.box === "cash" ? opts.cashAccounts : cfg.box === "bank" ? opts.bankAccounts : []) : []), [opts, cfg.box]);
  const cashBankIds = useMemo(() => new Set(opts ? [...opts.cashAccounts, ...opts.bankAccounts].map((a) => a.accountId) : []), [opts]);
  /** Lines of a cash / bank voucher can't use cash or bank accounts (the leg is automatic); contra lines may only use them. */
  const lineAccounts = useMemo(() => {
    if (!opts) return [];
    if (type === "CON") return opts.accounts.filter((a) => cashBankIds.has(a.id));
    if (side) return opts.accounts.filter((a) => !cashBankIds.has(a.id));
    return opts.accounts;
  }, [opts, type, side, cashBankIds]);
  const byId = useMemo(() => new Map(opts?.accounts.map((a) => [a.id, a]) ?? []), [opts]);
  const byLabel = useMemo(() => new Map(lineAccounts.map((a) => [label(a), a])), [lineAccounts]);

  const totals = useMemo(() => {
    let dr = 0, cr = 0, missing = 0;
    for (const l of lines) {
      const d = num(l.debit), c = num(l.credit);
      if (side) {
        const v = side === "DEBIT" ? d || c : c || d;
        if (side === "DEBIT") dr += v; else cr += v;
        if (v && !l.accountId) missing++;
      } else {
        dr += d; cr += c;
        if ((d || c) && !l.accountId) missing++;
      }
    }
    if (side === "DEBIT") cr = dr;
    if (side === "CREDIT") dr = cr;
    dr = r2(dr); cr = r2(cr);
    const box = side ? !!form?.cashBankAccountId : true;
    const diff = r2(dr - cr);
    const ok = dr > 0 && Math.abs(diff) < 0.005 && !missing && box;
    const why = ok ? "Difference is zero" : !dr && !cr ? "Add amounts to begin" : missing ? `${missing} line${missing > 1 ? "s" : ""} without an account` : !box ? `Select the ${cfg.box} account` : `Difference Rs ${fmt(Math.abs(diff))}`;
    return { dr, cr, ok, why, started: dr + cr > 0 };
  }, [lines, side, form?.cashBankAccountId, cfg.box]);

  if (loadError) return <ErrorState message={loadError.message} reference={loadError.correlationId} onRetry={() => void load()} />;
  if (!opts || !form) return <EditorSkeleton />;
  if (voucher && voucher.status !== "DRAFT") {
    return (
      <div className="pd-scr pd-vn">
        <Banner tone="warn" title={`${voucher.docNo} can't be edited`} action={<Link className="btn sm secondary" href={`/accounting/vouchers/${voucher.id}`}>Open voucher</Link>}>
          Only draft vouchers can be changed. {voucher.status === "POSTED" ? "Reverse a posted voucher to correct it." : voucher.status === "PENDING_APPROVAL" ? "Recall it from approval first." : ""}
        </Banner>
      </div>
    );
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const clearLineError = (i: number, f: string) => setErrors((e) => (e[`lines.${i}.${f}`] || e.lines ? { ...e, [`lines.${i}.${f}`]: "", lines: "" } : e));
  const addLine = (n = 1) => {
    const add = Array.from({ length: n }, blank);
    focusKey.current = add[0]!.key;
    setLines((ls) => [...ls, ...add]);
  };
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blank()]));
  const duplicateLine = (key: string) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      const c = { ...ls[i]!, key: newKey(), id: undefined };
      return [...ls.slice(0, i + 1), c, ...ls.slice(i + 1)];
    });
  const moveLine = (from: string, to: string) =>
    setLines((ls) => {
      const a = ls.findIndex((l) => l.key === from), b = ls.findIndex((l) => l.key === to);
      if (a < 0 || b < 0 || a === b) return ls;
      const next = [...ls];
      const [m] = next.splice(a, 1);
      next.splice(b, 0, m!);
      return next;
    });

  /** Switching type keeps the lines: amounts move to the new side, cash / bank lines drop out of a one-sided voucher. */
  const setType = (t: VType) => {
    if (t === type) return;
    const to = ONE_SIDED[t], from = side;
    setLines((ls) => {
      let next = ls;
      if (to) {
        next = ls.filter((l) => !cashBankIds.has(l.accountId)).map((l) => {
          const v = String(num(l.debit) || num(l.credit) || "");
          return { ...l, debit: to === "DEBIT" ? v : "", credit: to === "CREDIT" ? v : "" };
        });
      } else if (from) {
        next = ls.map((l) => ({ ...l, debit: from === "DEBIT" ? l.debit || l.credit : "", credit: from === "CREDIT" ? l.credit || l.debit : "" }));
      }
      if (t === "CON") next = next.map((l) => (cashBankIds.has(l.accountId) ? l : { ...l, accountId: "" }));
      return next.length ? next : [blank()];
    });
    setForm((f) => (f ? { ...f, voucherType: t, cashBankAccountId: opts ? firstBox(opts, t) : "", instrumentType: "", instrumentNo: "", instrumentDate: "", autoReverse: false } : f));
    setErrors({});
    if (!TEMPLATE_TYPES.includes(t)) setAsTemplate(false);
  };

  const period = opts.periods.find((p) => p.startDate <= form.postingDate && p.endDate >= form.postingDate) ?? null;
  const number = voucher?.docNo ?? opts.nextNumbers[type] ?? `${type}-…`;
  const routing = voucher?.routing ?? null;
  const filled = lines.filter((l) => l.accountId || l.debit || l.credit || l.particulars.trim());

  const payload = (): { body: VoucherInput; kept: string[] } => {
    const body: VoucherInput = {
      voucherType: type, docDate: form.docDate, postingDate: form.postingDate, referenceNo: form.referenceNo.trim() || null, branchId: form.branchId,
      department: form.department.trim() || null, narration: form.narration.trim(), remarks: form.remarks.trim() || null, tags: form.tags,
      cashBankAccountId: side ? form.cashBankAccountId || null : null, partyName: side ? form.partyName.trim() || null : null,
      instrumentType: cfg.box === "bank" ? form.instrumentType || null : null, instrumentNo: cfg.box === "bank" ? form.instrumentNo.trim() || null : null,
      instrumentDate: cfg.box === "bank" ? form.instrumentDate || null : null, autoReverseOn: type === "JV" && form.autoReverse ? form.autoReverseOn || null : null,
      lines: filled.map((l) => {
        const d = num(l.debit), c = num(l.credit);
        const amt = side ? d || c : 0;
        return {
          ...(l.id && { id: l.id }), accountId: l.accountId, particulars: l.particulars.trim() || null,
          debit: side ? (side === "DEBIT" ? amt : 0) : d, credit: side ? (side === "CREDIT" ? amt : 0) : c, costCentreId: l.costCentreId || null,
        };
      }),
    };
    return { body, kept: filled.map((l) => l.key) };
  };

  /** Server / client field keys use the sent-line index; map them back to the row keys on screen. */
  const showErrors = (e: Record<string, string>, kept: string[]) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(e)) {
      const m = /^lines\.(\d+)\.(\w+)$/.exec(k);
      if (m) {
        const row = lines.findIndex((l) => l.key === kept[Number(m[1])]);
        out[`lines.${row}.${m[2]}`] = v;
      } else out[k] = v;
    }
    setErrors(out);
  };

  const validate = (body: VoucherInput, kept: string[]) => {
    const e = voucherErrors(body);
    body.lines.forEach((l, i) => { if (!l.accountId) e[`lines.${i}.accountId`] = "Choose the account"; });
    if (!body.narration) e.narration = "Narration is required";
    if (!body.branchId) e.branchId = "Choose the branch";
    if (Object.keys(e).length) {
      showErrors(e, kept);
      toast(Object.values(e)[0]!, { tone: "danger" });
      return false;
    }
    return true;
  };

  const saveTemplate = async (body: VoucherInput) => {
    try {
      await createRecurring({
        name: body.narration.slice(0, 80), description: null, voucherType: body.voucherType, frequency: "NONE", runDay: null, runOnLastDay: false, runWeekday: null,
        runMonth: null, startDate: null, endMode: "NEVER", endAfterCount: null, endOnDate: null, branchId: body.branchId, narration: body.narration,
        cashBankAccountId: body.cashBankAccountId, partyName: body.partyName, autoPost: false, notifyOnFailure: true,
        lines: body.lines.map((l) => ({ accountId: l.accountId, particulars: l.particulars, debit: l.debit, credit: l.credit, costCentreId: l.costCentreId })),
      });
      return true;
    } catch (e) {
      toast(`Voucher saved, but the template wasn't: ${e instanceof ApiError ? e.message : "try again"}`, { tone: "warn" });
      return false;
    }
  };

  /** "draft": save only. "main": save, then submit when a workflow routes it, otherwise post (with vch:post). "new": save draft and start another. */
  const save = async (mode: "draft" | "main" | "new") => {
    const { body, kept } = payload();
    if (!validate(body, kept)) return;
    setBusy(mode === "main" ? "main" : "draft");
    try {
      let v = voucher ? await updateVoucher(voucher.id, { ...body, rowVersion: voucher.rowVersion }) : await createVoucher(body);
      setVoucher(v);
      const tpl = asTemplate && can.template && TEMPLATE_TYPES.includes(type) ? await saveTemplate(body) : false;
      const extra = tpl ? " · saved as template" : "";
      if (mode === "main") {
        if (v.routing) {
          v = await submitVoucher(v.id, v.rowVersion);
          toast(`${v.docNo} sent for approval · ${v.routing?.workflow.name ?? v.approval?.workflow.name ?? ""}${extra}`, { tone: "good" });
        } else if (can.post) {
          v = await postVoucher(v.id, v.rowVersion);
          toast(`${v.docNo} posted · Rs ${fmt(v.totalDebit)}${extra}`, { tone: "good" });
        } else {
          toast(`${v.docNo} saved as draft — you can't post vouchers${extra}`, { tone: "info" });
        }
      } else toast(`${v.docNo} saved as draft${extra}`, { tone: "good" });
      if (mode === "new") {
        setVoucher(null);
        setForm({ ...emptyForm(type, form.branchId), cashBankAccountId: firstBox(opts, type) });
        setLines(side ? [blank()] : [blank(), blank()]);
        setErrors({});
        setOpts(await voucherOptions());
        if (id) router.push(`/accounting/vouchers/new?type=${type}`);
      } else router.push(`/accounting/vouchers/${v.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.details) showErrors(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])), kept);
        toast(e.message, { tone: "danger" });
      } else toast("Couldn't save the voucher", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const importTemplate = async (tid: string) => {
    try {
      const t = (await listRecurring()).find((x) => x.id === tid);
      if (!t) return;
      if (t.voucherType !== type) setType(t.voucherType as VType);
      setForm((f) => (f ? { ...f, voucherType: t.voucherType as VType, narration: t.narration, branchId: t.branch.id, cashBankAccountId: t.cashBankAccount?.id ?? "", partyName: t.partyName ?? "" } : f));
      setLines(t.lines.map((l) => ({ key: newKey(), accountId: l.account.id, particulars: l.narration ?? "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", costCentreId: l.costCentre?.id ?? "" })));
      setErrors({});
      toast(`Lines imported from “${t.name}”`, { tone: "info" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't load the template", { tone: "danger" });
    }
  };

  const err = (k: string) => errors[k] || "";
  const amountKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Enter" && i === lines.length - 1) {
      e.preventDefault();
      addLine();
    }
  };
  const mainLabel = routing || !can.post ? "Save & Submit" : "Save & Post";
  const mainIcon = routing ? <GitBranch /> : <CircleCheck />;
  const templates = opts.templates.filter((t) => t.voucherType === type || !side);

  return (
    <div className="pd-scr pd-vn" data-mode={side ? "one" : "dual"}>
      <div className="pd-vn-head">
        <Link className="pd-back" href="/accounting/vouchers" aria-label="Back to register"><ArrowLeft /></Link>
        <div className="pd-vn-title">
          <nav className="pd-crumb"><Link href="/accounting/vouchers">Vouchers</Link><ChevronRight /><b>{voucher ? voucher.docNo : "New"}</b></nav>
          <h1>{voucher ? "Edit Voucher" : "New Voucher"}</h1>
          <p>{cfg.sub}</p>
        </div>
        <div className="pd-vtiles" role="tablist" aria-label="Voucher type">
          {TYPES.map((t) => {
            const Icon = VT[t].icon;
            return (
              <button key={t} type="button" role="tab" aria-selected={t === type} className={cn(t === type && "on")} onClick={() => setType(t)}>
                <Icon /><b>{VT[t].tile}</b><small>{VT[t].small}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel pd-card">
        <div className="pd-sec-h">
          <span className="icon-tile"><FilePenLine /></span>
          <span className="pd-sec-t"><b>Voucher Details</b><small>Basic information about this voucher</small></span>
          <span className="pd-autono" title={voucher ? "Voucher number" : "Next number in this series (assigned when saved)"}>
            {voucher ? "Voucher no." : "Auto number"}: <b>{number}</b>
            <button type="button" aria-label="Numbering settings" title="Numbering settings" onClick={() => router.push("/settings")}><Hash /></button>
          </span>
        </div>
        <div className="pd-fgrid c4">
          <F label="Voucher Date" req error={err("docDate")}>
            <div className="pd-inp-ic"><Calendar /><input type="date" value={form.docDate} onChange={(e) => set("docDate", e.target.value)} /></div>
          </F>
          <F label="Posting Date" req error={err("postingDate")} hint={
            <span className="pd-period">{period ? <>Period <b>{period.code}</b> <span className={cn("badge", period.status === "OPEN" ? "green" : "red")}>{period.status.toLowerCase()}</span></> : <span className="badge red">no fiscal period</span>}</span>
          }>
            <div className="pd-inp-ic"><CalendarCheck /><input type="date" value={form.postingDate} onChange={(e) => set("postingDate", e.target.value)} /></div>
          </F>
          <F label="Voucher Type" req>
            <div className="pd-inp-ic"><Shapes /><select value={type} onChange={(e) => setType(e.target.value as VType)}>{TYPES.map((t) => <option key={t} value={t}>{VT[t].name}</option>)}</select></div>
          </F>
          <F label="Reference No." error={err("referenceNo")}>
            <div className="pd-inp-ic"><Hash /><input value={form.referenceNo} maxLength={60} placeholder="e.g. INV-1024" onChange={(e) => set("referenceNo", e.target.value)} /></div>
          </F>
          <F label="Branch" req error={err("branchId")}>
            <div className="pd-inp-ic"><Building2 /><select value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>{opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          </F>
          <F label="Department" error={err("department")}>
            <div className="pd-inp-ic"><Users /><input value={form.department} maxLength={60} placeholder="e.g. Finance" onChange={(e) => set("department", e.target.value)} /></div>
          </F>
          <F label="Prepared By">
            <div className="pd-inp-ic"><UserRound /><input value={voucher?.preparedBy?.name ?? "You"} readOnly /></div>
          </F>
          <F label="Approval">
            <div className="pd-inp-ic"><UserCheck /><input readOnly value={routing ? `${routing.workflow.name} · ${routing.steps.filter((s) => s.state !== "skipped").length} step(s)` : voucher ? "Not required — post directly" : "Checked when saved"} /></div>
          </F>
        </div>

        <TypePanel type={type} form={form} set={set} err={err} boxList={boxList} />

        <F label="Narration" req error={err("narration")} className="pd-narr">
          <div className="pd-inp-ic top"><AlignLeft /><textarea rows={2} maxLength={300} placeholder="Briefly describe this voucher…" value={form.narration} onChange={(e) => set("narration", e.target.value)} /></div>
          <small className="pd-count">{form.narration.length}/300</small>
        </F>
      </div>

      <div className="panel pd-card flushx">
        <div className="pd-sec-h">
          <span className="icon-tile"><ListOrdered /></span>
          <span className="pd-sec-t"><b>Voucher Entries</b><small>{err("lines") || cfg.esub}</small></span>
          <div className="pd-sec-act">
            <button type="button" className="btn secondary" disabled={!templates.length} title={templates.length ? undefined : "No saved templates yet"}
              onClick={(e) => setMenu({ anchor: e.currentTarget, items: templates.map((t) => ({ label: `${t.name} · ${t.voucherType}`, icon: <LayoutTemplate />, onClick: () => void importTemplate(t.id) })) })}>
              <LayoutTemplate />Import from template<ChevronDown />
            </button>
            <button type="button" className="btn secondary" onClick={() => addLine(3)}><ListPlus />Add multiple lines</button>
            <button type="button" className="btn primary" onClick={() => addLine()}><Plus />Add line</button>
          </div>
        </div>
        <div className="table-wrap pd-gridwrap">
          <table className="tbl lines pd-lines pd-vn-t" data-plain>
            <thead>
              <tr>
                <th className="pd-hd" /><th>#</th><th className="pd-prod">Account</th><th>Code</th><th>Description / Narration</th>
                {side ? <th className="num">{side === "DEBIT" ? "Debit (PKR)" : "Credit (PKR)"}</th> : <><th className="num">Debit (PKR)</th><th className="num">Credit (PKR)</th></>}
                <th>Cost Centre</th><th className="pd-act-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr className="pd-empty"><td colSpan={10}><div><span className="icon-well"><ListPlus /></span><b>No lines yet</b><small>Add a line or import from a template.</small></div></td></tr>
              )}
              {lines.map((l, i) => {
                const acc = byId.get(l.accountId);
                const amtKey = side === "CREDIT" ? "credit" : "debit";
                return (
                  <tr key={l.key} data-key={l.key} draggable={drag === l.key} className={cn(drag === l.key && "pd-dragging")}
                    onDragOver={(e) => { if (drag) { e.preventDefault(); moveLine(drag, l.key); } }} onDragEnd={() => setDrag(null)}>
                    <td className="pd-hd"><span className="pd-grip" title="Drag to reorder" onMouseDown={() => setDrag(l.key)} onMouseUp={() => setDrag(null)}><GripVertical /></span></td>
                    <td className="pd-idx">{i + 1}</td>
                    <td className="pd-prod">
                      <AccountInput value={acc ? label(acc) : ""} list={lineAccounts} byLabel={byLabel} invalid={!!err(`lines.${i}.accountId`)} title={err(`lines.${i}.accountId`)}
                        onPick={(aid) => { setLine(l.key, { accountId: aid }); clearLineError(i, "accountId"); }} />
                    </td>
                    <td className="pd-code"><input value={acc?.code ?? ""} readOnly tabIndex={-1} placeholder="auto" /></td>
                    <td className="pd-desc"><input value={l.particulars} maxLength={200} placeholder="Line description" onChange={(e) => setLine(l.key, { particulars: e.target.value })} /></td>
                    {side ? (
                      <td className="pd-sm2">
                        <input className={cn("num", err(`lines.${i}.${amtKey}`) && "pd-bad")} title={err(`lines.${i}.${amtKey}`)} inputMode="decimal" placeholder="0.00"
                          value={side === "DEBIT" ? l.debit || l.credit : l.credit || l.debit} onKeyDown={(e) => amountKeyDown(e, i)}
                          onChange={(e) => { setLine(l.key, side === "DEBIT" ? { debit: e.target.value, credit: "" } : { credit: e.target.value, debit: "" }); clearLineError(i, amtKey); }} />
                      </td>
                    ) : (
                      <>
                        <td className="pd-sm2">
                          <input className={cn("num", err(`lines.${i}.debit`) && "pd-bad")} title={err(`lines.${i}.debit`)} inputMode="decimal" placeholder="0.00" value={l.debit}
                            onChange={(e) => { setLine(l.key, { debit: e.target.value, ...(num(e.target.value) ? { credit: "" } : {}) }); clearLineError(i, "debit"); }} />
                        </td>
                        <td className="pd-sm2">
                          <input className={cn("num", err(`lines.${i}.credit`) && "pd-bad")} title={err(`lines.${i}.credit`)} inputMode="decimal" placeholder="0.00" value={l.credit} onKeyDown={(e) => amountKeyDown(e, i)}
                            onChange={(e) => { setLine(l.key, { credit: e.target.value, ...(num(e.target.value) ? { debit: "" } : {}) }); clearLineError(i, "credit"); }} />
                        </td>
                      </>
                    )}
                    <td className="pd-sm2">
                      <select value={l.costCentreId} onChange={(e) => setLine(l.key, { costCentreId: e.target.value })} aria-label="Cost centre" className={cn(err(`lines.${i}.costCentreId`) && "pd-bad")}>
                        <option value="">—</option>
                        {opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="pd-act">
                      <button type="button" className="pd-icb" aria-label="Duplicate line" onClick={() => duplicateLine(l.key)}><Copy /></button>
                      <button type="button" className="pd-icb danger" aria-label="Delete line" onClick={() => removeLine(l.key)}><Trash2 /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {side && (
              <tbody>
                <tr className="pd-contra">
                  <td className="pd-hd"><span className="pd-lock"><Lock /></span></td>
                  <td className="pd-idx">↳</td>
                  <td className="pd-prod"><b>{boxList.find((a) => a.accountId === form.cashBankAccountId)?.name ?? `Select the ${cfg.box} account above`}</b></td>
                  <td className="pd-code"><span>{byId.get(form.cashBankAccountId)?.code ?? "—"}</span></td>
                  <td><span className="muted">Auto contra — balancing {cfg.box} {side === "DEBIT" ? "credit" : "debit"}</span></td>
                  <td className="num"><b>{fmt(side === "DEBIT" ? totals.dr : totals.cr)}</b></td>
                  <td><span className="badge lime">Auto</span></td>
                  <td />
                </tr>
              </tbody>
            )}
          </table>
        </div>
        <div className="pd-vn-under">
          <button type="button" className="btn ghost sm" onClick={() => addLine()}><Plus />Add another line</button>
          <span className="spacer" />
          <div className={cn("pd-totbar", totals.ok && "ok")}>
            <div><small>Total Debit</small><b>Rs {fmt(totals.dr)}</b></div>
            <div><small>Total Credit</small><b>Rs {fmt(totals.cr)}</b></div>
            <div className={cn("pd-balance", totals.ok ? "ok" : totals.started && "bad")} role="status">
              <span className="pd-bal-ic"><Check /><Scale /></span>
              <div><b>{totals.ok ? "Balanced" : "Unbalanced"}</b><small>{totals.why}</small></div>
            </div>
          </div>
        </div>
      </div>

      <div className="pd-vn-2">
        <div className="panel pd-card">
          <div className="pd-sec-h nob"><span className="icon-tile"><Paperclip /></span><span className="pd-sec-t"><b>Attachments</b><small>Bills, receipts and approvals</small></span></div>
          <div className="pd-drop off" aria-disabled>
            <span className="pd-drop-ic"><CloudUpload /></span>
            <b>Attachments arrive with document storage</b>
            <small>Keep the bill or receipt reference in Reference No. for now</small>
          </div>
        </div>
        <div className="panel pd-card">
          <div className="pd-sec-h nob"><span className="icon-tile"><Info /></span><span className="pd-sec-t"><b>Additional Information</b><small>Tags and internal comments</small></span></div>
          <div className="pd-fgrid c2">
            <div className="pd-f">
              <span>Tags</span>
              <div className="pd-tags" onClick={(e) => e.currentTarget.querySelector("input")?.focus()}>
                {form.tags.map((t) => (
                  <span key={t} className="pd-tag">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", form.tags.filter((x) => x !== t))}>×</button></span>
                ))}
                <input value={tagDraft} placeholder={form.tags.length ? "" : "Add tag and press Enter"} maxLength={30} onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    const t = tagDraft.trim();
                    if ((e.key === "Enter" || e.key === ",") && t) {
                      e.preventDefault();
                      if (!form.tags.includes(t) && form.tags.length < 20) set("tags", [...form.tags, t]);
                      setTagDraft("");
                    } else if (e.key === "Backspace" && !tagDraft && form.tags.length) set("tags", form.tags.slice(0, -1));
                  }} />
              </div>
            </div>
            <F label="Comments" error={err("remarks")}>
              <textarea rows={3} maxLength={500} placeholder="Any additional notes…" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </F>
          </div>
        </div>
      </div>

      <div className="pd-actbar">
        <label className="switch" title={TEMPLATE_TYPES.includes(type) ? undefined : "Templates are available for journal, cash payment and bank payment vouchers"}>
          <input type="checkbox" checked={asTemplate} disabled={!can.template || !TEMPLATE_TYPES.includes(type)} onChange={(e) => setAsTemplate(e.target.checked)} />
          <i /><span>Save as template<small>Reuse this voucher format later</small></span>
        </label>
        {routing && <span className="pd-route"><GitBranch />Needs approval · <b>{routing.workflow.name}</b></span>}
        <span className="spacer" />
        <Link className="btn ghost" href={voucher ? `/accounting/vouchers/${voucher.id}` : "/accounting/vouchers"}>Cancel</Link>
        <button type="button" className={cn("btn secondary", busy === "draft" && "pd-busy")} disabled={!!busy} onClick={() => void save("draft")}><Save />Save Draft</button>
        <div className="pd-split">
          <button type="button" className={cn("btn primary", busy === "main" && "pd-busy")} disabled={!totals.ok || !!busy} onClick={() => void save("main")}>
            {mainIcon}<span>{mainLabel}</span>
          </button>
          <button type="button" className="btn primary icon" aria-label="More save options" disabled={!!busy}
            onClick={(e) => setMenu({
              anchor: e.currentTarget,
              items: [
                { label: routing ? "Save & submit for approval" : can.post ? "Save & post" : "Save & submit", icon: mainIcon, disabled: !totals.ok, onClick: () => void save("main") },
                { label: "Save draft & start another", icon: <Plus />, onClick: () => void save("new") },
              ],
            })}>
            <ChevronDown />
          </button>
        </div>
      </div>
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Template `.pd-f` field with its error message. */
function F({ label, req, error, hint, className, children }: { label: string; req?: boolean; error?: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cn("pd-f", error && "pd-invalid", className)}>
      <span>{label}{req && <em>*</em>}</span>
      {children}
      {error ? <small className="pd-err">{error}</small> : hint}
    </label>
  );
}

/** Searchable account picker: type a code or a name; the datalist narrows as you type. */
function AccountInput({ value, list, byLabel, invalid, title, onPick }: {
  value: string; list: GlOptions["accounts"]; byLabel: Map<string, GlOptions["accounts"][number]>; invalid: boolean; title: string; onPick: (id: string) => void;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(value);
  }
  const listId = `acc-${list.length}-${list[0]?.id ?? "none"}`;
  return (
    <>
      <input data-k="acc" className={cn(invalid && "pd-bad")} title={title || undefined} list={listId} value={text} placeholder="Select account…" autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          const a = byLabel.get(e.target.value) ?? list.find((x) => x.code === e.target.value.trim());
          if (a) onPick(a.id);
        }}
        onBlur={() => {
          const a = byLabel.get(text) ?? list.find((x) => x.code === text.trim() || x.name.toLowerCase() === text.trim().toLowerCase());
          if (a) { setText(label(a)); onPick(a.id); }
          else if (!text.trim()) onPick("");
          else setText(value);
        }} />
      <datalist id={listId}>{list.map((a) => <option key={a.id} value={label(a)} />)}</datalist>
    </>
  );
}

/** The panel that changes with the voucher type (template vnMorph). */
function TypePanel({ type, form, set, err, boxList }: {
  type: VType; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; err: (k: string) => string; boxList: GlOptions["cashAccounts"];
}) {
  const cfg = VT[type];
  const side = ONE_SIDED[type];
  if (side && cfg.box) {
    const bank = cfg.box === "bank";
    return (
      <div className="pd-morph"><div className="pd-morph-in">
        <div className={cn("pd-morph-card", cfg.box)}>
          <div className="pd-morph-h">
            <span className={cn("icon-tile", bank ? "blue" : "lime")}>{bank ? <Landmark /> : <Banknote />}</span>
            <div><b>{bank ? "Bank account" : "Cash account"}</b><small>{side === "DEBIT" ? "Money goes out of this account" : "Money comes into this account"}</small></div>
          </div>
          <div className={cn("pd-fgrid", bank ? "c4" : "c2")}>
            <F label={bank ? "Bank account" : "Cash account"} req error={err("cashBankAccountId")}>
              <select value={form.cashBankAccountId} onChange={(e) => set("cashBankAccountId", e.target.value)}>
                <option value="">{boxList.length ? `Select the ${cfg.box} account…` : `No ${cfg.box} accounts linked to the ledger`}</option>
                {boxList.map((a) => <option key={a.accountId} value={a.accountId}>{a.name} · {a.code}</option>)}
              </select>
            </F>
            {bank && (
              <>
                <F label="Instrument type" error={err("instrumentType")}>
                  <select value={form.instrumentType} onChange={(e) => set("instrumentType", e.target.value)}>
                    <option value="">—</option>
                    {INSTRUMENTS[side].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </F>
                <F label="Cheque / Ref No." error={err("instrumentNo")}>
                  <input value={form.instrumentNo} maxLength={40} placeholder="e.g. 00458921" onChange={(e) => set("instrumentNo", e.target.value)} />
                </F>
                <F label="Cheque Date" error={err("instrumentDate")}>
                  <input type="date" value={form.instrumentDate} onChange={(e) => set("instrumentDate", e.target.value)} />
                </F>
              </>
            )}
            <F label={cfg.party ?? "Party"} error={err("partyName")} className={cn(bank && "span-2")}>
              <div className="pd-inp-ic"><UserRound /><input value={form.partyName} maxLength={120} placeholder={side === "DEBIT" ? "Who is being paid?" : "Who paid us?"} onChange={(e) => set("partyName", e.target.value)} /></div>
            </F>
            {bank && (
              <div className="pd-f span-2 pd-inst-note"><span>&nbsp;</span>
                <small><Info /> {side === "DEBIT" ? "WHT u/s 153 on services/goods should be posted as a separate line." : "Receipts clear into the bank on the value date shown on the statement."}</small>
              </div>
            )}
          </div>
        </div>
      </div></div>
    );
  }
  if (type === "JV") {
    return (
      <div className="pd-morph"><div className="pd-morph-in">
        <div className="pd-morph-card jv">
          <div className="pd-morph-h">
            <span className="icon-tile violet"><NotebookPen /></span>
            <div><b>Free-form journal</b><small>Debit and credit any account in any combination.</small></div>
          </div>
          <div className="row" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <label className="switch">
              <input type="checkbox" checked={form.autoReverse} onChange={(e) => set("autoReverse", e.target.checked)} /><i />
              <span>Auto-reverse{form.autoReverse ? " on" : " (accruals)"}</span>
            </label>
            {form.autoReverse && (
              <label className={cn("pd-f", err("autoReverseOn") && "pd-invalid")} style={{ minWidth: 180 }}>
                <input type="date" aria-label="Auto-reverse date" value={form.autoReverseOn} onChange={(e) => set("autoReverseOn", e.target.value)} />
                {err("autoReverseOn") && <small className="pd-err">{err("autoReverseOn")}</small>}
              </label>
            )}
            <span className="muted" style={{ fontSize: 12 }}>For a schedule, use Recurring Templates.</span>
          </div>
        </div>
      </div></div>
    );
  }
  return (
    <div className="pd-morph"><div className="pd-morph-in">
      <div className="pd-morph-card">
        <div className="pd-morph-h">
          <span className="icon-tile blue"><ArrowLeftRight /></span>
          <div><b>Contra entry</b><small>Only cash and bank accounts are available on the lines.</small></div>
        </div>
      </div>
    </div></div>
  );
}

function EditorSkeleton() {
  return (
    <div className="pd-scr pd-vn" aria-busy>
      <div className="pd-vn-head"><Skeleton style={{ height: 64, flex: 1 }} /></div>
      <div className="panel pd-card"><Skeleton style={{ height: 220 }} /></div>
      <div className="panel pd-card"><Skeleton style={{ height: 260 }} /></div>
    </div>
  );
}
