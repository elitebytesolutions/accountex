"use client";

import { Check, ChevronDown, EyeOff, GripVertical, History, Layers, Package, Pencil, Plus, RefreshCw, Search, Tag, Tags, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { CLASS_ICONS, type ProductClass, type ProductSubclass } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { addSubclass, createClass, deleteClass, deleteSubclass, listClasses, reorderSubclasses, updateClass, updateSubclass } from "../api";
import { NamedIcon } from "./named-icon";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Dialog =
  | { kind: "main"; row: ProductClass | null; name: string; icon: string; visible: boolean; history: boolean }
  | { kind: "sub"; parentId: string; name: string; visible: boolean }
  | { kind: "subHistory"; sub: ProductSubclass };
type Removing = { kind: "main"; row: ProductClass } | { kind: "sub"; row: ProductSubclass; parent: ProductClass };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Template app/inventory/classes (4B-products.html + 9F-products.js §4): class cards with their sub types, drag-to-reorder, add modal. */
export function ClassesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [rows, setRows] = useState<ProductClass[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [main, setMain] = useState("");
  const [vis, setVis] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [nameErr, setNameErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; classId: string } | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listClasses()
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setError(null);
        // The template opens the first two classes.
        setOpen((o) => (o.size ? o : new Set(r.slice(0, 2).map((c) => c.id))));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load classes" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const flashRow = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1700); };

  const all = useMemo(() => rows ?? [], [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = (x: { code: string; name: string }) => `${x.code} ${x.name}`.toLowerCase().includes(s);
    return all
      .map((c) => ({ c, subs: c.subclasses.filter((x) => (vis === "" || String(+x.isVisible) === vis || String(+c.isVisible) === vis) && (!s || hit(x) || hit(c))) }))
      .filter(({ c, subs }) => (!main || c.id === main) && (!s || hit(c) || subs.length) && (vis === "" || String(+c.isVisible) === vis || c.subclasses.some((x) => String(+x.isVisible) === vis)));
  }, [all, q, main, vis]);
  const subCount = all.reduce((n, c) => n + c.subclasses.length, 0);
  const hidden = all.filter((c) => !c.isVisible).length + all.reduce((n, c) => n + c.subclasses.filter((x) => !x.isVisible).length, 0);
  const classified = all.reduce((n, c) => n + c.productCount, 0);
  const mark = (text: string) => {
    const s = q.trim();
    const i = s ? text.toLowerCase().indexOf(s.toLowerCase()) : -1;
    return i < 0 ? text : <>{text.slice(0, i)}<mark>{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
  };

  const run = async (work: () => Promise<unknown>, done: string, fail: string) => {
    try {
      await work();
      if (done) toast(done, { tone: "good" });
      reload();
      return true;
    } catch (e) {
      toast(apiMessage(e, fail), { tone: "danger" });
      return false;
    }
  };
  const setClassVisible = (c: ProductClass, on: boolean) =>
    run(() => updateClass(c.id, { isVisible: on, rowVersion: c.rowVersion }), `${c.name} is now ${on ? "visible" : "hidden"}`, "Could not update");
  const setSubVisible = (s: ProductSubclass, on: boolean) => run(() => updateSubclass(s.id, { isVisible: on, rowVersion: s.rowVersion }), "", "Could not update");
  const saveRename = async (s: ProductSubclass) => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name || name === s.name) { setEditing(null); return; }
    if (await run(() => updateSubclass(s.id, { name, rowVersion: s.rowVersion }), `Renamed to ${name}`, "Could not rename")) { setEditing(null); flashRow(s.id); }
  };

  const saveDialog = async () => {
    if (!dialog || dialog.kind === "subHistory") return;
    const name = dialog.name.trim();
    if (!name) { setNameErr("Name is required"); return; }
    setBusy(true);
    setNameErr("");
    try {
      if (dialog.kind === "main") {
        const body = { name, icon: dialog.icon, isVisible: dialog.visible };
        const c = dialog.row ? await updateClass(dialog.row.id, { ...body, rowVersion: dialog.row.rowVersion }) : await createClass(body);
        setOpen((o) => new Set(o).add(c.id));
        flashRow(c.id);
        toast(`${c.code} · ${c.name} ${dialog.row ? "saved" : "added"}`, { tone: "good" });
      } else {
        const c = await addSubclass(dialog.parentId, { name, isVisible: dialog.visible });
        const s = c.subclasses.find((x) => x.name.toLowerCase() === name.toLowerCase());
        setOpen((o) => new Set(o).add(c.id));
        if (s) flashRow(s.id);
        toast(`${s?.code ?? "Sub type"} · ${name} added to ${c.name}`, { tone: "good" });
      }
      setDialog(null);
      reload();
    } catch (e) {
      setNameErr(apiFieldErrors(e).name ?? "");
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onDragStart = (e: DragEvent, c: ProductClass, s: ProductSubclass) => {
    setDrag({ id: s.id, classId: c.id });
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", s.id); } catch { /* some browsers refuse */ }
  };
  const onDragOver = (e: DragEvent<HTMLTableRowElement>, c: ProductClass, s: ProductSubclass) => {
    if (!drag || drag.classId !== c.id) return;
    e.preventDefault();
    const b = e.currentTarget.getBoundingClientRect();
    setDrop(s.id === drag.id ? null : { id: s.id, after: e.clientY > b.top + b.height / 2 });
  };
  const onDrop = async (e: DragEvent, c: ProductClass) => {
    e.preventDefault();
    const d = drag, target = drop;
    setDrag(null);
    setDrop(null);
    if (!d || !target || d.classId !== c.id) return;
    const ids = c.subclasses.map((x) => x.id).filter((id) => id !== d.id);
    let to = ids.indexOf(target.id);
    if (target.after) to++;
    ids.splice(to, 0, d.id);
    const moved = c.subclasses.find((x) => x.id === d.id)!;
    if (await run(() => reorderSubclasses(c.id, ids), `Order saved · ${moved.name} moved to position ${to + 1}`, "Could not save the order")) flashRow(d.id);
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const dlgMain = dialog?.kind === "main" ? dialog : null;

  return (
    <>
      <div className="pr-head">
        <span className="pr-cube"><Tag /></span>
        <div className="pr-head-t"><h1>Product Classes</h1><p>Manage main classes and their sub types. Drag sub types to reorder.</p></div>
        {can.create && (
          <div className="pr-head-act">
            <button className="btn secondary pr-soft" type="button" onClick={() => { setNameErr(""); setDialog({ kind: "main", row: null, name: "", icon: "package", visible: true, history: false }); }}><Plus />Add Main Class</button>
            <button className="btn primary" type="button" disabled={!all.length} onClick={() => { setNameErr(""); setDialog({ kind: "sub", parentId: [...open][0] ?? all[0]?.id ?? "", name: "", visible: true }); }}><Plus />Add Sub Type</button>
          </div>
        )}
      </div>
      <div className="pr-cl-filters">
        <label className="pr-ctl"><Search /><input type="search" placeholder="Search class name, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search classes" /></label>
        <div className="pr-ctl"><Tag /><select value={main} onChange={(e) => { setMain(e.target.value); if (e.target.value) setOpen((o) => new Set(o).add(e.target.value)); }} aria-label="Main ID"><option value="">Main ID</option>{all.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select><ChevronDown className="pr-chev" /></div>
        <div className="pr-ctl"><EyeOff /><select value={vis} onChange={(e) => setVis(e.target.value)} aria-label="Visibility"><option value="">All Visibility</option><option value="1">Visible</option><option value="0">Hidden</option></select><ChevronDown className="pr-chev" /></div>
        <button className="btn secondary pr-soft" type="button" onClick={() => { setQ(""); setMain(""); setVis(""); }}><RefreshCw />Reset</button>
      </div>
      <div className="pr-cl-sum">
        <span className="pill"><Tags /><b>{all.length}</b> main classes</span>
        <span className="pill"><Layers /><b>{subCount}</b> sub types</span>
        <span className="pill"><EyeOff /><b>{hidden}</b> hidden</span>
        <span className="pill"><Package /><b>{classified}</b> products classified</span>
        <span className="spacer" />
        {can.edit && <span className="pr-cl-tip"><GripVertical />Drag rows to reorder</span>}
      </div>
      <div className="pr-cl-list">
        {!rows && [0, 1].map((i) => <div key={i} className="pr-cl-card"><Skeleton style={{ height: 70 }} /></div>)}
        {visible.map(({ c, subs }, i) => {
          const isOpen = open.has(c.id) || (!!q && subs.length > 0);
          const toggle = () => setOpen((o) => { const n = new Set(o); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
          return (
            <article key={c.id} className={cn("pr-cl-card", isOpen && "open", !c.isVisible && "off", flash === c.id && "pr-flash")} style={{ ["--i" as string]: i }}>
              <div className="pr-cl-main" role="button" tabIndex={0} aria-expanded={isOpen} onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
                <span className="pr-cl-ic"><NamedIcon name={c.icon} /></span>
                <div className="pr-cl-meta"><small>Main ID</small><b>{mark(c.code)}</b></div>
                <div className="pr-cl-meta grow"><small>Main Class Name</small><b>{mark(c.name)}</b></div>
                <div className="pr-cl-meta"><small>Sub Types</small><b className="light">{plural(c.subclasses.length, "sub type")}</b></div>
                <div className="pr-cl-meta"><small>Products</small><b className="light">{plural(c.productCount, "product")}</b></div>
                <div className="pr-cl-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Edit ${c.name}`} onClick={() => { setNameErr(""); setDialog({ kind: "main", row: c, name: c.name, icon: c.icon, visible: c.isVisible, history: false }); }}><Pencil /></button>}
                  <label className="switch"><input type="checkbox" checked={c.isVisible} disabled={!can.edit} onChange={(e) => setClassVisible(c, e.target.checked)} /><i /><span>{c.isVisible ? "Visible" : "Hidden"}</span></label>
                  <span className="pr-cl-chev" onClick={toggle}><ChevronDown /></span>
                </div>
              </div>
              <div className="pr-cl-body"><div className="pr-cl-in"><div className="pr-cl-tw">
                <table className="pr-cl-tbl">
                  <thead><tr><th /><th>Sub ID</th><th>Sub Type Name</th><th>Parent Main ID</th><th>Products</th><th>Visibility</th><th className="pr-clact">Actions</th></tr></thead>
                  <tbody onDragLeave={() => setDrop(null)}>
                    {subs.map((s, k) => {
                      const ed = editing?.id === s.id;
                      return (
                        <tr key={s.id} draggable={can.edit && !ed} style={{ ["--i" as string]: k }}
                          className={cn(flash === s.id && "pr-flash", !s.isVisible && "off", drop?.id === s.id && (drop.after ? "pr-dropa" : "pr-dropb"), drag?.id === s.id && "pr-dragging")}
                          onDragStart={(e) => onDragStart(e, c, s)} onDragOver={(e) => onDragOver(e, c, s)} onDrop={(e) => onDrop(e, c)} onDragEnd={() => { setDrag(null); setDrop(null); }}>
                          <td className="pr-grip" title={can.edit ? "Drag to reorder" : undefined}>{can.edit && <GripVertical />}</td>
                          <td className="pr-mono">{mark(s.code)}</td>
                          <td>{ed ? (
                            <input className="pr-cellin wide" autoFocus value={editing.name} aria-label="Sub type name" onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") void saveRename(s); if (e.key === "Escape") setEditing(null); }} />
                          ) : <b>{mark(s.name)}</b>}</td>
                          <td className="pr-mono">{c.code}</td>
                          <td><span className="pr-count">{s.productCount}</span></td>
                          <td><label className="switch"><input type="checkbox" checked={s.isVisible} disabled={!can.edit} onChange={(e) => setSubVisible(s, e.target.checked)} /><i /><span>{s.isVisible ? "Visible" : "Hidden"}</span></label></td>
                          <td className="pr-clact">
                            {ed ? (
                              <><button type="button" onClick={() => saveRename(s)} aria-label="Save"><Check /></button><button type="button" onClick={() => setEditing(null)} aria-label="Cancel"><X /></button></>
                            ) : (
                              <>
                                <button type="button" onClick={() => setDialog({ kind: "subHistory", sub: s })} aria-label={`History of ${s.name}`}><History /></button>
                                {can.edit && <button type="button" onClick={() => setEditing({ id: s.id, name: s.name })} aria-label="Edit sub type"><Pencil /></button>}
                                {can.remove && <button type="button" onClick={() => setRemoving({ kind: "sub", row: s, parent: c })} aria-label="Delete sub type"><Trash2 /></button>}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!subs.length && (
                      <tr className="pr-cl-none"><td colSpan={7}>No sub types yet{can.create && <> · <button className="pr-link" type="button" onClick={() => setDialog({ kind: "sub", parentId: c.id, name: "", visible: true })}>Add the first one</button></>}</td></tr>
                    )}
                  </tbody>
                </table>
                {can.create && <button className="pr-cl-add" type="button" onClick={() => { setNameErr(""); setDialog({ kind: "sub", parentId: c.id, name: "", visible: true }); }}><Plus />Add sub type to {c.name}</button>}
              </div></div></div>
            </article>
          );
        })}
        {rows && !visible.length && <div className="pr-emptybox"><span><Tags /></span><b>{all.length ? "No classes match" : "No classes yet"}</b><small>{all.length ? "Try another search or reset the filters." : "Add a main class such as Packaging or Office Supplies, then its sub types."}</small></div>}
      </div>

      <Modal open={!!dialog && dialog.kind !== "subHistory"} onClose={() => setDialog(null)}
        title={dlgMain ? (dlgMain.row ? `${dlgMain.row.code} · ${dlgMain.row.name}` : "Add Main Class") : "Add Sub Type"}
        subtitle={dlgMain?.history ? "Row history" : "IDs are generated automatically"}
        foot={
          <>
            {dlgMain?.row && (
              <span className="row" style={{ marginRight: "auto", gap: 6 }}>
                <button type="button" className="btn ghost" onClick={() => setDialog({ ...dlgMain, history: !dlgMain.history })}><History />{dlgMain.history ? "Class" : "History"}</button>
                {can.remove && !dlgMain.history && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => { setRemoving({ kind: "main", row: dlgMain.row! }); }}><Trash2 />Delete</button>}
              </span>
            )}
            <button className="btn secondary" type="button" onClick={() => setDialog(null)}>Cancel</button>
            {!dlgMain?.history && <button className="btn primary" type="button" onClick={saveDialog} disabled={busy}><Check />{busy ? "Saving…" : "Save"}</button>}
          </>
        }>
        <div className="pr-clm-body">
          {dlgMain?.history && dlgMain.row ? <HistoryTab schema="Inventory" table="ProductClasses" id={dlgMain.row.id} /> : dialog?.kind === "main" ? (
            <>
              <div className="pr-fg c2">
                <label className="pr-ff"><span>Main ID</span><input value={dialog.row?.code ?? "Assigned on save"} readOnly /></label>
                <label className={cn("pr-ff", nameErr && "err")}><span>Main Class Name<em>*</em></span><input autoFocus placeholder="e.g. Beverages" value={dialog.name} onChange={(e) => { setDialog({ ...dialog, name: e.target.value }); setNameErr(""); }} onKeyDown={(e) => e.key === "Enter" && saveDialog()} /><small className="pr-err">{nameErr}</small></label>
              </div>
              <div className="pr-ff"><span>Icon</span><div className="pr-iconpick">{CLASS_ICONS.map((ic) => <button key={ic} type="button" className={cn(dialog.icon === ic && "on")} aria-label={ic} onClick={() => setDialog({ ...dialog, icon: ic })}><NamedIcon name={ic} /></button>)}</div></div>
              <label className="switch"><input type="checkbox" checked={dialog.visible} onChange={(e) => setDialog({ ...dialog, visible: e.target.checked })} /><i /><span>Visible in sales &amp; purchase screens</span></label>
            </>
          ) : dialog?.kind === "sub" ? (
            <>
              <label className="pr-ff"><span>Parent Main Class<em>*</em></span><select value={dialog.parentId} onChange={(e) => setDialog({ ...dialog, parentId: e.target.value })}>{all.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
              <div className="pr-fg c2">
                <label className="pr-ff"><span>Sub ID</span><input value="Assigned on save" readOnly /></label>
                <label className={cn("pr-ff", nameErr && "err")}><span>Sub Type Name<em>*</em></span><input autoFocus placeholder="e.g. Soft Drinks" value={dialog.name} onChange={(e) => { setDialog({ ...dialog, name: e.target.value }); setNameErr(""); }} onKeyDown={(e) => e.key === "Enter" && saveDialog()} /><small className="pr-err">{nameErr}</small></label>
              </div>
              <label className="switch"><input type="checkbox" checked={dialog.visible} onChange={(e) => setDialog({ ...dialog, visible: e.target.checked })} /><i /><span>Visible</span></label>
            </>
          ) : null}
        </div>
      </Modal>
      <Modal open={dialog?.kind === "subHistory"} onClose={() => setDialog(null)} title={dialog?.kind === "subHistory" ? `${dialog.sub.code} · ${dialog.sub.name}` : ""} subtitle="Row history">
        {dialog?.kind === "subHistory" && <HistoryTab schema="Inventory" table="ProductSubclasses" id={dialog.sub.id} />}
      </Modal>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger confirmLabel="Delete" busy={busy}
        title={removing ? `Delete ${removing.row.code} · ${removing.row.name}?` : ""}
        onConfirm={async () => {
          if (!removing) return;
          const r = removing;
          setRemoving(null);
          const ok = await run(() => (r.kind === "main" ? deleteClass(r.row.id, r.row.rowVersion) : deleteSubclass(r.row.id, r.row.rowVersion)), `${r.row.name} deleted`, "Could not delete");
          if (ok && r.kind === "main") setDialog(null);
        }}>
        {removing?.kind === "main"
          ? "Only a class without sub types or products can be deleted; otherwise hide it. Its ID is not used again."
          : removing && removing.row.productCount ? `${plural(removing.row.productCount, "product")} use this sub type; hide it instead.` : "This sub type has no products. Its ID is not used again."}
      </ConfirmDialog>
    </>
  );
}
