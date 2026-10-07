## Platform billing (Finsoft Cloud's own revenue) — no tenant GL

Platform invoices, payments, dunning and partner payouts are **Finsoft (Pvt) Ltd's own revenue cycle**. They live in the global `Platform` schema and **never post to any tenant's `Accounting.Vouchers`**. No tenant ledger, stock or tax return is touched. If Finsoft keeps its own books in Finsoft, those entries are made in Finsoft's own tenant (e.g. `FSSTAFF`) by an export or integration. That is outside this schema.

For reference, the economic meaning, if mirrored into Finsoft's own books:

| Event (platform table) | Finsoft's own books (reference only) |
|---|---|
| Invoice issued (`PlatformInvoices` OPEN) | Dr Trade receivable (tenant) · Cr Subscription revenue (net) · Cr Provincial sales tax on services payable (PRA/SRB/KPRA/BRA, `taxAmount`) |
| Payment succeeded (`PlatformPayments` SUCCEEDED) | Dr Bank / wallet clearing (JazzCash, Easypaisa, Raast, card) · Cr Trade receivable |
| Refund (`PlatformPayments` REFUNDED / PARTIALLY_REFUNDED) | Dr Trade receivable (or revenue) · Cr Bank |
| Invoice void (`PlatformInvoices` VOID) | reversal of the issue entry |
| Write-off (`DunningCases` WRITTEN_OFF / invoice UNCOLLECTIBLE) | Dr Bad debts · Cr Trade receivable |
| Partner payout (`ResellerPayouts` PAID) | Dr Partner commission expense (gross) · Cr Bank (net) · Cr WHT payable u/s 233 (12%) |

### Invoice → payment → dunning transitions

**Invoice** (`Platform.PlatformInvoices.status`)
- `DRAFT` → `OPEN` when issued (renewal run, provisioning, plan change proration, add-on, overage or manual). Sets `issuedOn` and `dueOn`, and emails the billing contact (`CommunicationLogs`, template INVOICE).
- `OPEN` → `PARTIALLY_PAID` → `PAID` automatically. The trigger `Platform.triggerPlatformPaymentApply` sums SUCCEEDED/PARTIALLY_REFUNDED payments (net of refunds) into `paidAmount`. `balanceAmount` is generated.
- `OVERDUE` is derived, never stored: `dueOn < currentDate AND balanceAmount > 0`.
- `OPEN`/`PARTIALLY_PAID` → `VOID` (needs `voidReason`; audited `invoice.void`) or → `UNCOLLECTIBLE` (after collections / write-off).

**Payment** (`Platform.PlatformPayments.status`)
- `PENDING` → `SUCCEEDED` (sets `paidAt`) or `FAILED` (sets `failureCode` / `failureMessage`, e.g. `doNotHonor`).
- `SUCCEEDED` → `PARTIALLY_REFUNDED` / `REFUNDED` (`refundedAmount`).
- A failed charge on an invoice that has no open case opens a `DunningCases`.

**Dunning** (`Platform.DunningCases.stage`, thresholds from the active `Platform.DunningPolicies`; day = days after `dueOn`)

| Day (default policy) | Stage | Tenant effect |
|---|---|---|
| 1 – graceDays (1–7) | `GRACE` | full access, reminders per channel offsets (D−3, D0, D+3 …), smart retries per `retrySchedule` |
| grace+1 – grace+readOnly (8–14) | `READ_ONLY` | `Tenants.status = 'READ_ONLY'` (view & export only) |
| … + suspendedDays (15–45) | `SUSPENDED` | `Tenants.status = 'SUSPENDED'`, `Subscriptions.status = 'SUSPENDED'` |
| beyond | `COLLECTIONS` | manual collections; on cancel: `subscription` CANCELLED, tenant data archived `archiveDays` (90) |
| any open stage | `PROMISE` | promise-to-pay: retries paused until `promiseDate`, optionally lifts read-only |

- Every retry is a `DunningAttempts` (SCHEDULE / MANUAL / BATCH) that creates a `PlatformPayments`.
- A SUCCEEDED attempt sets the case to `RECOVERED` (`recoveredPaymentId`, `closedAt`). The invoice becomes `PAID` (trigger), the tenant returns to `ACTIVE`, and `SubscriptionEvents` REACTIVATED is logged if the tenant was suspended.
- Closing without payment: `CANCELLED` (invoice voided or credited) or `WRITTEN_OFF` (invoice `UNCOLLECTIBLE`).
