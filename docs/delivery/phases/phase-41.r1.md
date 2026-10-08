# Phase 41 rev 1: Platform billing

> **Status: approved 2026-10-08 (revision 1).** Planned with Phases 42, 43 (Super Admin) and 32 (Payroll), in parallel with the other session's workspace phases.

**Objective:** bill companies for their subscriptions, collect payments, chase overdue accounts through the dunning policy, and pay resellers their commission.

**Entities (4, TRANSACTIONAL):** Platform Invoices · Platform Payments · Dunning Cases · Reseller Payouts

**Decision (2026-10-08): billing runs automatically every day, plus a "Run now" button.** An in-app daily job, the same pattern as Phase 40's usage capture (env flag `BILLING_JOB=off` disables it):
- creates renewal invoices;
- schedules dunning retries;
- moves overdue companies through the active policy: **PAST_DUE → READ_ONLY → SUSPENDED** (archive / churn stays a manual action).

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Platform Invoices | Subscriptions, plans, add-ons, coupons (36, 40), tax master (37) | The platform's revenue documents |
| Platform Payments | Invoices | Recording what companies pay |
| Dunning Cases | Invoices, payments, dunning policy (38), tenant status enforcement (40) | Overdue handling and the READ_ONLY / SUSPENDED states |
| Reseller Payouts | Resellers (38), reseller–tenant attribution | Partner commission (WHT u/s 233) |

## 2. Verified schema (live DB; all Phase 41 tables empty; all already audited; no Prisma models yet)

**`Platform.PlatformInvoices`**
- Columns:
  - `docNo` `^FS-INV-\d{4}-\d{5,}$` (unique);
  - `tenantId`, `subscriptionId`, `invoiceKind` (SUBSCRIPTION / ADDON / PRORATION / OVERAGE / MANUAL);
  - period, issued and due dates (due ≥ issued);
  - gross, discount, net, tax, total, paid; `balanceAmount` is generated;
  - `taxAuthorityId` → TaxMasterAuthorities, `couponId`;
  - `status` (DRAFT / OPEN / PARTIALLY_PAID / PAID / VOID / UNCOLLECTIBLE);
  - void fields.
- **Checks:** net = gross − discount; total = net + tax; paid ≤ total; PAID ⇒ paid = total; VOID ⇒ reason.

**`Platform.PlatformInvoiceLines`**
- Columns: `lineNo`, `lineKind` (PLAN / ADDON / SEATS / PRORATION_CREDIT / PRORATION_CHARGE / OVERAGE / MANUAL), `qty`, `unitPrice`, plan / add-on / meter refs.
- **Checks:** amount = round(qty × unitPrice, 2); negative only for PRORATION_CREDIT.

**`Platform.PlatformPayments`**
- Columns:
  - **one invoice per payment**;
  - `paymentMethod` (CARD / JAZZCASH / EASYPAISA / RAAST / BANK_TRANSFER / DIRECT_DEBIT / INVOICE);
  - `status` (PENDING / SUCCEEDED / FAILED / REFUNDED / PARTIALLY_REFUNDED), refunds.
- **Trigger `triggerPlatformPaymentApply`** already updates the invoice's `paidAmount` and status (OPEN / PARTIALLY_PAID / PAID) and refuses over-payment.

**`Platform.DunningCases`** (one per invoice)
- Columns:
  - `dunningPolicyId` (NOT NULL);
  - `stage` (GRACE / READ_ONLY / SUSPENDED / COLLECTIONS / PROMISE / RECOVERED / CANCELLED / WRITTEN_OFF);
  - promise-to-pay fields (date + source required);
  - `nextRetryMethod`; recovered and closed fields.

**`Platform.DunningAttempts`**
- Columns: `attemptNo`, `method`, `status` (SCHEDULED / FAILED / SUCCEEDED / SKIPPED / CANCELLED), `triggeredBy` (SCHEDULE / MANUAL / BATCH), payment link.

**`Platform.ResellerPayouts`**
- Columns: unique (partner, `periodMonth` = day 1), gross, `whtSection` 233, `whtRate` 12, net = gross − WHT, `statementLines` jsonb, `status` (DUE / PAID / CANCELLED), `paidOn`.

**`Platform.ResellerTenants`**
- Columns: one partner per tenant, `commissionPctOverride`, `attributedOn` / `endedOn`.

**Views reused:** `getPlatformBillingByMonth` (invoice KPIs), `getCollectionsQueue` (age buckets, attempts, MRR), `getDunningKpis`, `getResellerCommissions` (MRR × commission % per partner, from active attributions).

**Defects fixed in this phase's SQL:**
1. **`platformInvoiceAddUpdate`, `platformInvoiceVoid` and `dunningCaseAddUpdate` take the tenant from the session** (null for the Super Admin) → they take `tenantId` from the payload when no session tenant is set.
2. **New invoices can't be edited:** `platformInvoiceAddUpdate` never sets `status`, so they're created OPEN. → It creates DRAFT, and a new `platformInvoiceIssue(id)` assigns the number (`getNextPlatformDocumentNo('FS-INV')`), checks the totals and sets OPEN.
3. **`resellerAddUpdate`'s tenants branch uses an undeclared `"vTenant"`, and the session tenant** → it uses each element's `tenantId`.
4. **Missing functions are added:**
   - `platformInvoiceGenerate(tenantId, periodStart)`: builds the lines from the subscription, active add-ons, the coupon discount (writing `SubscriptionCouponRedemptions`, counting down months) and tax from the effective `TaxMasterSalesTaxRates` for the tenant's authority.
   - `dunningCaseAdvance(id, asOf)`: moves the stage by the policy's day counts and sets `Platform.Tenants.status`.
   - `resellerPayoutCalculate(periodMonth)`: from `getResellerCommissions` into DUE payouts with statement lines.

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Invoices | `admin/invoices` (`30-entry-admin.html:589–636`): KPIs, month select, chips, table (Invoice #, Tenant, Description, Issued, Due, Subtotal, Tax, Total, Status), row drawer (details, timeline, PDF / Remind / Mark paid), "Manual invoice" | `/admin/invoices` | From the template. **PDF = a print view** (`/admin/invoices/[id]/print`, browser print, template styles). "Remind" is disabled until email delivery (Phase 29). "Mark paid" records a payment. |
| Payments | the invoice drawer + Tenant 360 billing tab (`9B-admin-plus.js:545–555`) | the drawer's "Record payment / Refund" (**template style**) | Allocation happens automatically (DB trigger) |
| Dunning | `admin/dunning` (`9B-admin-plus.js:1004–1200`): KPIs, collections queue by age bucket, attempt dots, retry timeline, Promise-to-pay modal, "Retry all due"; policy panels already built (38) | `/admin/dunning` | From the template. "Retry" records a manual attempt (no payment gateway exists, so an attempt = mark the result). Promise-to-pay pauses retries and can lift READ_ONLY as the modal's switches say. |
| Reseller Payouts | `admin/partners` Resellers tab statement drawer (`9B-admin-plus.js:1377–1398`): gross / WHT 12% / net, tenant table, IBAN, "Mark as paid" | same tab (enable the Statement button) | **Template-style addition:** "Attribute tenant" on a reseller (ResellerTenants). "Email PDF" is a print view; the email waits for Phase 29. |

**Also enabled:**
- Tenant 360 billing tab and dunning panel (Phase 40 placeholders).
- **Nav:** Billing › Platform Invoices.

## 4. Clean Architecture
- **Contracts:** `src/shared/platform/{invoice,payment,dunning-case,payout}.ts`.
- **Server:** `src/server/modules/platform-admin/billing/{invoices,payments,dunning,payouts}`:
  - **Domain:** dunning day math, a proration helper.
  - **Application services:** in `UnitOfWork.run(adminActorContext)`.
  - **`BillingJob`:** daily, plus "Run now" → generate due invoices, issue them, open or advance dunning cases. Recorded as `system: billing-job`.
  - **Infrastructure:** Prisma stores + the fixed / new SQL functions.
- **UI:** `src/features/platform-billing/*`; pages `/admin/invoices`, `/admin/invoices/[id]/print`.

## 5. API (`@AdminRoute`)
| Method & path | Notes | Errors |
|---|---|---|
| `GET /api/admin/invoices` (+ KPIs), `GET /:id`, `POST` (manual, DRAFT), `PATCH /:id` (DRAFT only), `POST /:id/issue \| void`, `POST /api/admin/invoices/generate?period=` | Issued invoices are immutable; corrections by void + new | 409 `INVOICE_NOT_DRAFT`, 409 `INVOICE_HAS_PAYMENTS` (void), 400 totals |
| `POST /api/admin/invoices/:id/payments`, `POST /api/admin/payments/:id/refund` | Allocation via trigger | 409 over-payment, 400 refund > paid |
| `GET /api/admin/dunning/queue` (+ KPIs), `GET /cases/:id`, `POST /cases/:id/attempt \| promise \| resolve \| write-off \| escalate`, `POST /api/admin/dunning/run` | Escalate = advance stage now; resolve on full payment happens automatically | 409 `DUNNING_CASE_CLOSED`, 409 no active policy |
| `POST /api/admin/resellers/:id/tenants` (attribute / end), `POST /api/admin/payouts/calculate?month=`, `GET /api/admin/payouts`, `POST /:id/pay \| cancel` | Pay records `paidOn` and a reference | 409 `PAYOUT_ALREADY_PAID`, 409 period exists |
| `POST /api/admin/billing/run` | Run now (invoices + dunning); returns a summary | — |

## 6. Database: `prisma/sql/106-admin-billing.sql` (idempotent)
- The function fixes (1–3) and the new functions (4).
- The `FS-INV` counter start.
- Error codes listed in §5.
- Lookup labels and tones for the invoice / dunning / payout statuses.

## 7. Audit
- **Tables:** all 7 already audited.
- **Attribution:** the Super Admin, or `system: billing-job`.
- **History:** a History tab on the invoice, dunning case and payout.
- **Registry:** `admin-history-tables.ts` entries (invoice + lines, case + attempts, payouts, reseller tenants).

## 8. Ordered tasks
1. SQL 106; Prisma models; registries.
2. Contracts.
3. Services + `BillingJob`.
4. Pages and print view; enable the Tenant 360 billing tab, the dunning queue and the reseller statement.
5. Verify.

## 9. Verification
- **Functional** (marker test company on a subscription; never Demo's status):
  - generate an invoice (plan + add-on + coupon + tax) → issue (FS-INV number) → partial payment → PAID;
  - void rules;
  - overdue → job advances PAST_DUE → READ_ONLY (writes refused) → SUSPENDED (sign-in refused);
  - payment → case RECOVERED and status restored;
  - promise-to-pay pauses retries;
  - reseller attribution → payout calculate (WHT 12%) → pay;
  - history attributed; a tenant token is refused.
- **Visual:** `/admin/invoices`, the drawer, the print view, `/admin/dunning`, the reseller statement, against the templates.

## 10. Risks / blockers
- **Status changes are real:** the job only touches companies with overdue invoices; Demo has no subscription invoices. The job can be switched off.
- **No payment gateway:** payments and attempts are recorded manually.
- **No email:** reminders wait for Phase 29.
- **Blockers:** none.
