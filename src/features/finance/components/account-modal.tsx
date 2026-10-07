"use client";

import { Check, ChevronDown, FolderTree, Search } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { accountKindOf, isChildCode, nextChildCode, type Account, type LookupsResponse } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { createAccount, setAccountsStatus, updateAccount } from "../api";
import { AccountIcon, CLASS_UI, Hl, kindLabel } from "./finance-ui";

export type AccountModalMode = { edit: Account } | { parentId: string | null } | null;

/** Template coa-mdl-add (97-coa.js openAdd): add or edit an account with a searchable parent picker and derived code. */
export function AccountModal({ mode, accounts, retiredCodes, lookups, onClose, onSaved }: {
  mode: AccountModalMode;
  accounts: Account[];
  /** Codes of deleted accounts: never suggested, never reused. */
  retiredCodes: string[];
  lookups: LookupsResponse;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      wide
      title={mode && "edit" in mode ? "Edit account" : mode?.parentId ? "Add sub-account" : "Add account"}
      subtitle={mode && "edit" in mode ? `${mode.edit.code} · ${mode.edit.name}` : "Create a ledger account anywhere in the hierarchy"}
    >
      {mode && <AccountForm key={"edit" in mode ? mode.edit.id : (mode.parentId ?? "new")} mode={mode} accounts={accounts} retiredCodes={retiredCodes} lookups={lookups} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function AccountForm({ mode, accounts, retiredCodes, lookups, onClose, onSaved }: {
  mode: NonNullable<AccountModalMode>;
  accounts: Account[];
  retiredCodes: string[];
  lookups: LookupsResponse;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const edit = "edit" in mode ? mode.edit : null;
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const codes = useMemo(() => [...accounts.map((a) => a.code), ...retiredCodes], [accounts, retiredCodes]);
  const [parentId, setParentId] = useState<string | null>(edit ? edit.parentId : "parentId" in mode ? mode.parentId : null);
  const parent = parentId ? (byId.get(parentId) ?? null) : null;
  const level = edit ? edit.level : parent ? parent.level + 1 : 1;
  const cls = edit ? edit.accountClass : (parent?.accountClass ?? 1);
  const subTypes = (lookups.AccountSubType ?? []).filter((s) => !s.parentCodes || s.parentCodes.includes(String(cls)));
  const siblingSub = parent ? accounts.find((a) => a.parentId === parent.id && a.subType)?.subType : null;

  const [name, setName] = useState(edit?.name ?? "");
  const [code, setCode] = useState(edit?.code ?? (parent ? (nextChildCode(parent.code, codes) ?? "") : ""));
  const [codeTouched, setCodeTouched] = useState(false);
  const [subType, setSubType] = useState<string | null>(edit?.subType ?? siblingSub ?? null);
  const [nature, setNature] = useState(edit?.nature ?? (cls === 1 || cls === 5 ? "DR" : "CR"));
  const [status, setStatus] = useState(edit?.status ?? "ACTIVE");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [pickOpen, setPickOpen] = useState(false);
  const [pq, setPq] = useState("");
  const [kb, setKb] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const parents = accounts
    .filter((a) => a.level < 4 && (!pq || a.code.includes(pq) || a.name.toLowerCase().includes(pq.toLowerCase())))
    .sort((x, y) => (x.code < y.code ? -1 : 1));

  const pick = (a: Account) => {
    setParentId(a.id);
    setPickOpen(false);
    if (!codeTouched) setCode(nextChildCode(a.code, codes) ?? "");
    setNature(a.accountClass === 1 || a.accountClass === 5 ? "DR" : "CR");
    const sib = accounts.find((x) => x.parentId === a.id && x.subType)?.subType;
    setSubType(a.level + 1 === 4 ? (sib ?? (lookups.AccountSubType ?? []).find((s) => s.parentCodes?.includes(String(a.accountClass)))?.code ?? null) : null);
  };
  const pickKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? Math.min(parents.length - 1, kb + 1) : Math.max(0, kb - 1);
      setKb(n);
      listRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = parents[kb >= 0 ? kb : 0];
      if (a) pick(a);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setPickOpen(false);
    }
  };

  const path = (a: Account | null): string => {
    const out: string[] = [];
    for (let p = a; p; p = p.parentId ? (byId.get(p.parentId) ?? null) : null) out.unshift(p.name);
    return out.join(" › ");
  };
  const codeMsg = (() => {
    if (edit) return { ok: true, msg: "The code is fixed once an account exists" };
    const v = code.trim();
    if (!v) return { ok: false, msg: "Code is required" };
    const used = accounts.find((a) => a.code === v);
    if (used) return { ok: false, msg: `Code ${v} is already used by ${used.name}` };
    if (retiredCodes.includes(v)) return { ok: false, msg: `Code ${v} belonged to a deleted account; codes are never reused` };
    if (parent && !isChildCode(v, parent.code)) return { ok: false, msg: `Use a child code of ${parent.code}, e.g. ${nextChildCode(parent.code, codes) ?? "—"}` };
    return { ok: true, msg: "Next free code under the parent" };
  })();

  const save = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter an account name";
    if (!edit && !parent) e.parentId = "Pick a parent account";
    if (level === 4 && !subType) e.subType = "Choose the account type";
    setErrs(e);
    if (Object.keys(e).length || !codeMsg.ok) return;
    setBusy(true);
    try {
      let id: string;
      if (edit) {
        await updateAccount(edit.id, { name, description: description || null, subType: level === 4 ? subType : null, rowVersion: edit.rowVersion });
        if (status !== edit.status) await setAccountsStatus([edit.id], status as "ACTIVE" | "INACTIVE");
        id = edit.id;
        toast(`Saved changes to ${edit.code}`, { tone: "good" });
      } else {
        const a = await createAccount({ parentId: parent!.id, code: code.trim(), name, description: description || null, nature: nature as "DR" | "CR", subType: level === 4 ? subType : null });
        if (status === "INACTIVE") await setAccountsStatus([a.id], "INACTIVE");
        id = a.id;
        toast(`Account ${a.code} · ${a.name} created`, { tone: "good" });
      }
      onSaved(id);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrs(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? ""])));
      toast(err instanceof ApiError && err.code === "DB_UNIQUE_VIOLATION" ? "That code is already used" : err instanceof ApiError ? err.message : "Could not save", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const kind = kindLabel(accountKindOf(level));
  return (
    <>
      <div className="coa-form" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).matches("input:not([data-tsel-q])") && (e.preventDefault(), save())}>
        <label className={cn("full", errs.name && "err")}>
          <span className="l">Account name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bank Al Habib — 7781" autoComplete="off" autoFocus />
          {errs.name && <span className="hint err">{errs.name}</span>}
        </label>
        <div className="fld full">
          <span className="l">Parent account *<em>searchable</em></span>
          <div className={cn("coa-tsel", pickOpen && "open")}>
            <button type="button" className="coa-tsel-btn" disabled={!!edit} onClick={() => { setPickOpen((o) => !o); setPq(""); setKb(-1); }}>
              {parent ? <span>{parent.code} · {parent.name}</span> : <span className="ph">{edit ? "Top level" : "Select a parent…"}</span>}
              <ChevronDown />
            </button>
            <div className="coa-tsel-pop">
              <label className="coa-search">
                <Search />
                <input data-tsel-q value={pq} onChange={(e) => { setPq(e.target.value); setKb(-1); }} onKeyDown={pickKeys} placeholder="Search code or name…" aria-label="Search parent accounts" autoFocus={pickOpen} />
              </label>
              <div className="coa-tsel-list" role="listbox" ref={listRef}>
                {parents.length ? parents.map((a, i) => (
                  <button key={a.id} type="button" className={cn(CLASS_UI[a.accountClass]?.tone, a.id === parentId && "on", i === kb && "kb")} style={{ paddingLeft: 8 + (a.level - 1) * 16 }} onClick={() => pick(a)}>
                    <span className="ic"><AccountIcon account={a} /></span>
                    <code>{a.code}</code>
                    <Hl text={a.name} q={pq} />
                  </button>
                )) : <div className="none">No parent matches “{pq}”</div>}
              </div>
            </div>
          </div>
          {errs.parentId && <span className="hint err">{errs.parentId}</span>}
        </div>
        <div className="coa-derived">
          {parent || edit ? (
            <>
              <FolderTree /> Level <b>{level}</b> · <span className={cn("coa-kind", kind.toLowerCase())}>{kind}</span> · Class <b>{CLASS_UI[cls]?.name}</b> · Path{" "}
              <b>{path(parent) || "Top level"}</b>
            </>
          ) : "Pick a parent to derive the level, type and code."}
        </div>
        <label className={cn(!codeMsg.ok && "err")}>
          <span className="l">Account code *<em>auto-suggested</em></span>
          <input value={code} readOnly={!!edit} onChange={(e) => { setCode(e.target.value); setCodeTouched(true); }} className={cn(!codeMsg.ok && "err")} />
          <span className={cn("hint", !codeMsg.ok && "err")}>{errs.code ?? codeMsg.msg}</span>
        </label>
        <label className={cn(errs.subType && "err")}>
          <span className="l">Account type{level === 4 && " *"}</span>
          <select value={level === 4 ? (subType ?? "") : ""} disabled={level !== 4} onChange={(e) => setSubType(e.target.value || null)}>
            {level === 4 ? (
              <>
                {!subType && <option value="">Choose…</option>}
                {subTypes.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </>
            ) : <option value="">Not used for headers and groups</option>}
          </select>
          {errs.subType && <span className="hint err">{errs.subType}</span>}
        </label>
        <div className="fld">
          <span className="l">Nature</span>
          <div className="coa-nature">
            {(["DR", "CR"] as const).map((n) => (
              <button key={n} type="button" className={cn(nature === n && "on")} aria-pressed={nature === n} disabled={!!edit} onClick={() => setNature(n)}>
                {n === "DR" ? "Debit (Dr)" : "Credit (Cr)"}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="l">Opening balance (PKR)</span>
          <input type="number" placeholder="0.00" disabled />
          <span className="hint">Opening balances are posted with the opening entry (Phase 16)</span>
        </label>
        <label>
          <span className="l">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label>
          <span className="l">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>
          <Check />
          {busy ? "Saving…" : edit ? "Save changes" : "Create account"}
        </button>
      </div>
    </>
  );
}
