"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { BranchCreateSchema, type Branch, type BranchCreate, type BranchCreateFields, type ListResult } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Check, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { branchAction, createBranch, deleteBranch, listBranches, updateBranch } from "../api";
import { labelOf, lookupOptions, useLookups } from "../use-lookups";

const TYPES = ["Province", "SalesTaxAuthority", "ActiveInactiveStatus"];
const PAGE_SIZE = 25;
type Action = "deactivate" | "activate" | "make-default" | "delete";

const blank: BranchCreateFields = {
  code: "", name: "", description: "", isHeadOffice: false, address: "", city: "", province: "", salesTaxAuthority: "", phone: "", email: "", openingDate: "",
};
const toFields = (b: Branch): BranchCreateFields => ({
  code: b.code, name: b.name, description: b.description ?? "", isHeadOffice: b.isHeadOffice, address: b.address ?? "", city: b.city ?? "",
  province: b.province ?? "", salesTaxAuthority: b.salesTaxAuthority ?? "", phone: b.phone ?? "", email: b.email ?? "", openingDate: b.openingDate ?? "",
});

/** Template app/settings › Branches: list, add/edit drawer with History, deactivate / make default / delete. */
export function BranchesTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const lookups = useLookups(TYPES);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("code");
  const [data, setData] = useState<ListResult<Branch> | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drawer, setDrawer] = useState<{ branch: Branch | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBranches({ page, pageSize: PAGE_SIZE, sort })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load branches" }));
    return () => {
      cancelled = true;
    };
  }, [page, sort, attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const active = data?.items.filter((b) => b.status === "ACTIVE").length ?? 0;
  const statusTone = (code: string) => (lookups.ActiveInactiveStatus?.find((l) => l.code === code)?.tone ?? "neutral") as Tone;

  const columns: Column<Branch>[] = [
    { key: "code", header: "Code", sortable: true, render: (b) => <b>{b.code}</b> },
    {
      key: "name",
      header: "Branch",
      sortable: true,
      render: (b) => (
        <>
          <b>{b.name}</b>
          <small>{[b.isHeadOffice && "Head office", b.isDefault && "default", b.description].filter(Boolean).join(" · ") || " "}</small>
        </>
      ),
    },
    { key: "manager", header: "Manager", render: () => <span className="muted">—</span> },
    { key: "city", header: "Address", sortable: true, render: (b) => [b.address, b.city].filter(Boolean).join(", ") || <span className="muted">—</span> },
    { key: "sta", header: "Sales tax authority", render: (b) => labelOf(lookups, "SalesTaxAuthority", b.salesTaxAuthority) },
    { key: "emp", header: "Employees", num: true, render: () => <span className="zero">—</span> },
    { key: "status", header: "Status", sortable: true, render: (b) => <Badge tone={statusTone(b.status)} dot={b.status === "ACTIVE"}>{labelOf(lookups, "ActiveInactiveStatus", b.status)}</Badge> },
    {
      key: "actions",
      header: "",
      render: (b) => (
        <span className="actions">
          <button type="button" className="icon-btn-sm" aria-label={`Edit ${b.name}`} onClick={() => setDrawer({ branch: b })}><Pencil /></button>
        </span>
      ),
    },
  ];

  return (
    <Panel
      flush
      title="Branches"
      description={data ? `${active} active location${active === 1 ? "" : "s"} · used for branch-wise reporting and user access` : "Loading…"}
      actions={canEdit && <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setDrawer({ branch: null })}>Add branch</Button>}
    >
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(b) => b.id}
        total={data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        loading={!data && !error}
        error={error ?? undefined}
        onRetry={reload}
        empty={<EmptyState icon={<MapPin />} title="No branches yet" description="Add the locations you sell, store or employ from." />}
      />
      <BranchDrawer
        state={drawer}
        canEdit={canEdit}
        lookups={lookups}
        onClose={() => setDrawer(null)}
        onSaved={(message, b) => {
          toast(message, { tone: "good" });
          reload();
          setDrawer(b ? { branch: b } : null);
        }}
      />
    </Panel>
  );
}

function BranchDrawer({ state, canEdit, lookups, onClose, onSaved }: {
  state: { branch: Branch | null } | null;
  canEdit: boolean;
  lookups: ReturnType<typeof useLookups>;
  onClose: () => void;
  onSaved: (message: string, branch: Branch | null) => void;
}) {
  const toast = useToast();
  const branch = state?.branch ?? null;
  const [tab, setTab] = useState<"details" | "history">("details");
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  // Another branch (or a new one) opens on the Details tab.
  const [prevId, setPrevId] = useState(branch?.id);
  if (branch?.id !== prevId) {
    setPrevId(branch?.id);
    setTab("details");
  }

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<BranchCreateFields, unknown, BranchCreate>({
    resolver: zodResolver(BranchCreateSchema),
    values: branch ? toFields(branch) : blank,
  });

  const save = handleSubmit(async (data) => {
    try {
      const saved = branch ? await updateBranch(branch.id, { ...data, rowVersion: branch.rowVersion }) : await createBranch(data);
      onSaved(branch ? "Branch updated" : `Branch ${saved.code} added`, saved);
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [f, m] of Object.entries(e.details)) setError(f as keyof BranchCreateFields, { message: m[0] });
      if (e instanceof ApiError && e.code === "DB_UNIQUE_VIOLATION") setError("code", { message: "Another branch already uses this code" });
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    }
  });

  const runAction = async () => {
    if (!branch || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "delete") {
        await deleteBranch(branch.id, branch.rowVersion);
        setConfirm(null);
        onSaved(`Branch ${branch.code} deleted`, null);
      } else {
        const updated = await branchAction(branch.id, confirm, branch.rowVersion);
        setConfirm(null);
        onSaved(confirm === "make-default" ? `${branch.code} is now the default branch` : confirm === "deactivate" ? "Branch deactivated" : "Branch activated", updated);
      }
    } catch (e) {
      setConfirm(null);
      toast(e instanceof ApiError ? e.message : "Something went wrong", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const editable = canEdit && tab === "details";
  const isActive = branch?.status === "ACTIVE";
  const foot = editable && (
    <>
      {branch && !branch.isDefault && (
        <div className="row" style={{ marginRight: "auto", gap: 8 }}>
          {isActive && <Button size="sm" variant="ghost" onClick={() => setConfirm("make-default")}>Make default</Button>}
          <Button size="sm" variant="ghost" onClick={() => setConfirm(isActive ? "deactivate" : "activate")}>{isActive ? "Deactivate" : "Activate"}</Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm("delete")}>Delete</Button>
        </div>
      )}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={isSubmitting}>{isSubmitting ? "Saving…" : branch ? "Save branch" : "Add branch"}</Button>
    </>
  );

  const CONFIRM: Record<Action, { title: string; body: string; label: string; danger?: boolean }> = {
    deactivate: { title: "Deactivate branch?", body: "It stays in history and reports but can't be picked on new documents.", label: "Deactivate", danger: true },
    activate: { title: "Activate branch?", body: "It can be used on new documents again.", label: "Activate" },
    "make-default": { title: "Make this the default branch?", body: "New documents and users start on this branch.", label: "Make default" },
    delete: { title: "Delete branch?", body: "Only possible while nothing uses the branch. Its history is kept.", label: "Delete", danger: true },
  };

  return (
    <Drawer
      open={!!state}
      onClose={onClose}
      title={branch ? `${branch.code} · ${branch.name}` : "Add branch"}
      subtitle={branch ? [branch.isHeadOffice && "Head office", branch.isDefault && "Default branch", branch.status === "INACTIVE" && "Inactive"].filter(Boolean).join(" · ") || "Branch" : "A location you sell, store or employ from"}
      foot={foot || undefined}
    >
      {branch && (
        <Tabs items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
      )}
      {tab === "history" && branch ? (
        <div className="mt"><HistoryTab schema="Company" table="Branches" id={branch.id} /></div>
      ) : (
        <form onSubmit={save} noValidate className={branch ? "mt" : undefined}>
          <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <FormGrid>
              <Field label="Code" required error={errors.code?.message} hint="2–5 capital letters, e.g. LHR">
                <Input {...register("code")} aria-invalid={!!errors.code} style={{ textTransform: "uppercase" }} />
              </Field>
              <Field label="Name" required error={errors.name?.message}><Input {...register("name")} aria-invalid={!!errors.name} /></Field>
              <Field label="Description" full error={errors.description?.message}><Input {...register("description")} placeholder="e.g. Sales & warehouse" /></Field>
              <Field label="Address" full error={errors.address?.message}><Textarea rows={2} {...register("address")} /></Field>
              <Field label="City" error={errors.city?.message}><Input {...register("city")} /></Field>
              <Field label="Province" error={errors.province?.message}>
                <Select {...register("province")}>
                  <option value="">—</option>
                  {lookupOptions(lookups, "Province", branch?.province).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Sales tax authority" error={errors.salesTaxAuthority?.message}>
                <Select {...register("salesTaxAuthority")}>
                  <option value="">—</option>
                  {lookupOptions(lookups, "SalesTaxAuthority", branch?.salesTaxAuthority).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Opening date" error={errors.openingDate?.message}><Input type="date" {...register("openingDate", { setValueAs: (v) => v || null })} /></Field>
              <Field label="Phone" error={errors.phone?.message}><Input {...register("phone")} /></Field>
              <Field label="Email" error={errors.email?.message}><Input type="email" {...register("email")} aria-invalid={!!errors.email} /></Field>
              <Check full {...register("isHeadOffice")} label="Head office" />
            </FormGrid>
          </fieldset>
          <button type="submit" hidden />
        </form>
      )}
      {branch && confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          onConfirm={runAction}
          busy={busy}
          danger={CONFIRM[confirm].danger}
          title={CONFIRM[confirm].title}
          confirmLabel={CONFIRM[confirm].label}
        >
          <b>{branch.code} · {branch.name}</b>. {CONFIRM[confirm].body}
        </ConfirmDialog>
      )}
    </Drawer>
  );
}
