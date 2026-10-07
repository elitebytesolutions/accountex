"use client";

import { Inbox, PartyPopper, Plus, SearchX } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { Banner, EmptyState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

type Row = { no: string; date: string; narration: string; amount: string; status: "Posted" | "Draft" };
const ROWS: Row[] = [
  { no: "JV-2026-000418", date: "01 Oct 2026", narration: "Accrued electricity — September", amount: "84,250", status: "Posted" },
  { no: "JV-2026-000419", date: "02 Oct 2026", narration: "Bank charges — Meezan current account", amount: "1,180", status: "Draft" },
];
const COLUMNS: Column<Row>[] = [
  { key: "no", header: "Voucher #", sortable: true, render: (r) => <b>{r.no}</b> },
  { key: "date", header: "Date", sortable: true, render: (r) => r.date },
  { key: "narration", header: "Narration", render: (r) => r.narration },
  { key: "amount", header: "Amount", num: true, render: (r) => r.amount },
  { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "Posted" ? "good" : "warn"} dot>{r.status}</Badge> },
];

/** Interactive part of the UI States screen (template app/states): table, tabs, drawer, confirm, toasts. Demo data only. */
export function StatesDemo() {
  const toast = useToast();
  const [tab, setTab] = useState<"table" | "loading" | "empty">("table");
  const [sort, setSort] = useState("-date");
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <h3 className="mb">Empty states</h3>
      <div className="grid-3 mb">
        <Panel><EmptyState icon={<Inbox />} title="No vouchers yet" description="Create your first journal voucher to start recording transactions." action={<Button variant="primary" size="sm" icon={<Plus />}>New voucher</Button>} /></Panel>
        <Panel><EmptyState icon={<SearchX />} tone="blue" title='No results for "Lucky"' description="Try a different spelling or clear filters for date and branch." action={<Button size="sm" onClick={() => toast("Filters cleared", { tone: "info" })}>Clear filters</Button>} /></Panel>
        <Panel><EmptyState icon={<PartyPopper />} title="All caught up!" description="You have no pending approvals. New requests will appear here." action={<Button variant="ghost" size="sm">Today&apos;s work</Button>} /></Panel>
      </div>

      <h3 className="mb">Loading skeletons</h3>
      <div className="grid-2 mb">
        <Panel>
          <div className="row mb">
            <Skeleton style={{ width: 44, height: 44, borderRadius: "50%" }} />
            <div style={{ flex: 1 }}><Skeleton style={{ height: 12, width: "40%", marginBottom: 8 }} /><Skeleton style={{ height: 10, width: "25%" }} /></div>
          </div>
          <Skeleton style={{ height: 10, marginBottom: 10 }} />
          <Skeleton style={{ height: 10, width: "92%", marginBottom: 10 }} />
          <Skeleton style={{ height: 10, width: "60%" }} />
        </Panel>
        <Panel>
          <Tabs items={[{ key: "table", label: "Table" }, { key: "loading", label: "Loading" }, { key: "empty", label: "Empty" }]} active={tab} onChange={setTab} />
          <Skeleton style={{ height: 10, width: "70%", marginBottom: 10 }} />
          <Skeleton style={{ height: 10, width: "50%" }} />
        </Panel>
      </div>

      <Panel flush className="mb">
        <DataTable
          columns={COLUMNS}
          rows={tab === "empty" ? [] : ROWS}
          rowKey={(r) => r.no}
          total={tab === "empty" ? 0 : 42}
          page={1}
          pageSize={10}
          sort={sort}
          onSortChange={setSort}
          loading={tab === "loading"}
        />
      </Panel>

      <h3 className="mb">Banners &amp; errors</h3>
      <div className="stack mb">
        <Banner tone="danger" title="Couldn't load the trial balance" action={<Button size="sm" onClick={() => toast("Retrying…", { tone: "info" })}>Retry</Button>}>
          The server took too long to respond (timeout after 30s). Your data is safe — try again.
        </Banner>
        <Banner tone="warn" title="You're offline">Changes will sync when your connection is restored.</Banner>
        <Banner tone="info" title="Scheduled maintenance">Unavailable Sunday 04 Oct, 02:00–03:00 PKT.</Banner>
        <Banner tone="good" title="Import complete">412 opening balances imported.</Banner>
      </div>

      <h3 className="mb">Overlays &amp; toasts</h3>
      <div className="row mb">
        <Button variant="primary" onClick={() => setDrawer(true)}>Open drawer</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>Confirm dialog</Button>
        <Button onClick={() => toast("Branch saved")}>Success toast</Button>
        <Button onClick={() => toast("Could not save: code DB_UNIQUE_VIOLATION", { tone: "danger" })}>Error toast</Button>
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="New branch"
        subtitle="Drawer pattern used for create / edit"
        foot={<><Button onClick={() => setDrawer(false)}>Cancel</Button><Button variant="primary" onClick={() => { setDrawer(false); toast("Branch saved"); }}>Save</Button></>}
      >
        <FormGrid>
          <Field label="Code" required><Input defaultValue="LHR" /></Field>
          <Field label="Name" required error="Name is required"><Input aria-invalid /></Field>
          <Field label="City" full><Select><option>Lahore</option><option>Karachi</option></Select></Field>
        </FormGrid>
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); toast("Deactivated", { tone: "warn" }); }} title="Deactivate branch?" confirmLabel="Deactivate" danger>
        Lahore HQ will be hidden from new documents. Existing documents keep it.
      </ConfirmDialog>
    </>
  );
}
