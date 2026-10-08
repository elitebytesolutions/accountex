# Phase 32 rev 1: Payroll

> **Status: approved 2026-10-08 (revision 1).** Planned with Phases 41, 42 and 43. The other session (workspace transaction phases) confirmed this session owns Phase 32.

**Objective:** run monthly payroll end to end, then post it to the GL and pay it:
- **Calculate** pay from salary structures, attendance (Phase 30), unpaid leave (31) and approved overtime (30), with loans, income tax u/s 149 (slabs + declarations), and EOBI / PESSI / PF.
- **Review and approve** through the approval engine (preparer ≠ approver).
- **Post** to the GL.
- **Pay** by bank / cash.

Also: payslips, employee loans and advances, and tax declarations, with My Profile pages for payslips, loans and tax.

**Entities (5, TRANSACTIONAL):** Payroll Runs · Payroll Adjustments · Loans & Advances · Payslips · Tax Declarations

**Defaults applied (no separate decision needed; they follow earlier answers and the other session's guidance):**
- **Approvals** use the existing engine (`PAYROLL_RUN` and `LOAN` subjects): a default workflow of HR Manager → Financial Accountant per company, editable.
- **GL posting** uses the DB's `payrollRunPost` (it calls `Accounting.journalCreate`, idempotent per source).
- **Salary payment** uses `BankCash.postBankingVoucher`: a Dr Salaries Payable / Cr Bank (or Cash) voucher per payment batch, plus a generic bank advice CSV.
- **Payslip PDF** = a print view (no PDF library). Emailing waits for Phase 29; payslips are published in My Profile.
- **Tax declarations need a proof file,** and no upload service exists yet. This phase adds a **minimal attachment upload** (`Company.Attachments`, files stored under `UPLOAD_DIR`, size and type limits) that Phase 35 can extend. *(Say if you'd rather defer proof uploads; then declarations can't be approved yet.)*

## 1. Selection rationale
| Entity | Depends on (status) |
|---|---|
| Payroll Runs | Salary setup (12), attendance (30), leave (31), approvals (16), GL (16) |
| Payroll Adjustments | Runs; overtime claims (30), expense claims (18) |
| Loans & Advances | Employees (11), approvals (16), banking / cash (17 / 18) |
| Payslips | Runs |
| Tax Declarations | Employees, tax slabs (12 / 37) |

## 2. Verified schema (live DB; all 11 tables empty; setup has 18 components, 36 tax slabs, 6 pay groups; no Prisma models yet)

**`Payroll.PayrollRuns`**
- Columns:
  - `payrollMonth` (1st of the month), `runType` (REGULAR / OFF_CYCLE / BONUS_ONLY), pay group;
  - `status` (DRAFT / REVIEW / AWAITING_APPROVAL / APPROVED / REJECTED / POSTED / PAID / CANCELLED / REVERSED);
  - totals, `salaryPayableAccountId`, journal / reversal links, `approvalRequestId`.
- **One REGULAR run per month and pay group.**

**`Payroll.PayrollRunLines`**
- One per employee. Columns: paid days, gross, tax, EOBI, PF, loan, other deductions, net (checked), `payMode`, `taxStatus`, hold + reason, `flags`, payment batch / ref.

**`Payroll.PayrollRunLineComponents`**
- Columns: per component, EARNING / DEDUCTION / EMPLOYER_CONTRIBUTION.

**`Payroll.PayrollRunBranches`**
- **Audit trigger missing → added.**

**`Payroll.PayrollRunChecklistItems`**

**`Payroll.PayrollAdjustments`**
- Columns: `inputSource` (ATTENDANCE / CSV_IMPORT / EXPENSE_CLAIM / HELPDESK / LEAVE_WITHOUT_PAY / LOAN / MANUAL / OVERTIME / SALARY_REVISION).

**`Payroll.LoansAndAdvances`**
- Columns: LOAN / MEDICAL / SALARY_ADVANCE, 1–60 installments, markup, status, disbursement source.

**`Payroll.LoanInstallments`**
- Columns: monthly due, RECOVERED via a payroll line; sync trigger.

**`Payroll.Payslips`**
- Columns: one per line, status GENERATED → EMAILED / VIEWED / …, share token.

**`Payroll.SalaryPaymentBatches`**
- Columns: IBFT / BULK_UPLOAD need a bank account, file format.

**`Payroll.TaxDeclarations`**
- Columns: ZAKAT / DONATION / HEALTH_INSURANCE / VPS / … with ITO section and relief kind, proof required for review / approval, `taxYear`.

**Guard trigger:** lines, components and adjustments can only change while the run is DRAFT / REVIEW.

**DB functions:**
- **Exist:** `payrollRunAddUpdate` (lines + components + adjustments + branches + checklist), `payrollRunPost` / `PostEntries` (JV per component account, branch / cost centre, loan sub-ledger, net to salary payable, installments recovered), `payrollRunCancel` / `Reverse` / `Unpost`, `loanAddUpdate` / `Approve` / `ApproveEntries` / `Disburse`, `taxDeclarationApprove`, `refreshPayrollRunTotals`, `getNextPayrollRunNo`, report views (register, bank advice, EOBI / PESSI / PF, tax statement / certificate / projection, outstanding loans, cost by department, YTD).
- **The DB calculates nothing:** the app computes every line using Phase 12's `computeLines` / `evalFormula` / `taxOn` (`src/shared/payroll/setup.ts`).

**Defects fixed in this phase's SQL (`203-payroll.sql`):**
1. **A run can be posted without approval:** `payrollRunPost` accepts DRAFT. → It now requires APPROVED, and status-move functions are added (submit for review / approval, approve with preparer ≠ approver, reject, mark paid).
2. **Regular runs get off-cycle numbers:** every run is numbered with the off-cycle PRUN pattern. → `getNextPayrollRunNo` is used.
3. **No numbering series exist** for PRUN / PS / LN / ADV in any company. → Seeded per company + trigger for new companies.
4. **`taxDeclarationApprove` always fails** (it doesn't set `verifiedAt`). → Fixed.
5. **`loanApprove` / `loanDisburse` / installment closing:** `loanApprove` doesn't set `approvedAmount`; `loanDisburse` can't pass its own check (no disbursement date) and has no voucher; closing a loan fails because the outstanding amount isn't updated. → Fixed: the disbursement voucher goes via `BankCash.postBankingVoucher`, and the schedule is generated by a new function.
6. **No salary payment posting.** → `payrollRunPay(runId, batch)` creates the banking voucher (Dr Salaries Payable / Cr Bank or Cash) and marks the lines / run PAID.

## 3. Template → page mapping (`51-hr-pay-talent.html`, `48-dash-stock.html`, `6A-ess.html` + `9C-ess.js`)
| Entity | Template | Page | Notes |
|---|---|---|---|
| Payroll overview | `app/hr/payroll` (`48-dash-stock.html:361–465`): KPIs, 12-month cost chart, current run timeline, cost by department, recent runs table | `/hr/payroll` | From the template (report views). |
| Payroll run | `app/hr/payroll/run` 5-step wizard (`51-hr-pay-talent.html:9–267`): Period & Scope → Inputs (attendance sync, overtime, unpaid leave, loans, missing punches, adjustments + CSV) → Review (KPIs, lines, flags, vs previous) → Approve (timeline, checklist) → Post & Pay (GL preview, bank files, after-posting switches) | `/hr/payroll/run` and `/hr/payroll/runs/[id]` | From the template. **Locks the attendance month on approval** (Phase 30's `attendanceRegisterLock`). The "Email payslips" and SMS switches stay disabled (Phase 29). |
| Payslips | `app/hr/payroll/payslips` (KPIs, table, email modal) + `app/hr/payroll/payslip` (printable) | `/hr/payroll/payslips`, `/hr/payroll/payslips/[id]` (print) | Email modal disabled until Phase 29 |
| Loans | `app/hr/loans` (KPIs, table, review drawer `#pay-loan-review`, new-loan modal with schedule preview) | `/hr/loans` | From the template; disbursement voucher via banking / cash |
| My Profile | `app/profile/payslips`, `app/profile/loans`, `app/profile/tax` (`9C-ess.js:939–1415`) | replace the existing placeholders | From the template: payslips with YTD, loan request with eligibility, tax projection + declarations with proof upload |

**Also enabled:** Phase 30's "Push to payroll" on overtime (it creates a payroll adjustment) and Phase 31's LWP feed.

**Nav:** Workforce › Payroll (Overview, Run payroll, Payslips, Loans).

## 4. Clean Architecture
- **Contracts:** `src/shared/payroll/{run,adjustment,loan,payslip,tax-declaration}.ts`.
- **Server:** `src/server/modules/payroll/{runs,adjustments,loans,payslips,tax-declarations}`.
- **Domain `PayrollCalculator`** (pure):
  - structure components → gross;
  - × paid fraction (register payable fraction, unpaid leave);
  - + overtime;
  - − loans;
  - tax (annualised from slabs − declaration reliefs);
  - EOBI / PESSI / PF (rates, ceilings);
  - variance flags.
- **Application:** run lifecycle services, approval subjects registered with `ApprovalSubjects`, banking via the existing services.
- **Attachments port + local file store** (minimal; Phase 35 extends it).
- **UI:** `src/features/payroll/*` (extends Phase 12's).

## 5. API (permissions `prun`, `loan`, `myloan`, `mypay`, `mytax`)
| Method & path | Notes | Errors |
|---|---|---|
| `POST /api/payroll/runs` (period + scope), `POST /:id/calculate`, `GET /:id` (lines, flags), `PUT /:id/adjustments`, `POST /:id/submit \| approve \| reject \| post \| pay \| cancel \| reverse` | Approve via the engine; post needs APPROVED; pay needs POSTED | 409 one regular run per month, 409 `PAYROLL_NOT_APPROVED`, 403 preparer approving |
| `GET /api/payroll/overview` (+ cost charts) | Report views | — |
| `GET/POST /api/payroll/loans`, `POST /:id/approve \| disburse \| reject` ; `POST /api/me/loans` | Eligibility from policy | 400 installments, 409 status |
| `GET /api/payroll/payslips?run=`, `GET /:id` ; `GET /api/me/payslips`, `GET /api/me/payslips/:id` | Employees see only their own | 403 another employee |
| `GET/POST /api/me/tax-declarations`, `POST /:id/proof` (upload) ; `GET /api/payroll/tax-declarations`, `POST /:id/approve \| reject` | Proof required | 400 file type / size |

## 6. Database: `prisma/sql/203-payroll.sql` (idempotent)
- The defect fixes 1–6.
- The PRUN / PS / LN / ADV numbering series.
- Default PAYROLL_RUN and LOAN approval workflows per company.
- An audit trigger on PayrollRunBranches.
- Error codes; lookup tones.
- `Company.Attachments` needs no schema change (it exists); the upload only writes rows and files.

## 7. Audit
- **Tables:** all 11 audited.
- **Attribution:** tenant actor context.
- **History:** History tabs on run, loan and declaration.
- **The calculation is reproducible:** lines store their inputs (paid days, rates).

## 8. Ordered tasks
1. SQL 203 + models + registries.
2. Contracts + `PayrollCalculator`.
3. Run services + approvals + post / pay.
4. Loans, payslips, declarations + upload.
5. Pages (wizard, overview, payslips + print, loans, My Profile).
6. Verify.

## 9. Verification (in Test Co with marker employees; never Demo)
- **Run:**
  - set up salaries → attendance (incl. absences, LWP), approved overtime, a loan installment;
  - calculate → check gross, tax (slab + declaration relief), EOBI / PF and net by hand for 2–3 employees.
- **Lifecycle:**
  - submit → approve by a different user (the preparer is refused) → attendance month locked;
  - post → balanced JV (Dr expenses, Cr payables, loans, net);
  - pay → bank voucher + bank advice CSV → PAID;
  - reverse.
- **Loans:** request → approve → disburse (voucher) → recovered by payroll → closed.
- **Payslips:** in My Profile, print view.
- **Tax declaration:** upload proof → approve → reduces the projection.
- **Permissions:** staff see only their own items.
- History attributed.
- **Visual:** the overview, run wizard, payslips, loans and the three My Profile pages against the templates.

## 10. Risks / blockers
- **Pakistan payroll rules** (EOBI / PESSI rates, tax slabs, ceilings) come from the seeded setup data. Results are only as correct as that data, and the verification computes 2–3 lines by hand.
- **The upload feature is new and minimal.**
- **Blockers:** none.
