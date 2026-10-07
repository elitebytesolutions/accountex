"use client";

import { Download, LayoutGrid, List, Mail, MoreHorizontal, Phone, Search, TrendingDown, Upload, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { EmployeeFormOptions, EmployeeList } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv } from "@/features/finance/components/finance-ui";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { employeeOptions, listEmployees } from "../api";
import { deptTone, initials, TableFoot } from "./people-ui";

const CHIPS = [["", "All"], ["ACTIVE", "Active"], ["PROBATION", "Probation"], ["NOTICE_PERIOD", "Notice"], ["EXITED", "Exited"]] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Template app/hr/employees (50-hr-core.html): KPIs, filters, cards / table, pager. Import waits for the bulk importer. */
export function EmployeesScreen({ can }: { can: { create: boolean; export: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const lookups = useLookups(["EmployeeStatus", "EmploymentType"]);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EmployeeList | null>(null);
  const [opts, setOpts] = useState<EmployeeFormOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pageSize = view === "cards" ? 12 : 16;

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { employeeOptions().then(setOpts).catch(() => undefined); }, []);
  useEffect(() => {
    let cancelled = false;
    listEmployees({ search, status, department, branch, page, pageSize })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load employees" }));
    return () => { cancelled = true; };
  }, [search, status, department, branch, page, pageSize, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const k = data?.kpis;
  const month = MONTHS[new Date().getMonth()];
  const branchCount = opts?.branches.length ?? 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const count = (s: string) => (s ? k?.byStatus[s] ?? 0 : k?.headcount ?? 0);
  const badge = (s: string) => <span className={cn("badge dot", toneOf(lookups, "EmployeeStatus", s))}>{labelOf(lookups, "EmployeeStatus", s)}</span>;
  const filtered = !!(search || status || department || branch);

  const exportCsv = async () => {
    try {
      const all = await listEmployees({ search, status, department, branch, page: 1, pageSize: 500 });
      downloadCsv("employees.csv", [
        ["Code", "Name", "CNIC", "Department", "Designation", "Branch", "Joining date", "Type", "Status", "Mobile", "Work email"],
        ...all.items.map((e) => [e.code, e.name, e.cnic, e.department.name, e.designation, e.branch.name, e.joiningDate, labelOf(lookups, "EmploymentType", e.employmentType), labelOf(lookups, "EmployeeStatus", e.status), e.mobile, e.workEmail]),
      ]);
      toast(`${all.items.length} employee${all.items.length === 1 ? "" : "s"} exported`, { tone: "good" });
    } catch { toast("Could not export", { tone: "danger" }); }
  };

  return (
    <>
      <PageHead eyebrow="HR / People" title="Employees"
        description={k ? `${k.headcount} ${k.headcount === 1 ? "person" : "people"} across ${branchCount} branch${branchCount === 1 ? "" : "es"}${opts?.branches.length ? ` (${opts.branches.map((b) => b.name).join(", ")})` : ""}.` : "Loading…"}
        actions={<>
          <button className="btn secondary" type="button" disabled title="Bulk import arrives with the data importer (Phase 35)"><Upload />Import</button>
          {can.export && <button className="btn secondary" type="button" onClick={exportCsv}><Download />Export</button>}
          {can.create && <Link className="btn primary" href="/hr/employees/new"><UserPlus />Add Employee</Link>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Headcount</span><span className="icon-well"><Users /></span></div><strong>{k?.headcount ?? "—"}</strong><small>{count("PROBATION")} on probation · {count("NOTICE_PERIOD")} on notice</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>New Joiners ({month})</span><span className="icon-well"><UserPlus /></span></div><strong>{k?.joinersThisMonth ?? "—"}</strong><small>Joined this month</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Exits ({month})</span><span className="icon-well"><UserMinus /></span></div><strong>{k?.exitsThisMonth ?? "—"}</strong><small>{count("EXITED")} exited in total</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Attrition (TTM)</span><span className="icon-well"><TrendingDown /></span></div><strong>{k?.attrition === null || k?.attrition === undefined ? "—" : `${k.attrition}%`}</strong><small>Exits in the last 12 months ÷ headcount</small></div>
      </div>

      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder="Search name, EMP code, CNIC, email…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} aria-label="Department"><option value="">All departments</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }} aria-label="Branch"><option value="">All branches</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <div className="chips">
          {CHIPS.map(([v, l]) => <button key={l} type="button" className={cn(status === v && "active")} onClick={() => { setStatus(v); setPage(1); }}>{l} <i>{count(v)}</i></button>)}
        </div>
        <span className="spacer" />
        <div className="seg">
          <button type="button" className={cn(view === "cards" && "active")} onClick={() => { setView("cards"); setPage(1); }}><LayoutGrid />Cards</button>
          <button type="button" className={cn(view === "table" && "active")} onClick={() => { setView("table"); setPage(1); }}><List />Table</button>
        </div>
      </div>

      {!data ? <Skeleton style={{ height: 320 }} /> : !data.items.length ? (
        <div className="panel"><EmptyState icon={<Users />} title={filtered ? "No employee matches" : "No employees yet"}
          description={filtered ? "Try another search or filter." : can.create ? "Add your first employee: the code comes from the EMP numbering series." : "Employees HR adds appear here."}
          action={!filtered && can.create ? <Link className="btn primary sm" href="/hr/employees/new"><UserPlus />Add Employee</Link> : undefined} /></div>
      ) : view === "cards" ? (
        <>
          <div className="card-grid">
            {data.items.map((e) => (
              <Link key={e.id} className="card" href={`/hr/employees/${e.id}`}>
                <div className="row"><span className="avatar lg">{initials(e.name)}</span><div><b>{e.name}</b><small className="muted" style={{ display: "block" }}>{e.designation}</small></div><span className="spacer" />{badge(e.status)}</div>
                <div className="row mt"><span className={cn("badge", deptTone(e.department.code))}>{e.department.name}</span><span className="small muted">{e.code} · {e.branch.name}</span></div>
                <div className="small muted mt">{e.workEmail || e.personalEmail ? <><Mail /> {e.workEmail ?? e.personalEmail}<br /></> : null}<Phone /> {e.mobile}</div>
              </Link>
            ))}
          </div>
          <TableFoot label={`Showing ${data.items.length} of ${data.total} employee${data.total === 1 ? "" : "s"}`} page={page} pages={pages} go={setPage} />
        </>
      ) : (
        <div className="panel flush">
          <div className="panel-head"><div><h3>All employees</h3><p>{status ? labelOf(lookups, "EmployeeStatus", status) : "Current"} staff across {branchCount} branch{branchCount === 1 ? "" : "es"}</p></div></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Employee</th><th>Department</th><th>Designation</th><th>Branch</th><th>Joining date</th><th>Type</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/hr/employees/${e.id}`)}>
                  <td><div className="cell-user"><span className="avatar sm">{initials(e.name)}</span><div><b><Link className="link" href={`/hr/employees/${e.id}`} onClick={(ev) => ev.stopPropagation()}>{e.name}</Link></b><small>{e.code}</small></div></div></td>
                  <td>{e.department.name}</td><td>{e.designation}</td><td>{e.branch.name}</td><td>{dateLabel(e.joiningDate)}</td>
                  <td>{labelOf(lookups, "EmploymentType", e.employmentType)}</td><td>{badge(e.status)}</td>
                  <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Open ${e.name}`}><MoreHorizontal /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <TableFoot label={`Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + data.items.length} of ${data.total}`} page={page} pages={pages} go={setPage} />
        </div>
      )}
    </>
  );
}
