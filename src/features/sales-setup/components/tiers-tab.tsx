"use client";

import { History, Layers, Pencil } from "lucide-react";
import { useState } from "react";
import type { PriceTier } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { updatePriceTier } from "../api";
import { fmt, type Can } from "./common";

const TONE: Record<string, string> = { RETAILER: "neutral", WHOLESALER: "info", DISTRIBUTOR: "violet" };

/** Added tab "Price tiers" (decided for Phase 9): the three wholesale tiers and their rate factors, edited in a modal. */
export function TiersTab({ tiers, loading, can, onChanged }: { tiers: PriceTier[]; loading: boolean; can: Can; onChanged: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState<PriceTier | null>(null);
  const [history, setHistory] = useState(false);
  const [f, setF] = useState({ name: "", factor: "", rank: "", isActive: true });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const open = (t: PriceTier) => { setEdit(t); setHistory(false); setErrs({}); setF({ name: t.name, factor: String(Math.round(t.rateFactor * 10000) / 100), rank: String(t.allocationRank), isActive: t.isActive }); };
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setErrs({});
    try {
      await updatePriceTier(edit.id, { name: f.name, rateFactor: Number(f.factor) / 100, allocationRank: f.rank, isActive: f.isActive, rowVersion: edit.rowVersion });
      toast(`${f.name} saved`, { tone: "good" });
      setEdit(null);
      onChanged();
    } catch (e) {
      const fe = apiFieldErrors(e);
      setErrs({ ...fe, factor: fe.rateFactor ?? "", rank: fe.allocationRank ?? "" });
      toast(apiMessage(e, "Could not save the tier"), { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Price tiers</h3><p>Shops on a tier pay the wholesale price × the tier&apos;s rate. Used by order booking and route shops (wholesale phases).</p></div></div>
      <div className="table-wrap">
        <table className="tbl"><thead><tr><th>Tier</th><th className="num">Rate</th><th className="num">On a Rs 1,000 wholesale price</th><th className="num">Allocation rank</th><th>Status</th><th>Last changed</th><th /></tr></thead>
          <tbody>
            {loading && !tiers.length ? <tr><td colSpan={7}><Skeleton style={{ height: 90 }} /></td></tr> : tiers.map((t) => (
              <tr key={t.id}>
                <td><div className="cell-user"><span className={cn("icon-tile", t.code === "DISTRIBUTOR" ? "violet" : t.code === "WHOLESALER" ? "blue" : "green")}><Layers /></span><div><b>{t.name}</b><small><span className={cn("badge", TONE[t.code] ?? "neutral")}>{t.code}</span></small></div></div></td>
                <td className="num"><b>{fmt(t.rateFactor * 100, t.rateFactor * 100 % 1 ? 2 : 0)}%</b></td>
                <td className="num">Rs {fmt(1000 * t.rateFactor, 2)}</td>
                <td className="num">{t.allocationRank}</td>
                <td><span className={cn("badge dot", t.isActive ? "good" : "neutral")}>{t.isActive ? "Active" : "Inactive"}</span></td>
                <td>{new Date(t.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Open ${t.name}`} onClick={() => open(t)}>{can.tiersEdit ? <Pencil /> : <History />}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ""} subtitle={`${edit?.code} · price tier`}
        foot={history ? <button type="button" className="btn secondary" onClick={() => setHistory(false)}><Pencil />Back</button> : <>
          <button type="button" className="btn ghost" onClick={() => setHistory(true)}><History />History</button><span className="spacer" />
          <button type="button" className="btn secondary" onClick={() => setEdit(null)}>{can.tiersEdit ? "Cancel" : "Close"}</button>
          {can.tiersEdit && <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>}
        </>}>
        {edit && (history ? <HistoryTab schema="Distribution" table="PriceTiers" id={edit.id} /> : (
          <FormGrid>
            <Field label="Name" required error={errs.name}><input value={f.name} maxLength={40} disabled={!can.tiersEdit} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
            <Field label="Rate (% of wholesale price)" required error={errs.factor} hint="100 = wholesale price; up to 200"><input inputMode="decimal" value={f.factor} disabled={!can.tiersEdit} onChange={(e) => setF((x) => ({ ...x, factor: e.target.value }))} /></Field>
            <Field label="Allocation rank" error={errs.rank} hint="Order for scarce stock; 1 is served first"><input inputMode="numeric" value={f.rank} disabled={!can.tiersEdit} onChange={(e) => setF((x) => ({ ...x, rank: e.target.value }))} /></Field>
            <Check label="Active" checked={f.isActive} disabled={!can.tiersEdit} onChange={(e) => setF((x) => ({ ...x, isActive: e.target.checked }))} />
          </FormGrid>
        ))}
      </Modal>
    </div>
  );
}
