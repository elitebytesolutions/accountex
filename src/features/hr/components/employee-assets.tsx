"use client";

import { Car, CreditCard, KeyRound, Laptop, Package, Plus, Smartphone, Undo2, Wrench } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { EMPLOYEE_ASSET_CATEGORIES, EMPLOYEE_ASSET_CONDITIONS, type EmployeeAssetItem, type EmployeeAssetOptions } from "@/shared";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { employeeAssetOptions, employeeAssets, issueEmployeeAsset, returnEmployeeAsset } from "../exits-api";
import { localToday } from "./attendance-ui";

const ICON: Record<string, ReactNode> = { LAPTOP: <Laptop />, MOBILE: <Smartphone />, SIM: <Smartphone />, ACCESS_CARD: <KeyRound />, FUEL_CARD: <CreditCard />, VEHICLE: <Car />, TOOL: <Wrench /> };
const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
type IssueForm = { category: string; assetId: string; assetName: string; specification: string; tag: string; serialNo: string; issuedOn: string; condition: string; valueAmount: string; remarks: string };
const blank = (): IssueForm => ({ category: "LAPTOP", assetId: "", assetName: "", specification: "", tag: "", serialNo: "", issuedOn: localToday(), condition: "GOOD", valueAmount: "", remarks: "" });

/** Template employee view › Assets pane (50-hr-core.html): assigned assets, assign and return (returns clear the exit's clearance item). */
export function EmployeeAssetsPane({ employeeId, canEdit, exited }: { employeeId: string; canEdit: boolean; exited: boolean }) {
  const toast = useToast();
  const lookups = useLookups(["EmployeeAssetCategory", "Condition", "EmployeeAssetStatus"]);
  const L = (t: string, c: string | null) => (c ? labelOf(lookups, t, c) || humanize(c) : "—");
  const [items, setItems] = useState<EmployeeAssetItem[] | null>(null);
  const [opts, setOpts] = useState<EmployeeAssetOptions | null>(null);
  const [issue, setIssue] = useState<IssueForm | null>(null);
  const [ret, setRet] = useState<{ item: EmployeeAssetItem; returnedOn: string; condition: string; remarks: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    employeeAssets(employeeId).then((x) => !cancelled && setItems(x)).catch((e: unknown) => { if (!cancelled) { setItems([]); toast(apiMessage(e, "Could not load assets"), { tone: "danger" }); } });
    return () => { cancelled = true; };
  }, [employeeId, attempt, toast]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const act = async (work: () => Promise<unknown>, done: string, after: () => void) => {
    setBusy(true); setErrs({});
    try { await work(); toast(done, { tone: "good" }); after(); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const issued = items?.filter((i) => i.status === "ISSUED") ?? [];
  const fa = opts?.fixedAssets.find((f) => f.id === issue?.assetId);

  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Assigned assets</h3><p>Returned at offboarding clearance{items ? ` · ${issued.length} issued` : ""}</p></div>
        {canEdit && !exited && <div className="panel-actions"><button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setIssue(blank()); if (!opts) employeeAssetOptions().then(setOpts).catch(() => setOpts({ fixedAssets: [] })); }}><Plus />Assign asset</button></div>}</div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Asset</th><th>Tag</th><th>Serial</th><th>Issued</th><th>Condition</th><th className="num">Value (Rs)</th><th>Status</th><th /></tr></thead>
        <tbody>
          {!items ? <tr><td colSpan={8}><Skeleton style={{ height: 80 }} /></td></tr> : items.length ? items.map((a) => (
            <tr key={a.id}>
              <td><div className="cell-user"><span className="icon-well">{ICON[a.category] ?? <Package />}</span><div><b>{a.assetName}</b><small>{a.specification ?? L("EmployeeAssetCategory", a.category)}</small></div></div></td>
              <td>{a.fixedAsset ? <Link className="link" href={`/assets/${a.fixedAsset.id}`}>{a.tag ?? a.fixedAsset.code}</Link> : a.tag ?? "—"}</td>
              <td>{a.serialNo ?? "—"}</td>
              <td className="nowrap">{dateLabel(a.issuedOn)}{a.returnedOn && <small>returned {dateLabel(a.returnedOn)}</small>}</td>
              <td><span className={`badge ${toneOf(lookups, "Condition", a.condition ?? "") || "neutral"}`}>{L("Condition", a.condition)}</span></td>
              <td className={`num ${a.valueAmount ? "" : "zero"}`}>{a.valueAmount ? a.valueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
              <td><span className={`badge ${toneOf(lookups, "EmployeeAssetStatus", a.status) || "neutral"}`}>{L("EmployeeAssetStatus", a.status)}</span>{a.clearance && <small>{a.clearance.status === "PENDING" ? "Exit clearance pending" : "Exit clearance cleared"}</small>}</td>
              <td className="actions">{canEdit && a.status === "ISSUED" && <button className="btn sm secondary" type="button" disabled={busy} onClick={() => { setErrs({}); setRet({ item: a, returnedOn: localToday(), condition: a.condition ?? "GOOD", remarks: "" }); }}><Undo2 />Return</button>}</td>
            </tr>
          )) : <tr><td colSpan={8}><EmptyState icon={<Laptop />} title="No assets assigned" description={canEdit && !exited ? "Assign laptops, phones, SIMs, cards or vehicles; they are collected at exit clearance." : "Company assets issued to the employee appear here."} /></td></tr>}
        </tbody>
      </table></div>

      <Modal open={!!issue} onClose={() => setIssue(null)} title="Assign asset" subtitle="Link a fixed asset (one holder at a time) or describe the item."
        foot={<><button className="btn secondary" type="button" onClick={() => setIssue(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || (!issue?.assetId && !issue?.assetName.trim())}
          onClick={() => issue && act(() => issueEmployeeAsset(employeeId, { ...issue, assetId: issue.assetId || null, assetName: issue.assetName || null, specification: issue.specification || null, tag: issue.tag || null, serialNo: issue.serialNo || null, valueAmount: issue.valueAmount === "" ? null : Number(issue.valueAmount), remarks: issue.remarks || null }), "Asset assigned", () => setIssue(null))}>Assign</button></>}>
        {issue && <div className="form-grid">
          <Field label="Category" required error={errs.category}><select value={issue.category} onChange={(e) => setIssue({ ...issue, category: e.target.value })}>{EMPLOYEE_ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{L("EmployeeAssetCategory", c)}</option>)}</select></Field>
          <Field label="Fixed asset" error={errs.assetId} hint={fa?.issuedTo ? `Issued to ${fa.issuedTo}` : "Optional"}><select value={issue.assetId} onChange={(e) => setIssue({ ...issue, assetId: e.target.value })}><option value="">Not in the asset register</option>{opts?.fixedAssets.map((f) => <option key={f.id} value={f.id} disabled={!!f.issuedTo}>{f.code} — {f.name}{f.issuedTo ? ` (with ${f.issuedTo})` : ""}</option>)}</select></Field>
          <Field label="Asset name" required={!issue.assetId} full error={errs.assetName}><input maxLength={120} placeholder={fa?.name ?? "Dell Latitude 5440"} value={issue.assetName} onChange={(e) => setIssue({ ...issue, assetName: e.target.value })} /></Field>
          <Field label="Specification" full error={errs.specification}><input maxLength={200} placeholder="i5 · 16 GB · 512 GB SSD" value={issue.specification} onChange={(e) => setIssue({ ...issue, specification: e.target.value })} /></Field>
          <Field label="Tag" error={errs.tag}><input maxLength={40} placeholder={fa?.code ?? "AC-1042"} value={issue.tag} onChange={(e) => setIssue({ ...issue, tag: e.target.value })} /></Field>
          <Field label="Serial no." error={errs.serialNo}><input maxLength={60} placeholder={fa?.serialNo ?? ""} value={issue.serialNo} onChange={(e) => setIssue({ ...issue, serialNo: e.target.value })} /></Field>
          <Field label="Issued on" required error={errs.issuedOn}><input type="date" value={issue.issuedOn} onChange={(e) => setIssue({ ...issue, issuedOn: e.target.value })} /></Field>
          <Field label="Condition" error={errs.condition}><select value={issue.condition} onChange={(e) => setIssue({ ...issue, condition: e.target.value })}>{EMPLOYEE_ASSET_CONDITIONS.filter((c) => c !== "LOST").map((c) => <option key={c} value={c}>{L("Condition", c)}</option>)}</select></Field>
          <Field label="Value (Rs)" error={errs.valueAmount}><input type="number" min={0} step="0.01" placeholder={fa ? String(fa.cost) : ""} value={issue.valueAmount} onChange={(e) => setIssue({ ...issue, valueAmount: e.target.value })} /></Field>
          <Field label="Remarks" full error={errs.remarks}><input maxLength={300} value={issue.remarks} onChange={(e) => setIssue({ ...issue, remarks: e.target.value })} /></Field>
        </div>}
      </Modal>

      <Modal open={!!ret} onClose={() => setRet(null)} title={`Return ${ret?.item.assetName ?? ""}`} subtitle="Clears the asset’s item on an open exit clearance."
        foot={<><button className="btn secondary" type="button" onClick={() => setRet(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy}
          onClick={() => ret && act(() => returnEmployeeAsset(ret.item.id, { returnedOn: ret.returnedOn, condition: ret.condition, remarks: ret.remarks || null, rowVersion: ret.item.rowVersion }), `${ret.item.assetName} returned`, () => setRet(null))}>Record return</button></>}>
        {ret && <div className="form-grid">
          <Field label="Returned on" required error={errs.returnedOn}><input type="date" min={ret.item.issuedOn} value={ret.returnedOn} onChange={(e) => setRet({ ...ret, returnedOn: e.target.value })} /></Field>
          <Field label="Condition" required error={errs.condition}><select value={ret.condition} onChange={(e) => setRet({ ...ret, condition: e.target.value })}>{EMPLOYEE_ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{L("Condition", c)}</option>)}</select></Field>
          <Field label="Remarks" full error={errs.remarks}><input maxLength={300} value={ret.remarks} onChange={(e) => setRet({ ...ret, remarks: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
