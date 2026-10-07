## Payroll (FULL edition — release P5)

**Screens (8):** Payroll Overview `app/hr/payroll` · Run Payroll `app/hr/payroll/run` · Salary Structures `app/hr/payroll/structures` · Payslips `app/hr/payroll/payslips` · Payslip `app/hr/payroll/payslip` · Payroll Reports `app/hr/payroll/reports` · Loans & Advances `app/hr/loans` · Final Settlement `app/hr/settlement`. Employee-facing parts live in ESS (`ess/payslips`, `ess/tax`, `ess/loans`).

**Tables (schema `Payroll`, 20):** SalaryComponents, SalaryStructures, SalaryStructureComponents, SalaryStructureCommissionTiers*, payGroup*, EmployeeSalaries, loan, PayrollRuns, PayrollRunBranches, PayrollRunChecklistItems*, SalaryPaymentBatches*, PayrollAdjustments, PayrollRunLines, PayrollRunLineComponents, payslip, FinalSettlements, FinalSettlementLines, LoanInstallments, TaxDeclarations, SalaryTaxSlabs (* = helper tables beyond the registry).

### Features
- **Salary components** — earnings, deductions and employer contributions; calculation PERCENT_OF / FIXED / FORMULA / MONTHLY_INPUT / SYSTEM; GL debit/credit mapping; tax treatment FULLY_TAXABLE / EXEMPT_UPTO_LIMIT (10% of basic medical, Rs 150,000 p.a. employer PF) / EXEMPT; flags prorate, show on payslip, gratuity base, EOBI wage; statutory roles (ITX, EOB/EOR, PSI, PFE/PFR, GRT, LON, ADV).
- **Structures** — grade structures G1–G5 (basic band, gross mid, component overrides such as "B × 45%", "Rs 7,500", "120 L × OGRA") and add-on plans (S1 commission tiers by target achievement, cap 50% of basic). Duplicate as draft.
- **Employee salary** — effective-dated (no overlaps, exclusion constraint), structure + add-on, basic, gross, pay group, pay mode; revisions feed the run ("4 revisions effective 01 Oct").
- **Payroll run wizard** — Period & Scope (month, period, pay date, attendance cut-off, run type REGULAR / OFF_CYCLE / BONUS_ONLY, pay group, salary payable account, branches, include notice / exited) → Inputs (attendance sync, approved OT, LWP, loan installments, salary revisions, one-time arrears/bonus/commission lines, CSV import, missing-punch resolution) → Review (per-employee lines, variance vs last month, flags: >15% variance, missing IBAN, negative-net risk, pro-rata) → Approve (multi-level workflow, checklist) → Post & Pay (GL journal preview, bank files per bank, payslip email/ESS publish, SMS, deposit reminders).
- **Tax engine** — u/s 149 projected annual taxable salary on the tenant copy of FBR slabs (`SalaryTaxSlabs`, tax year 2026-27), less exemptions and ESS declarations (Zakat s.60 deductible; donations s.61, health insurance s.62A, VPS s.63 as credits at average rate), spread over remaining months; filer / non-filer status.
- **Statutory** — EOBI 1% employee / 5% employer of minimum wage Rs 37,000; PESSI 6% employer (Punjab; SESSI for Karachi); PF 8% / 8% of basic (settings show 8.33% — configurable on the component); gratuity provision 1 month basic per completed year.
- **Payslips** — numbered PS-YYYY-MM-NNNN, PDF password = CNIC last 5, email with delivery tracking (EMAILED / VIEWED / BOUNCED / NO_EMAIL / ON_HOLD), YTD, tax computation, loan and PF balances, secure share link from ESS.
- **Reports** — Payroll Register, Bank Advice, EOBI PR-01, PESSI, Salary Tax u/s 149 (Annex-C / IRIS), PF Register; overview analytics (12-month cost vs budget, cost by department, gross → CTC).
- **Loans & advances** — LOAN / SALARY_ADVANCE / MEDICAL, purpose, eligibility snapshot (installment ≤ 30% of gross admin policy; ≤ 40% of net pay ESS policy; advance ≤ 50% of basic; staff loan ≤ Rs 150,000 after 1 year, one at a time; medical ≤ Rs 100,000 with estimate), interest-free, schedule, disbursement from bank or cash, automatic recovery in payroll, prepayment, recovery from final dues.
- **Final settlement** — exit facts (resignation, last day, notice required/served, reason, rehire), computation (pending salary, leave encashment, gratuity with Rs 300,000 exemption, notice shortfall, advance/loan recovery, tax, EOBI), PF trust info, approval, JV + BPV, off-cycle run, experience letter & EOBI exit (PR-04).

### Business rules
- One live REGULAR run per month per pay group; regular run number `PR-YYYY-MM`; off-cycle `PR-YYYY-OFF-NN` (PRUN sequence).
- A run's inputs and lines are editable only in DRAFT / REVIEW; after approval only payment/hold fields change; posted runs are reversed, never edited.
- `net = gross − deductions` on every line, run, payslip and settlement (CHECKs).
- Approval: payroll > Rs 10M two levels; CEO final approval above Rs 20M gross (core approval workflow).
- Previous period must be POSTED before the next run is posted; posting respects acc period locks.
- Loan outstanding = approved − recovered (generated column); loans close automatically when fully recovered.
- Exiting employees: regular payslip ON_HOLD, paid in settlement; loans move to SETTLEMENT status.

### Statuses
PayrollRuns DRAFT → REVIEW → AWAITING_APPROVAL → APPROVED → POSTED → PAID (REJECTED, CANCELLED, REVERSED) · payslip GENERATED → EMAILED → VIEWED (NO_EMAIL, BOUNCED, ON_HOLD) · loan PENDING → APPROVED → ACTIVE → CLOSED (SETTLEMENT, REJECTED, WITHDRAWN) · installment SCHEDULED → RECOVERED / SETTLED (REQUESTED, SKIPPED, CANCELLED) · FinalSettlements DRAFT → PENDING_APPROVAL → APPROVED → PAID (CANCELLED) · TaxDeclarations NOT_DECLARED → PENDING → IN_REVIEW → APPROVED (REJECTED).

### Integrations
Bank salary files (Meezan bulk .txt, HBL IBFT .csv), FBR IRIS (Annex-C, CPR), EOBI PR-01 / PR-04, PESSI returns, email/SMS/WhatsApp, biometric attendance (via HR).

### Settings used (Company.CompanySettingValues, HR & Payroll tab)
Pay day, payroll cut-off, working-days basis (calendar / fixed 30 / working days), salary disbursement bank, EOBI employer share, PF %, auto-deduct tax u/s 149, publish payslips to ESS on post; numbering "Payroll Run PR-{YYYY}-".
