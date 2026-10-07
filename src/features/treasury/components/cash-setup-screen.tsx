"use client";

import { Banknote, Coins, Plus, Receipt, Tags, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CashAccount, CashCategory, ExpenseCategory } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconWell, PageHead, Panel } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { listBranchOptions, listCashAccounts, listCustodians, listCashCategories, listExpenseCategories, setCashActive, type BranchOption, type CashResource } from "../api";
import { CashAccountDrawer, CashCategoryDrawer, ExpenseCategoryDrawer } from "./cash-forms";
import { apiMessage, usePostableAccounts } from "./treasury-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
const LOOKUPS = ["CashAccountKind", "CashCategoryDirection", "CashCategoryVoucherType", "PartyKind", "ExpenseCategoryAppliesTo", "LimitPeriod"];
const DIR_TONE: Record<string, Tone> = { IN: "good", OUT: "danger", TRANSFER: "info" };
const KIND_TONE: Record<string, Tone> = { DRAWER: "good", COUNTER: "info", PETTY: "warn", IMPREST: "violet" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

/**
 * Cash › Cash Setup. No template exists for these masters (decided 2026-10-05): built from the template's page head, KPI cards,
 * card grid, panels, tables and drawers. The Cash Book and Expense Claims phases open the same drawers from their screens.
 */
export function CashSetupScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const accounts = usePostableAccounts();
  const [cash, setCash] = useState<CashAccount[] | null>(null);
  const [cats, setCats] = useState<CashCategory[]>([]);
  const [exps, setExps] = useState<ExpenseCategory[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [account, setAccount] = useState<CashAccount | "new" | null>(null);
  const [category, setCategory] = useState<CashCategory | "new" | null>(null);
  const [expense, setExpense] = useState<ExpenseCategory | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCashAccounts(), listCashCategories(), listExpenseCategories(), listBranchOptions()])
      .then(([a, c, e, b]) => {
        if (cancelled) return;
        setCash(a);
        setCats(c);
        setExps(e);
        setBranches(b);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load cash setup" }));
    listCustodians().then((u) => !cancelled && setUsers(u)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const done = useCallback(() => {
    setAccount(null);
    setCategory(null);
    setExpense(null);
    reload();
  }, [reload]);

  const toggle = async (resource: CashResource, r: { id: string; name: string; isActive: boolean; rowVersion: number }) => {
    try {
      await setCashActive(resource, r.id, !r.isActive, r.rowVersion);
      toast(`${r.name} ${r.isActive ? "deactivated" : "activated"}`, { tone: r.isActive ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const all = cash ?? [];
  const imprest = all.reduce((s, a) => s + (a.imprestAmount ?? 0), 0);

  return (
    <>
      <PageHead eyebrow="Cash / Setup" title="Cash Setup" description="Cash drawers, counters and petty cash funds, the categories cash entries are booked under, and expense categories for claims and petty cash." />

      <div className="kpi-grid mb">
        <div className="kpi teal"><div className="kpi-top"><span>Cash in hand</span><span className="icon-well"><Banknote /></span></div><strong>{cash ? rs(all.reduce((s, a) => s + a.balance, 0)) : "…"}</strong><small>{all.filter((a) => a.isActive).length} active cash accounts</small></div>
        <div className="kpi"><div className="kpi-top"><span>Imprest funds</span><span className="icon-well"><Coins /></span></div><strong>{rs(imprest)}</strong><small>{all.filter((a) => a.imprestAmount).length} petty / imprest funds</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Cash categories</span><span className="icon-well"><Tags /></span></div><strong>{cats.length}</strong><small>{cats.filter((c) => c.direction === "IN").length} in · {cats.filter((c) => c.direction === "OUT").length} out</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Expense categories</span><span className="icon-well"><Receipt /></span></div><strong>{exps.length}</strong><small>{exps.filter((c) => c.limitAmount).length} with a limit</small></div>
      </div>

      <Panel className="mb" title="Cash accounts" description="Each one has its own GL account under 1110 Cash & bank; its code is that GL code" actions={can.create && <Button size="sm" icon={<Plus />} onClick={() => setAccount("new")}>New cash account</Button>}>
        {!cash && <Skeleton style={{ height: 120 }} />}
        {cash && !all.length && <EmptyState icon={<Wallet />} title="No cash accounts yet" description="Add the main cash drawer, counters and petty cash funds." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setAccount("new")}>New cash account</Button>} />}
        {all.length > 0 && (
          <div className="card-grid" style={{ marginBottom: 0 }}>
            {all.map((a) => (
              <div key={a.id} className="card" style={{ cursor: "pointer", opacity: a.isActive ? 1 : 0.6 }} onClick={() => setAccount(a)}>
                <div className="row">
                  <IconWell tone={a.kind === "PETTY" || a.kind === "IMPREST" ? "yellow" : undefined}>{a.kind === "PETTY" || a.kind === "IMPREST" ? <Coins /> : <Banknote />}</IconWell>
                  <div><b>{a.name}</b><small className="muted" style={{ display: "block" }}>{a.code} · {a.branch.name}</small></div>
                  <span className="spacer" />
                  <Badge tone={a.isActive ? (KIND_TONE[a.kind] ?? "neutral") : "neutral"}>{a.isActive ? labelOf(lookups, "CashAccountKind", a.kind) : "Inactive"}</Badge>
                </div>
                <h2 style={{ margin: "14px 0 2px" }}>{rs(a.balance)}</h2>
                <small className="muted">{a.imprestAmount ? `of ${rs(a.imprestAmount)} imprest` : `Approval above ${rs(a.approvalThreshold)}`}</small>
                <div className="row small mt"><span className="muted">{a.custodian ? `Custodian ${a.custodian.name}` : "No custodian"}</span><span className="spacer" /><span className="muted">± {rs(a.varianceTolerance)} at day close</span></div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel flush title="Cash categories" description="What a cash book entry is for" actions={can.create && <Button size="sm" icon={<Plus />} onClick={() => setCategory("new")}>New category</Button>}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Category</th><th>Direction</th><th>Voucher</th><th>Default account</th><th>Active</th></tr></thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={(e) => !(e.target as HTMLElement).closest("label") && setCategory(c)}>
                    <td><b>{c.name}</b><small>{c.code}{c.isSystem ? " · system" : ""}</small></td>
                    <td><Badge tone={DIR_TONE[c.direction] ?? "neutral"}>{labelOf(lookups, "CashCategoryDirection", c.direction)}</Badge></td>
                    <td>{c.voucherType}</td>
                    <td className={c.defaultAccount ? undefined : "muted"}>{c.defaultAccount ? `${c.defaultAccount.code} ${c.defaultAccount.name}` : "—"}</td>
                    <td><label className="switch"><input type="checkbox" checked={c.isActive} disabled={!can.edit} aria-label={`${c.name} active`} onChange={() => toggle("categories", c)} /><i /></label></td>
                  </tr>
                ))}
                {cash && !cats.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>No cash categories yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel flush title="Expense categories" description="Used on expense claims and petty cash vouchers" actions={can.create && <Button size="sm" icon={<Plus />} onClick={() => setExpense("new")}>New category</Button>}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Category</th><th>Expense account</th><th className="num">Limit</th><th>Active</th></tr></thead>
              <tbody>
                {exps.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={(e) => !(e.target as HTMLElement).closest("label") && setExpense(c)}>
                    <td><b>{c.name}</b><small>{labelOf(lookups, "ExpenseCategoryAppliesTo", c.appliesTo)}{c.receiptRequired ? " · receipt" : ""}{c.requiresPreApproval ? " · pre-approval" : ""}</small></td>
                    <td>{c.account.code}<small>{c.account.name}</small></td>
                    <td className="num">{c.limitAmount ? <>{rs(c.limitAmount)}<small>{labelOf(lookups, "LimitPeriod", c.limitPeriod)}</small></> : "—"}</td>
                    <td><label className="switch"><input type="checkbox" checked={c.isActive} disabled={!can.edit} aria-label={`${c.name} active`} onChange={() => toggle("expense-categories", c)} /><i /></label></td>
                  </tr>
                ))}
                {cash && !exps.length && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>No expense categories yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <CashAccountDrawer edit={account} onClose={() => setAccount(null)} onDone={done} branches={branches} users={users} accounts={accounts} lookups={lookups} can={can} />
      <CashCategoryDrawer edit={category} onClose={() => setCategory(null)} onDone={done} accounts={accounts} lookups={lookups} can={can} />
      <ExpenseCategoryDrawer edit={expense} onClose={() => setExpense(null)} onDone={done} accounts={accounts} lookups={lookups} can={can} />
    </>
  );
}
