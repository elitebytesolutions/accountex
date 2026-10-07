## Core: approval gate and document numbering at post

These two rules run **before** any module posting rule (sales, purchase, treasury, inv, payroll, fa …). They create no journal lines of their own.

### 1. Approval gate (Full)
| Step | Rule | Tables |
|---|---|---|
| Submit | When a document is submitted, the posting service finds the ACTIVE `Company.ApprovalWorkflows` for its subject with the lowest `priority` whose `ApprovalWorkflowConditions`s all hold (amount, doc type, branch …). If one matches, it inserts `Company.Approvals` (PENDING, `currentStepNo` = first applicable step, `currentStepDueAt` = now + `slaHours`) and `Company.ApprovalActions` SUBMIT. The document stays unposted (e.g. status `SUBMITTED` / `PENDING_APPROVAL` in its own table). | `ApprovalWorkflows`, `ApprovalWorkflowConditions`, `ApprovalWorkflowSteps`, `Approvals`, `ApprovalActions` |
| Steps | Steps with `appliesAboveAmount` ≥ the amount are skipped (AUTO_SKIP). The approver may not be the preparer (`blockSelfApproval`). The approver's `Company.RoleLimits.maxVoucherAmount` and `Company.Users.approvalLimit` must cover the amount. An SLA breach escalates or reminds. | `ApprovalWorkflowSteps`, `RoleLimits`, `Users` |
| Outcome | Last step APPROVE → request APPROVED. If `onComplete` = AUTO_POST, the document is posted immediately (section 2 + the module's posting rule). REJECT / REQUEST_CHANGES → document back to DRAFT, request closed. | `Approvals` |
| Guard | Every posting function calls `Company.assertDocumentApproved(<doc type>, <id>, <workflow matched?>)`. It raises unless the latest request is APPROVED, or no workflow applied (`NOT_ROUTED` with `pRequired = false`). | `Company.assertDocumentApproved()`, `Company.getApprovalStatus()` |

Basic has no approvals engine. Posting there is gated only by the permission (`…:post`), the user's approval limit, and the period / lock-date checks.

### 2. Document number assigned at post (Basic + Full)
| Step | Rule |
|---|---|
| Drafts | Posting documents are saved as DRAFT with `docNo` holding a temporary reference (or NULL where the module allows it), so cancelled drafts never burn a number. |
| Post | In the posting transaction, before the journal is written: `docNo := Company.getNextDocNo('<DOC_TYPE>', docDate, branchId)`. The function takes the branch series first, else the tenant-wide one. It locks the `Company.NumberingSeriesCounters` row for (series, period), where the period comes from `resetPolicy` (YEARLY → `YYYY` of docDate, MONTHLY → `YYYY-MM`, NEVER → `ALL`). It then returns the formatted number (`INV-2026-000146`, `CRV-LHR-0381`). |
| Rollback | If the post fails, the transaction rolls back and the counter increment rolls back with it: no gaps from failures and no duplicates (never MAX+1). |
| Journal | `Accounting.Vouchers.sourceDocType` / `sourceDocId` point back to the document. The journal's own number (`JV`/`CRV` …) is drawn the same way for manual vouchers. |
| Masters | Masters (CUST, VEN, ITEM, EMP …) take their `code` from `Company.getNextDocNo` at **save**, not at post. |

Guards that apply at post, in order:
1. permission `…:post`;
2. approval gate (Full);
3. `docDate > Company.getBooksLockDate()`;
4. open fiscal period (acc);
5. role back-dating window `RoleLimits.backdateDays` (Full);
6. number assignment;
7. module posting rule.

Each successful post writes `Company.AuditTrailEntries` with action POST.
