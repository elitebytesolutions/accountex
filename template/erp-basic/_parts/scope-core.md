## Core: company, users & access, numbering, notifications, audit (Basic)

**Screens:** `login` · `login/forgot` · `login/mfa` · `app/dashboard` · `app/settings` · `app/settings/users` · `app/settings/roles` · `app/settings/audit` · `app/notifications` · `app/profile` · `app/unauthorized` · `app/404`
**Schema:** `Company` (`02-core.sql`): 23 tables (3 global reference + `PostingRoles` lookup + 19 tenant), plus the monthly audit partitions.

### Company & branches
- One `CompanySettings` per tenant. It holds the legal identity (legal/trading name, SECP no., NTN `1234567-8`, STRN, address, province, industry, legal structure, logo) and:
  - **finance defaults:** fiscal year start (July default; Jan/Apr allowed), base currency PKR, decimals, Western / South-Asian number format, multi-currency switch, cost-centre-required switch, future-period posting switch;
  - **books lock date:** no journal may be dated on or before it (`Company.getBooksLockDate()` is used by every posting guard);
  - **sales / purchase defaults:** terms, quotation validity, default GST code, credit-limit action BLOCK_OVERRIDE / WARN / ALLOW, overdue tolerance, 90-day block, 3-way-match tolerance, bill approval threshold, stock-adjustment approval threshold (Rs 25,000), PO-before-bill, WHT 153 auto-deduction, partial GRN, duplicate vendor-invoice warning;
  - **tax registration:** GST registered, return period, 18% standard rate, 4% further tax, provincial services tax (PRA/SRB/KPRA/BRA/ICT), ATL status;
  - **branding:** colours, document font (Inter / Noto Nastaliq Urdu), paper size, email footer.
- Anything not fixed goes in `CompanySettingValues` (typed key/value per settings tab).
- **Branches:** code (LHR/KHI/ISB/FSD/MUL), name, head office / default flag, manager, address, province, sales-tax authority, ACTIVE/INACTIVE, opening date. The branch code is the `{BR}` numbering token and the unit of branch-wise access and reporting.
- **Default account mapping:** one GL account per posting role (`Company.PostingRoles`, 74 seeded roles). The settings screen shows 12 of them (AR/AP control, revenue, returns, output/input GST, WHT payable, salaries payable, default bank, retained earnings, rounding, FX). The rest (inventory, COGS, GRNI, shrinkage, cheques in hand …) are mapped from the COA template at onboarding.

### Users, roles and access
- **Sign-in:** company code + work email + password, or Google / Microsoft SSO.
  - MFA uses an authenticator app (TOTP) or SMS, plus 10 recovery codes.
  - "Remember me" and "Trust this device" each last 30 days.
  - Five failed attempts lock the account. Users can be restricted by IP allow-list and login hours (any / business / custom). Session timeout is 15 min – 12 h.
- **User status:** INVITED → ACTIVE ⇄ SUSPENDED → REMOVED (soft delete).
  - Suspending a user revokes every session, and you cannot suspend yourself.
  - Invites (email/WhatsApp) and password resets are single-use hashed tokens: 7 days for an invite, 30 minutes for a reset.
- **RBAC:** role × permission. The permission catalogue is the matrix of ~38 resources (coa, vch, sinv, bill, item, usr, rol …) × actions **V**iew / **C**reate / **E**dit / **A**pprove / **P**ost / **D**elete / e**X**port, coded `resource:action` (e.g. `sinv:post`).
  - The system roles are Owner, Finance Manager, Accountant, HR Manager, Payroll Officer, Sales Executive, Storekeeper and Auditor (read-only). They can be copied but not deleted.
  - A role is either branch-restricted or company-wide.
- **Per-user access:** branches, warehouses, module switches, a data scope of OWN / BRANCH / ALL, and an approval limit (the largest single voucher the user may approve).
- **Effective permissions:** the union of the user's roles (`Company.getUserEffectivePermissions`). A missing permission shows *No access* with "Request access", which sends a notification to an admin.

### Document numbering
- `NumberingSeries` holds one series per doc type, optionally per branch. Each series has a prefix, a pattern (`{PREFIX}-{YYYY}-{SEQ6}`; tokens `{YYYY} {YY} {MM} {BR} {SEQn}`), padding, a start value and a reset policy (NEVER / YEARLY / MONTHLY).
- `Company.getNextDocNo()` takes the branch series first, else the tenant-wide one. It increments `NumberingSeriesCounters` under a row lock, so numbers are never MAX+1 and two concurrent posts can never share a number.
- Numbers are assigned **at post** for posting documents and at save for masters (see the posting rules).

### Notifications
- In-app inbox with categories APPROVALS / FINANCE / HR / SYSTEM. Each notification has unread/read state, a needs-action flag, a mention flag, and a deep link to the document.
- Per-user channels: in-app, daily email digest (08:00), SMS above an amount, WhatsApp. Users pick the events they subscribe to (approvals assigned, rejected documents, bank alerts, credit breaches, daily cash, tax due).

### Audit trail
- `Company.AuditTrailEntries` is append-only and partitioned by month (DEFAULT partition + `Company.ensureAuditTrailPartitions()`).
  - Generic triggers record INSERT/UPDATE/DELETE with field-level before/after.
  - The API records LOGIN, LOGIN_FAILED, POST, APPROVE, REJECT, VOID, REVERSE, PERMISSION, EXPORT, PASSWORD_RESET, MFA_RESET and SESSION_REVOKED, with IP, device and session.
  - Secrets (password hash, MFA seed) are redacted.
- Each entry carries a SHA-256 `entryHash`. `Company.sealAuditTrailBlock()` chains entries into sealed blocks (`Company.AuditTrailSeals`), and "Verify chain" recomputes them. No UPDATE/DELETE path exists.

### Dashboard
Read-only views over the ledgers (`core.vDash*`): cash & bank balance, monthly revenue and expenses, money flow, recent transactions.
