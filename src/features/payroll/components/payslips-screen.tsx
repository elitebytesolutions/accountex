"use client";

import { Download, Eye, FileText, MailCheck, MailX, Printer, Search, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PayslipList } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { dateLabel, downloadCsv } from "@/features/finance/components/finance-ui";
import { listDepartments } from "@/features/hr/api";
import { monthLabel, Person } from "@/features/hr/components/attendance-ui";
import { ApiError } from "@/lib/api/errors";
import { listPayslips } from "../pay-api";
import { TaxDeclarationsPanel } from "./tax-declarations-panel";

const EMAIL_LATER = "Emailing payslips arrives with Phase 29";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const STATUS: Record<string, [string, string]> = {
  GENERATED: ["Generated", "neutral"], EMAILED: ["Emailed", "info"], VIEWED: ["Viewed", "good"], ON_HOLD: ["On hold", "warn"], NO_EMAIL: ["No email", "danger"], BOUNCED: ["Bounced", "danger"],
};

/** Template app/hr/payroll/payslips (51-hr-pay-talent.html:383–451) plus a tab for reviewing tax declarations. */
export function PayslipsScreen({ canApproveTax, initialTab, initialRun }: { canApproveTax: boolean; initialTab?: "payslips" | "tax"; initialRun?: string }) {
  const [tab, setTab] = useState<"payslips" | "tax">(initialTab ?? "payslips");
  const [run, setRun] = useState<string | undefined>(initialRun);
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PayslipList | null>(null);
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { listDepartments().then((r) => setDepts(r.items.map((d) => ({ id: d.id, name: d.name })))).catch(() => undefined); }, []);
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    listPayslips({ run, department: dept || undefined, status, search: q, page, pageSize: 25 })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load payslips" }));
    return () => { cancelled = true; };
  }, [run, dept, status, q, page, attempt]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;
  const r = data?.run;
  const k = data?.kpis;
  const month = r ? monthLabel(r.payrollMonth.slice(0, 7)) : "";
  const total = data?.kpis.generated ?? 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const printSelected = () => { for (const id of selected) window.open(`/hr/payroll/payslips/${id}?print=1`, "_blank"); };
  const exportCsv = () => data && downloadCsv(`payslips-${r?.docNo ?? ""}.csv`, [["Slip", "Employee code", "Employee", "Department", "Bank", "Gross", "Deductions", "Net", "Status"],
    ...data.items.map((p) => [p.docNo, p.employee.code, p.employee.name, p.employee.department, p.bank, p.grossAmount, p.deductionAmount, p.netAmount, STATUS[p.status]?.[0] ?? p.status])]);

  return (
    <>
      <PageHead eyebrow="Workforce / Payroll / Payslips" title={r ? `Payslips — ${month}` : "Payslips"}
        description={r ? `Run ${r.docNo} · ${total} payslips${r.postedAt ? ` · Posted ${dateLabel(r.postedAt)}` : ""}${r.paidAt ? ` · Paid ${dateLabel(r.paidAt)}` : ""}${r.status === "REVERSED" ? " · Reversed" : ""}` : "Payslips are generated when a payroll run is posted."}
        actions={<>
          <button className="btn secondary" type="button" disabled={!data?.items.length} onClick={exportCsv}><Download />Export</button>
          <button className="btn primary" type="button" disabled title={EMAIL_LATER}><Send />Email payslips</button>
        </>} />

      <Tabs items={[{ key: "payslips", label: "Payslips" }, { key: "tax", label: "Tax declarations" }]} active={tab} onChange={setTab} />

      {tab === "tax" ? <TaxDeclarationsPanel canApprove={canApproveTax} /> : <>
        <div className="kpi-grid mb">
          <div className="kpi"><div className="kpi-top"><span>Generated</span><span className="icon-well"><FileText /></span></div><strong>{k ? k.generated : "—"}</strong><small>All employees in run</small></div>
          <div className="kpi teal"><div className="kpi-top"><span>Emailed</span><span className="icon-well"><MailCheck /></span></div><strong>{data ? data.counts.EMAILED ?? 0 : "—"}</strong><small>Emailing arrives with Phase 29</small></div>
          <div className="kpi blue"><div className="kpi-top"><span>Viewed in My Profile</span><span className="icon-well"><Eye /></span></div><strong>{k ? k.viewed : "—"}</strong><small>{k && k.generated ? `${Math.round((k.viewed / k.generated) * 1000) / 10}% open rate` : "Published to employees"}</small></div>
          <div className="kpi red"><div className="kpi-top"><span>Bounced / No email</span><span className="icon-well"><MailX /></span></div><strong>{k ? k.noEmail : "—"}</strong><small className={k?.noEmail ? "down" : undefined}>{k?.noEmail ? "Update email in profile" : "All have an email"}</small></div>
        </div>

        <div className="panel flush">
          <div className="panel-head"><div><h3>{r ? `Payslips — ${month}` : "Payslips"}</h3><p>{r ? `${total} payslips · net Rs ${n0(r.netAmount)}` : "No posted payroll run yet"}</p></div></div>
          <div className="toolbar">
            <select value={run ?? r?.id ?? ""} onChange={(e) => { setRun(e.target.value); setPage(1); setSelected(new Set()); }} aria-label="Payroll run">
              {data?.runs.map((x) => <option key={x.id} value={x.id}>{monthLabel(x.payrollMonth.slice(0, 7))} · {x.docNo}{x.status === "REVERSED" ? " (reversed)" : ""}</option>)}
            </select>
            <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <label className="search-field"><Search /><input placeholder="Search name or EMP code…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
            <div className="chips">
              {[["ALL", "All", total], ["GENERATED", "Not sent", data?.counts.GENERATED ?? 0], ["VIEWED", "Viewed", data?.counts.VIEWED ?? 0], ["NO_EMAIL", "No email", data?.counts.NO_EMAIL ?? 0], ["ON_HOLD", "On hold", data?.counts.ON_HOLD ?? 0]].map(([c, l, n]) => (
                <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => { setStatus(String(c)); setPage(1); }}>{l} <i>{n}</i></button>
              ))}
            </div>
            <span className="spacer" />
            <button className="btn secondary sm" type="button" disabled title={EMAIL_LATER}><Send />Email selected</button>
            <button className="btn secondary sm" type="button" disabled={!selected.size} onClick={printSelected}><Printer />Print selected</button>
          </div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={!!data?.items.length && data.items.every((p) => selected.has(p.id))} onChange={(e) => setSelected(e.target.checked ? new Set(data?.items.map((p) => p.id)) : new Set())} /></th>
              <th>Employee</th><th>Department</th><th>Bank</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net Pay</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {!data ? <tr><td colSpan={9}><Skeleton style={{ height: 120 }} /></td></tr> : data.items.length ? data.items.map((p) => {
                const [label, tone] = STATUS[p.status] ?? [p.status, "neutral"];
                return (
                  <tr key={p.id}>
                    <td><input type="checkbox" aria-label={`Select ${p.employee.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                    <td><Person e={p.employee} sub={`${p.employee.code}${p.employee.designation ? ` · ${p.employee.designation}` : ""}`} /></td>
                    <td>{[p.employee.department, p.employee.branch].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{p.bank ?? "—"}</td>
                    <td className="num">{n0(p.grossAmount)}</td>
                    <td className={cn("num", p.deductionAmount ? "cr" : "zero")}>{p.deductionAmount ? n0(p.deductionAmount) : "—"}</td>
                    <td className="num"><b>{n0(p.netAmount)}</b></td>
                    <td><span className={`badge ${tone} dot`} title={p.holdReason ?? undefined}>{p.viewedAt && p.status !== "VIEWED" ? "Viewed" : label}</span></td>
                    <td className="actions"><Link className="icon-btn-sm" href={`/hr/payroll/payslips/${p.id}`} aria-label={`Open payslip of ${p.employee.name}`} title="Open payslip"><Eye /></Link></td>
                  </tr>
                );
              }) : <tr><td colSpan={9}><EmptyState icon={<FileText />} title="No payslips" description={r ? "No payslip matches these filters." : "Payslips appear here once a payroll run is posted."} /></td></tr>}
            </tbody>
          </table></div>
          <div className="table-foot"><span>{data ? `Showing ${data.items.length} of ${data.total}${r ? ` · Net total Rs ${n0(r.netAmount)}` : ""}` : ""}</span>
            {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}
          </div>
        </div>
      </>}
    </>
  );
}
