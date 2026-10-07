## Payroll (People)

Accounts come from `Payroll.SalaryComponents.debitAccountId / creditAccountId` and `Payroll.PayrollRuns.salaryPayableAccountId`; codes below are the prototype COA (Trading & Distribution PK template). All vouchers are `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` pointing at the payroll document and `employeeId` on sub-ledger lines where noted. No stock effect for any payroll event.

### 1. Payroll run — post (`PRUN`, `app/hr/payroll/run` step 5 "Post & Pay")
JV-2026-000451 · dated `PayrollRuns.payDate` · narration "Payroll October 2026 (PR-2026-10)" · source `PRUN / PayrollRuns.id`. Built by summing `PayrollRunLineComponents` per component × department (cost centre = `PayrollRunLines.costCentreId`, else department's cost centre). Lines with `PayrollRunLines.isOnHold` are excluded (paid in final settlement).

| Dr / Cr | Account | Amount (prototype Oct-26) | Source |
|---|---|---|---|
| Dr | 5110 Salaries & Wages Expense — per department (8) | 21,612,400.00 | EARNING components → `debitAccountId` (BAS, HRA, MED, UTL, CNV; OVT → 5111, FUL → 5112, COM → 5130 when mapped separately) |
| Dr | 5115 Employer EOBI Contribution — per department | 345,950.00 | EOR |
| Dr | 5116 Employer PESSI Contribution — Lahore / Faisalabad | 187,900.00 | PSI (Punjab branches only; Karachi under SESSI) |
| Dr | 5117 Employer PF Contribution — per department | 617,800.00 | PFR |
| Dr | 5118 Gratuity expense (when GRT provision is enabled) | — | GRT, Cr 2170 Gratuity Provision |
| Cr | 2140 Salaries Payable | 19,240,600.00 | Σ `PayrollRunLines.netAmount` |
| Cr | 2152 Income Tax Payable — u/s 149 | 1,295,300.00 | ITX |
| Cr | 2155 EOBI Payable (employee 69,190 + employer 345,950) | 415,140.00 | EOB + EOR |
| Cr | 2156 PESSI Payable | 187,900.00 | PSI |
| Cr | 2160 Provident Fund Payable (employee 617,800 + employer 617,800) | 1,235,600.00 | PFE + PFR |
| Cr | 1340 Loans to Employees / 1341 Advances to Employees (sub-ledger `employeeId`) | 389,510.00 | LON / ADV; marks `LoanInstallments` RECOVERED |
| | **Total** | **22,764,050.00 = 22,764,050.00** | must balance (acc trigger) |

Effects: `PayrollRuns.status = POSTED`, `journalEntryId` set; inputs/lines frozen; payslips generated/emailed; `LoanInstallments.payrollLineId` set.

### 2. Salary payment (bank transfer / cheque / cash)
One BPV per `Payroll.SalaryPaymentBatches` (Meezan bulk upload, HBL IBFT) and CPV/cheque for "Cheque / Cash" lines; dated value date.

| Dr / Cr | Account | Amount |
|---|---|---|
| Dr | 2140 Salaries Payable | batch `totalAmount` (e.g. 14,860,200 Meezan) |
| Cr | Bank GL of `SalaryPaymentBatches.bankAccountId` (or cash account) | same |

When all batches are confirmed `PayrollRuns.status = PAID`, `paidAt` set.

### 3. Statutory deposits (15th of next month)
| Event | Dr | Cr |
|---|---|---|
| Income tax CPR (u/s 149) | 2152 Income Tax Payable | Bank (`Tax.WhtChallans` CPR) |
| EOBI PR-01 | 2155 EOBI Payable | Bank |
| PESSI | 2156 PESSI Payable | Bank |
| PF to Staff PF Trust | 2160 PF Payable | Bank |

### 4. Loan / salary advance — disbursement (`LN` / `ADV`, `app/hr/loans`)
BPV-2026-000061 (or CPV when disbursed from cash) · `LoansAndAdvances.disbursementJournalEntryId`.

| Dr / Cr | Account | Amount |
|---|---|---|
| Dr | 1340 Loans to Employees (LOAN, MEDICAL) or 1341 Advances to Employees (SALARY_ADVANCE) — sub-ledger `employeeId` | `LoansAndAdvances.approvedAmount` |
| Cr | Bank (`disbursedFromBankAccountId`) or Cash (`disbursedFromCashAccountId`) | same |

Recovery is part of the payroll post (§1, Cr 1340/1341). Prepayment outside payroll: Dr Bank/Cash, Cr 1340/1341, installment type PREPAYMENT. Markup (if ever enabled): Cr markup income on recovery.

### 5. Final settlement (`FS`, `app/hr/settlement`, off-cycle run `PR-2026-OFF-02`)
JV on approval (`FinalSettlements.journalEntryId`), then BPV-2026-000318 (`paymentJournalEntryId`). Prototype FS-2026-007 (Kashif Ali):

| Dr / Cr | Account | Amount | FinalSettlementLines |
|---|---|---|---|
| Dr | 5110 Salaries & Wages (department of employee) | 108,000.00 | PENDING_SALARY |
| Dr | Leave Encashment Provision / expense | 28,000.00 | LEAVE_ENCASHMENT |
| Dr | 2170 Gratuity Provision (expense 5118 for any un-provided part) | 420,000.00 | GRATUITY |
| Cr | Notice Pay Recovery (Other Income) | 36,000.00 | NOTICE_SHORTFALL |
| Cr | 1341 Advances to Employees (AD-2026-019, sub-ledger employee) | 45,000.00 | ADVANCE_RECOVERY (installments SETTLED → loan CLOSED) |
| Cr | 2152 Income Tax Payable | 12,450.00 | INCOME_TAX (gratuity above Rs 300,000 taxed at 3-year average rate) |
| Cr | 2155 EOBI Payable | 370.00 | EOBI |
| Cr | 2140 Salaries Payable (final dues, sub-ledger employee) | 462,180.00 | net payable |
| | **Total** | **556,000.00 = 556,000.00** | |

Payment: Dr 2140 Salaries Payable 462,180 · Cr Bank Alfalah (`payFromBankAccountId`) 462,180 → `FinalSettlements.status = PAID`.
PF balance (Rs 512,340) is paid by the PF Trust, not by the company — no entry here.

### 6. Gratuity & leave provisions (monthly, optional)
If GRT (and a leave-encashment component) is active, the run posts Dr 5118 Gratuity expense / Cr 2170 Gratuity Provision (1 month basic per completed year ÷ 12) per department; settlement then debits the provision (§5).

### 7. Reversal
A POSTED run is corrected only by reversal: a mirror JV (`PayrollRuns.reversalJournalEntryId`), status REVERSED, recovered installments returned to SCHEDULED; a new run is then created for the month.
