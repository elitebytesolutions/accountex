"use client";

import { Copy, History, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PriceList } from "@/shared";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { copyPriceList, createPriceList, deletePriceList, setPriceListActive, updatePriceList } from "../api";
import type { Can } from "./common";

type F = Record<string, string | boolean>;
const init = (l: PriceList | null): F => ({
  code: l?.code ?? "", name: l?.name ?? "", markupPct: l?.markupPct?.toString() ?? "", roundingTo: String(l?.roundingTo ?? 1), currencyCode: l?.currencyCode ?? "PKR",
  validFrom: l?.validFrom ?? "", validTo: l?.validTo ?? "", isDefault: l?.isDefault ?? false, remarks: l?.remarks ?? "", fill: "EMPTY", copyFromId: "",
});

/** The price list header (added: the template's "+" only toasts). Create (empty / copy / from markup), edit, activate, copy, delete, history. */
export function PriceListDrawer({ list, lists, can, onClose, onSaved, onDeleted }: {
  list: PriceList | null;
  lists: PriceList[];
  can: Can;
  onClose: () => void;
  onSaved: (l: PriceList) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<F>(() => init(list));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"form" | "history" | "copy">("form");
  const [copy, setCopy] = useState({ code: "", name: "" });
  const [confirm, setConfirm] = useState(false);
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const ro = !can.approve;

  const run = async (work: () => Promise<PriceList | void>, done: string) => {
    setBusy(true);
    setErrs({});
    try {
      const r = await work();
      toast(done, { tone: "good" });
      if (r) onSaved(r); else onDeleted();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the price list"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => {
    const body: Record<string, unknown> = { ...f };
    if (list) { delete body.fill; delete body.copyFromId; }
    if (!body.copyFromId) delete body.copyFromId;
    return run(() => (list ? updatePriceList(list.id, { ...body, rowVersion: list.rowVersion }) : createPriceList(body)), list ? `${s("name")} saved` : `${s("name")} created`);
  };

  return (
    <>
      <Drawer open onClose={onClose} title={list ? `${list.name}` : "New price list"} subtitle={list ? `${list.code} · ${list.status === "ACTIVE" ? "Active" : "Inactive"}` : "Channel pricing for a customer group or customer"}
        foot={mode === "copy" ? (
          <><button type="button" className="btn secondary" onClick={() => setMode("form")}>Back</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => run(() => copyPriceList(list!.id, copy), `${copy.name} created from ${list!.name}`)}><Copy />Copy list</button></>
        ) : mode === "history" ? (
          <button type="button" className="btn secondary" onClick={() => setMode("form")}><Pencil />Back to details</button>
        ) : (
          <>
            {list && <button type="button" className="btn ghost" onClick={() => setMode("history")}><History />History</button>}
            {list && can.remove && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
            <span className="spacer" />
            {list && can.approve && <button type="button" className="btn secondary" onClick={() => { setCopy({ code: `${list.code}-2`.slice(0, 20), name: `${list.name} (copy)` }); setMode("copy"); }}><Copy />Copy</button>}
            {list && can.approve && <button type="button" className="btn secondary" disabled={busy} onClick={() => run(() => setPriceListActive(list.id, list.status !== "ACTIVE", list.rowVersion), list.status === "ACTIVE" ? `${list.name} deactivated` : `${list.name} activated`)}>{list.status === "ACTIVE" ? <><PowerOff />Deactivate</> : <><Power />Activate</>}</button>}
            {can.approve && <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : list ? "Save" : "Create list"}</button>}
          </>
        )}>
        {mode === "history" && list ? <HistoryTab schema="Sales" table="PriceLists" id={list.id} /> : mode === "copy" ? (
          <FormGrid>
            <p className="muted full">A new list with the same markup, rounding and currency, and today&apos;s prices of {list?.name}.</p>
            <Field label="Code" required error={errs.code}><input value={copy.code} maxLength={20} onChange={(e) => setCopy((c) => ({ ...c, code: e.target.value.toUpperCase() }))} /></Field>
            <Field label="Name" required error={errs.name}><input value={copy.name} maxLength={80} onChange={(e) => setCopy((c) => ({ ...c, name: e.target.value }))} /></Field>
          </FormGrid>
        ) : (
          <FormGrid>
            <Field label="Code" required error={errs.code} hint="Like PL-WHS"><input value={s("code")} maxLength={20} disabled={ro} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Name" required error={errs.name}><input value={s("name")} maxLength={80} disabled={ro} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Markup on cost (%)" error={errs.markupPct} hint="Used by “Apply to all”"><input inputMode="decimal" value={s("markupPct")} disabled={ro} onChange={(e) => set("markupPct", e.target.value)} /></Field>
            <Field label="Round prices to (Rs)" error={errs.roundingTo}><input inputMode="decimal" value={s("roundingTo")} disabled={ro} onChange={(e) => set("roundingTo", e.target.value)} /></Field>
            <Field label="Valid from" error={errs.validFrom}><input type="date" value={s("validFrom")} disabled={ro} onChange={(e) => set("validFrom", e.target.value)} /></Field>
            <Field label="Valid to" error={errs.validTo}><input type="date" value={s("validTo")} disabled={ro} onChange={(e) => set("validTo", e.target.value)} /></Field>
            <Field label="Currency" error={errs.currencyCode}><input value={s("currencyCode")} maxLength={3} disabled={ro} onChange={(e) => set("currencyCode", e.target.value.toUpperCase())} /></Field>
            <Check label="Company default (customers without a list buy at it)" checked={Boolean(f.isDefault)} disabled={ro} onChange={(e) => set("isDefault", e.target.checked)} />
            <Field label="Remarks" full error={errs.remarks}><input value={s("remarks")} maxLength={300} disabled={ro} onChange={(e) => set("remarks", e.target.value)} /></Field>
            {!list && (
              <Field label="Start with" full error={errs.copyFromId || errs.fill}>
                <div className="seg">
                  {([["EMPTY", "No prices"], ["MARKUP", "Cost + markup"], ["COPY", "Copy a list"]] as const).map(([k, l]) => (
                    <button key={k} type="button" className={f.fill === k ? "active" : undefined} onClick={() => set("fill", k)}>{l}</button>
                  ))}
                </div>
              </Field>
            )}
            {!list && f.fill === "COPY" && (
              <Field label="List to copy" full error={errs.copyFromId}>
                <select value={s("copyFromId")} onChange={(e) => set("copyFromId", e.target.value)}><option value="">Choose…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select>
              </Field>
            )}
            {!list && f.fill === "MARKUP" && <p className="muted full">Every product with a purchase price gets cost × (1 + markup), rounded to the nearest Rs {s("roundingTo") || 1}, from today.</p>}
          </FormGrid>
        )}
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${list?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!list) return;
        setConfirm(false);
        await run(() => deletePriceList(list.id, list.rowVersion), `${list.name} deleted`);
      }}>Only lists no customer group, customer or document uses can be deleted; otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
