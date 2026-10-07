# 02 · Auth, workspace & settings (Basic)

Page → entity map for the sign-in screens, the dashboard and tenant settings in **erp-basic**.
Schema: `database/schema/02-core.sql` (core) · cross-module FKs: `database/fk/02-Company-fks.sql`.
Views named `core.v*` are defined in `90-views.sql`.

Screens (12): `login` · `login/forgot` · `login/mfa` · `app/dashboard` · `app/settings` · `app/settings/users` · `app/settings/roles` · `app/settings/audit` · `app/notifications` · `app/profile` · `app/unauthorized` · `app/404`

Conventions used below: every table has `tenantId` (RLS), and every write is stamped (`createdBy`/`updatedBy`). Tables created with `stdTriggers(…, true)` write `Company.AuditTrailEntries`; `Company.Users` uses the redacting audit trigger, which never stores secrets.

---

### Sign in — `login`
*Source:* `src/30-entry-admin.html` (section `login`)
**Purpose.** Signs a tenant user in with company code + work email + password, or with Google / Microsoft SSO.
**Tables.** Primary: `Company.Users`, `Company.UserSessions` · Reads: `Platform.Tenants` (code → tenant), `Company.Users`, `Company.CompanySettingValues` (security policy) · Writes: `Company.UserSessions`, `Company.Users` (last_login_*, failedLoginCount, lockedUntil), `Company.AuditTrailEntries`
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo`
**Lookups.** `Users.status` → `UserStatus` · `Users.dataScope` → `DataScope` · `Users.mfaMethod` → `UserMfaMethod` · `Users.loginHours` → `LoginHours` · `Users.ssoProvider` → `UserSsoProvider` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Company code (ALNOOR · alnoor.finsoft.pk) | `Platform.Tenants.code` / `.subdomain` | Resolved before any tenant context; the API then sets `app.tenantId`. |
| Work email | `Company.Users.email` | citext; unique per tenant among non-REMOVED users. |
| Password | `Company.Users.passwordHash` | Verified against the hash; `mustChangePassword` forces a reset. |
| Remember me for 30 days | `Company.UserSessions.rememberMe`, `.expiresAt` | expiresAt = now + 30 days when ticked, else `sessionTimeoutMin`. |
| Google / Microsoft buttons | `Company.Users.ssoProvider`, `.ssoSubject`; `Company.UserSessions.authMethod` | SSO_GOOGLE / SSO_MICROSOFT. |
| "Two-step verification is on" banner | `Company.Users.mfaEnabled` (+ tenant policy `Platform.Tenants.requireMfa`) | Routes to `login/mfa`. |

**Statuses.** `Users.status`: only ACTIVE may sign in · INVITED (must accept invite) · SUSPENDED / REMOVED → refused. Locked while `lockedUntil > now()`.
**Actions → effects.** *Sign in* → checks status, `ipRestricted`/`PlatformAllowedIps`, `loginHours` window; on success inserts `Company.UserSessions` (tokenHash, deviceLabel, ip, clientType WEB) and `Company.AuditTrailEntries` action LOGIN; on failure increments `failedLoginCount` and writes `AuditTrailEntries` LOGIN_FAILED (`actorEmail` filled, `userId` NULL for unknown email). Five failures set `lockedUntil`.
**Permission.** none (public) · **Approval.** —

### Reset password — `login/forgot`
*Source:* `src/30-entry-admin.html` (section `login/forgot`)
**Purpose.** Sends a single-use reset link (valid 30 minutes) to the user's work email; the company admin is notified.
**Tables.** Primary: `Company.PasswordResets` · Reads: `Platform.Tenants`, `Company.Users` · Writes: `Company.PasswordResets`, `Company.Notifications` (admin), `Company.AuditTrailEntries`

| UI field / column | Table.column | Notes |
|---|---|---|
| Company code | `Platform.Tenants.code` | |
| Work email | `Company.Users.email` | Same response whether or not the email exists (no user enumeration). |
| (link token) | `Company.PasswordResets.tokenHash` | sha-256 only; `purpose` = RESET, `channel` = EMAIL. |
| "valid for 30 minutes and can be used once" | `Company.PasswordResets.expiresAt`, `.usedAt` | expiresAt = createdAt + 30 min; CHECK caps any token at 8 days. |
| "Use a recovery code" (from MFA page) | `Company.Users.mfaRecoveryCodes` | Hashed single-use codes. |

**Statuses.** token: open → used (`usedAt`) · expired (derived `expiresAt < now()`).
**Actions → effects.** *Send reset link* → inserts `PasswordResets` (requestedIp); emails link; `notification` to the tenant Owner (event PASSWORD_RESET_REQUESTED, category SYSTEM). *Choose new password* (from link) → sets `Users.passwordHash`, `passwordChangedAt`, marks `usedAt`, revokes all `UserSessions` rows (revokeReason PASSWORD_CHANGED), `AuditTrailEntries` PASSWORD_RESET.
**Permission.** none (public) · **Approval.** —

### Verify sign in — `login/mfa`
*Source:* `src/30-entry-admin.html` (section `login/mfa`)
**Purpose.** Second factor: 6-digit code from the authenticator app (SMS fallback, recovery codes); optionally trusts the device for 30 days.
**Tables.** Primary: `Company.UserSessions` · Reads: `Company.Users` (mfaMethod, mfaSecretEnc, phone) · Writes: `Company.UserSessions`, `Company.AuditTrailEntries`

| UI field / column | Table.column | Notes |
|---|---|---|
| 6-digit code | verified against `Company.Users.mfaSecretEnc` (TOTP) | Code itself is never stored. |
| "Code to +92 300 ••• 4521" / Resend by SMS | `Company.Users.phone`, `.mfaMethod` = SMS | |
| Recovery codes (10 single-use) | `Company.Users.mfaRecoveryCodes` | A used code is removed from the array. |
| Trust this device for 30 days | `Company.UserSessions.trustedUntil` | Later sign-ins from the same device skip MFA until then. |
| Code expires in 00:48 | — | TOTP window, not stored. |

**Statuses.** session: pending MFA (`mfaVerifiedAt` NULL) → verified.
**Actions → effects.** *Verify & continue* → sets `UserSessions.mfaVerifiedAt` (+ `trustedUntil`), `Users.lastLoginAt/lastLoginIp`, `AuditTrailEntries` LOGIN (changes: `{"mfa": "TOTP"}`); redirect to `UserPreferences.startRoute`.
**Permission.** none (authenticated, pre-MFA) · **Approval.** —

### Dashboard — `app/dashboard`
*Source:* `src/48-dash-stock.html` (section `app/dashboard`) · `src/92-dash.js` (charts)
**Purpose.** Finance overview: cash & bank balance, monthly revenue and expenses, money flow, recent transactions.
**Tables.** Primary: views only · Reads: `Company.getDashboardCashAndBank`, `Company.getDashboardMonthlyRevenue`, `Company.getDashboardMonthlyExpenses`, `Company.getDashboardMoneyFlow`, `Company.getDashboardRecentTransactions`, `Company.Users` (greeting), `Company.CompanySettings` (fyStartMonth for "FY 2026-27 · Q2") · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Cash & Bank Balance "Rs 48,215,300 · 4 banks, 3 cash books" | `Company.getDashboardCashAndBank.totalBalance`, `.bankAccountCount`, `.cashAccountCount` | Period select (All time / This month / This quarter / FY) filters the movement pills. |
| Total earned last month / Collections MTD | `Company.getDashboardCashAndBank.earnedLastMonth`, `.collectionsMtd` | |
| Revenue "Rs 18,642,750 · September 2026", Sales / Services / Other | `Company.getDashboardMonthlyRevenue.totalRevenue`, `.salesGoods`, `.services`, `.otherIncome` | MoM % from `.prevMonthTotal`. Daily heat strip = `Company.getDashboardDailyRevenue`. |
| Total expenses · September | `Company.getDashboardMonthlyExpenses.totalExpenses` | "below plan" and the gauge goal need budgets → Full only. |
| Money Flow (Income / Expense, Monthly / Quarterly) | `Company.getDashboardMoneyFlow.income`, `.expense`, `.periodStart`, `.grain` | |
| Transaction History (Name, Date, Method, Amount, Status) | `Company.getDashboardRecentTransactions.partyName`, `.docNo`, `.occurredAt`, `.method`, `.amount`, `.direction`, `.status` | Union of `Sales.CustomerReceipts`, `Purchases.VendorPayments`, `Purchases.VendorBills`, `Sales.SalesInvoices`. Filter All / Receipts / Payments = `direction`. |
| Budget Remaining, Pending approvals, Payroll · October | — | Full-only cards (budgets, approvals, payroll) are hidden in Basic. |

**Statuses.** Transaction status chips Completed / Pending / Failed come from the source document status.
**Actions → effects.** *Today's Work* (Full) · *New Invoice* → `app/sales/invoices/new`. Read-only.
**Permission.** `frep:view` for the finance cards; each card is hidden when its module permission (`bank:view`, `sinv:view`, `bill:view`) is missing · **Approval.** —

### Company Settings — `app/settings`
*Source:* `src/60-settings-ess.html` (section `app/settings`, tabs set-profile, set-branches, set-finance, set-sales, set-tax, set-numbering, set-branding)
**Purpose.** Legal profile, branches, finance defaults and account mapping, sales/purchase defaults, tax registration, numbering series and branding.
**Tables.** Primary: `Company.CompanySettings`, `Company.Branches`, `Company.DefaultAccountMappings`, `Company.NumberingSeries`, `Company.CompanySettingValues` · Reads: `Company.Currencies`, `Company.PostingRoles`, `Company.DocumentTypes`, `Company.NumberingSeriesCounters`, `Accounting.ChartOfAccounts`, `BankCash.BankAccounts`, `Tax.TaxCodes`, `Company.Users` (manager) · Writes: same primaries, `Company.Attachments` (logo), `Company.AuditTrailEntries`
**Functions.** Save → `Company.companySettingAddUpdate` · Open → `Company.getCompanySettingInfo` ‖ Save → `Company.branchAddUpdate` · Open → `Company.getBranchInfo` ‖ Save → `Company.defaultAccountMappingAddUpdate` · Open → `Company.getDefaultAccountMappingInfo` ‖ Save → `Company.numberingSeriesAddUpdate` · Open → `Company.getNumberingSeriesInfo`
**Lookups.** `CompanySettings.province` → `Province` · `CompanySettings.industry` → `CompanySettingIndustry` · `CompanySettings.legalStructure` → `LegalStructure` · `CompanySettings.numberFormat` → `NumberFormat` · `CompanySettings.fxRateSource` → `FxRateSource` · `CompanySettings.creditLimitAction` → `CreditLimitAction` · `CompanySettings.salesTaxReturnPeriod` → `SalesTaxReturnPeriod` · `CompanySettings.provincialTaxAuthority` → `ProvincialTaxAuthority` · `CompanySettings.atlStatus` → `CompanySettingAtlStatus` · `CompanySettings.documentFont` → `DocumentFont` · `CompanySettings.paperSize` → `PaperSize` · `Branches.province` → `Province` · `Branches.salesTaxAuthority` → `SalesTaxAuthority` · `Branches.status` → `ActiveInactiveStatus` · `NumberingSeries.resetPolicy` → `ResetPolicy` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Tenant code ALNOOR (badge) | `Platform.Tenants.code` | read-only |
| **Company Profile** · Company logo (PNG/SVG ≥400 px, ≤2 MB) | `Company.CompanySettings.logoAttachmentId` → `Company.Attachments` (purpose LOGO) | CHECK ≤ 2 MB. |
| Legal name * / Trading name | `CompanySettings.legalName`, `.tradingName` | |
| Company registration (SECP) | `.secpRegNo` | |
| NTN * / STRN | `.ntn`, `.strn` | NTN `1234567-8`; STRN `NN-NN-NNNN-NNN-NN`, required when GST registered. |
| Registered address, City, Province | `.registeredAddress`, `.city`, `.province` | Province PUNJAB/SINDH/ICT/KPK/BALOCHISTAN (+GB/AJK). |
| Phone, Email, Website | `.phone`, `.email`, `.website` | |
| Industry | `.industry` | TRADING_DISTRIBUTION / MANUFACTURING / SERVICES / RETAIL / CONSTRUCTION … |
| Time zone | `.timezone` | Asia/Karachi |
| Legal structure | `.legalStructure` | PRIVATE_LIMITED / PUBLIC_LIMITED / AOP_PARTNERSHIP / SOLE_PROPRIETOR |
| **Branches** · Code | `Company.Branches.code` | LHR / KHI / ISB / FSD / MUL; `{BR}` numbering token. |
| Branch (name + sub-line "Head office · default") | `Branches.name`, `.description`, `.isHeadOffice`, `.isDefault` | One default per tenant. |
| Manager | `Branches.managerUserId` → `Company.Users` | |
| Address | `Branches.address`, `.city`, `.province` | |
| Sales tax authority "Punjab (PRA)" | `Branches.salesTaxAuthority` | PRA / SRB / KPRA / BRA / ICT / FBR |
| Employees | — | HR headcount; Full only. |
| Status Active / Inactive, "Planned Q4" | `Branches.status`, `.openingDate` | |
| **Finance** · Fiscal year starts | `CompanySettings.fyStartMonth` | 7 (July) / 1 / 4 |
| Base currency | `.baseCurrencyCode` → `Company.Currencies` | PKR |
| Amount decimal places | `.amountDecimals` | 2 / 0 / 3 |
| Number format | `.numberFormat` | WESTERN / SOUTH_ASIAN |
| Lock date (no posting before) | `.booksLockDate` | Used by `Company.getBooksLockDate()` in every posting guard. |
| Exchange rate source | `.fxRateSource` | SBP_DAILY / MANUAL (rate table is Full). |
| Allow multi-currency / Require cost centre on expense lines / Allow posting to future periods | `.allowMultiCurrency`, `.requireCostCentreOnExpense`, `.allowFuturePeriodPosting` | |
| Default account mapping (AR control, AP control, Sales revenue, Sales returns, Output GST, Input GST, WHT payable, Salaries payable, Default bank, Retained earnings, Rounding difference, Exchange gain / loss) | `Company.DefaultAccountMappings.role` + `.accountId` → `Accounting.ChartOfAccounts`; Default bank also `.bankAccountId` → `BankCash.BankAccounts` | Roles AR_CONTROL, AP_CONTROL, SALES_REVENUE, SALES_RETURNS, OUTPUT_GST, INPUT_GST, WHT_PAYABLE, SALARIES_PAYABLE, DEFAULT_BANK, RETAINED_EARNINGS, ROUNDING, FX_GAIN_LOSS; the inventory/cash roles (INVENTORY, COGS, GRNI …) are mapped by onboarding from the COA template. |
| Reset to template | reloads from `Platform.ChartOfAccountsTemplateAccounts.defaultRole` | |
| **Sales & Purchases** · Default payment terms | `CompanySettings.defaultCustomerTermsDays` | Net 30 = 30, Due on receipt = 0. |
| Invoice prefix "INV-{YYYY}-" / PO prefix "PO-{YYYY}-" | `Company.NumberingSeries.prefix` + `.pattern` (doc types INV, PO) | Same rows as the Numbering tab. |
| Quotation validity (days) | `.quotationValidityDays` | |
| Default sales tax | `.defaultSalesTaxCodeId` → `Tax.TaxCodes` | GST 18% / 0% / Exempt |
| Invoice terms & conditions | `.invoiceTerms` | |
| On credit limit breach / Overdue tolerance / Block customers overdue > 90 days | `.creditLimitAction`, `.overdueToleranceDays`, `.blockOverdueOver90` | BLOCK_OVERRIDE / WARN / ALLOW |
| Default vendor terms, 3-way match tolerance, Bill approval above | `.defaultVendorTermsDays`, `.threeWayMatchTolerancePct`, `.billApprovalThreshold` | |
| Require approved PO before bill / Auto-deduct WHT u/s 153 / Allow partial goods receipt / Warn on duplicate vendor invoice | `.requireApprovedPoForBill`, `.autoDeductWht153`, `.allowPartialGrn`, `.warnDuplicateVendorInvoice` | |
| (not on this screen) stock adjustment approval threshold | `.stockAdjustmentApprovalThreshold` | Default Rs 25,000; read by the inventory Stock Adjustments screen. |
| **Tax** · "Active taxpayer — FBR ATL · last verified" | `.atlStatus`, `.atlVerifiedAt` | |
| GST registered / STRN / Return period / Standard rate / Further tax / Provincial services tax | `.gstRegistered`, `.strn`, `.salesTaxReturnPeriod`, `.standardGstRatePct`, `.furtherTaxRatePct`, `.provincialTaxAuthority` + `.provincialServicesRatePct` | |
| WHT on goods / services / contracts 153(1)(a)(b)(c) | `Tax.TaxCodes` (WHT codes, filer / non-filer rates) | Managed on Tax Codes; shown here read-only. |
| Default WHT payable account | `DefaultAccountMappings` role WHT_PAYABLE | |
| FBR POS real-time / print FBR QR | — | Full only (FBR integration). |
| **Numbering Series** · Document type | `Company.NumberingSeries.docType` → `Company.DocumentTypes.name` | |
| Prefix | `NumberingSeries.prefix` + `.pattern` | Screen's "JV-{YYYY}-" = prefix JV + pattern `{PREFIX}-{YYYY}-{SEQ6}`. Tokens {YYYY} {YY} {MM} {BR} {SEQn}. |
| Padding | `NumberingSeries.padding` | |
| Next number | `Company.NumberingSeriesCounters.nextValue` (current period) | View `Company.getNumberingSeriesPreview`. |
| Preview "JV-2026-000046" | `Company.getNumberingSeriesPreview.preview` | |
| Reset yearly | `NumberingSeries.resetPolicy` | YEARLY / NEVER (MONTHLY also supported). |
| Add series | new `NumberingSeries` row (optionally per `branchId`) | |
| **Branding** · Brand colours / Primary / Accent | `.brandPrimaryColour`, `.brandAccentColour` | hex |
| Document font, Paper size | `.documentFont`, `.paperSize` | INTER / NOTO_NASTALIQ_URDU; A4 / LETTER |
| Email footer, Show "Powered by Finsoft" | `.emailFooter`, `.showPoweredBy` | |

**Statuses.** branch ACTIVE / INACTIVE · NumberingSeries `isActive`.
**Actions → effects.** *Save* (per tab) → UPDATE `CompanySettings` / UPSERT `DefaultAccountMappings` / `branch` / `NumberingSeries`; each change audited with before/after (Audit Trail shows "Settings · Lock date 31 Jul → 31 Aug"). *Add branch* → INSERT `branch`. *Upload logo* → `attachment` + `logoAttachmentId`. *Discard* → no write.
**Permission.** `comp:view`, `comp:edit`, `comp:export` · **Approval.** —

### Users — `app/settings/users`
*Source:* `src/49-cash-users.html` (section shell) · `src/9E-cash-users.js` (USERS, renderUsers, openUser, openWizard)
**Purpose.** Everyone who can sign in: roles, branches, devices, MFA, invitations and suspension.
**Tables.** Primary: `Company.Users`, `Company.UserRoles`, `Company.UserBranches`, `Company.UserWarehouses` · Reads: `Company.Roles`, `Company.Branches`, `Inventory.Warehouses`, `Company.UserSessions`, `Company.AuditTrailEntries` (activity tab), `Company.getUserKpis`, `Platform.Subscriptions.seats` · Writes: `Company.Users`, `Company.UserRoles`, `Company.UserBranches`, `Company.UserWarehouses`, `Company.PasswordResets`, `Company.UserSessions` (revoke), `Company.AuditTrailEntries`
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo`
**Lookups.** `Users.status` → `UserStatus` · `Users.dataScope` → `DataScope` · `Users.mfaMethod` → `UserMfaMethod` · `Users.loginHours` → `LoginHours` · `Users.ssoProvider` → `UserSsoProvider` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Active users / suspended / external | `Company.getUserKpis.activeUsers`, `.suspendedUsers`, `.externalUsers` | |
| KPI Pending invites | `Company.getUserKpis.pendingInvites` | Basic: users with status INVITED and an open INVITE token. |
| KPI MFA coverage | `Company.getUserKpis.mfaCoveragePct` | active users with `mfaEnabled`. |
| KPI Seats used "n / 25 · Business plan" | `Company.getUserKpis.seatsUsed`, `Platform.Subscriptions.seats` | |
| User (avatar, name, "You", "External", title · EMP id) | `Users.fullName`, `.avatarAttachmentId`, `.isExternal`, `.jobTitle` | Employee link is Full. |
| Email | `Users.email` | |
| Role pill | `Company.UserRoles` (isPrimary) → `Company.Roles.name`, `.icon`, `.tone` | |
| Branch access chips ("All branches") | `Company.UserBranches` | |
| MFA On / Off | `Users.mfaEnabled` | |
| Last active + device | `Users.lastActiveAt`; latest `Company.UserSessions.deviceLabel` | |
| Status Active / Invited / Suspended | `Users.status` | |
| Filters: search, branch, status chips (All / Active / Invited / Suspended / No MFA), role chips | `Users.fullName/email`, `UserBranches.branchId`, `Users.status`, `mfaEnabled`, `UserRoles.roleId` | `appUserNameTrgmIdx` for search. |
| Pending invites panel (email, role, branch, via, by, sent, expires) | INVITED `Users` + `Company.PasswordResets` (purpose INVITE: `channel`, `expiresAt`, `requestedByUserId`) | Rich invite tracking (resend count, revoke) is Full (`Company.UserInvites`). |
| Security posture (MFA by role) | `Company.getUserKpis` per role / `Users.mfaEnabled` grouped by `UserRoles` | |
| Drawer › Profile: Email, Phone, Branches, Approval limit, Data scope, Last active, Member since | `Users.email`, `.phone`, `UserBranches`, `.approvalLimit`, `.dataScope`, `.lastActiveAt`, `.activatedAt` | |
| Drawer › Permissions "Inherited from role" | `Company.getUserEffectivePermissions` | |
| Drawer › Sessions (device, location, IP, last, Unusual location, Revoke, Sign out of all devices) | `Company.UserSessions.deviceLabel`, `.locationLabel`, `.ipAddress`, `.lastActiveAt`, `.isUnusualLocation`, `.revokedAt` | |
| Drawer › Activity | `Company.AuditTrailEntries` where `userId` = user | |
| Wizard › Method: Invite by email / WhatsApp, Create account now (temporary password, require new password at first sign-in) | `Company.PasswordResets` (purpose INVITE, `channel`); `Users.passwordHash`, `.mustChangePassword` | |
| Wizard › Identity: Full name *, Work email *, Mobile, Department, Job title | `Users.fullName`, `.email`, `.phone`, `.department`, `.jobTitle` | "Link existing employee" is Full. |
| Wizard › Role | `Company.UserRoles.roleId` | |
| Wizard › Access: Branches, Warehouses, Modules, Approval limit, Data scope | `Company.UserBranches`, `Company.UserWarehouses` → `Inventory.Warehouses`, `Users.moduleAccess`, `.approvalLimit`, `.dataScope` | OWN / BRANCH / ALL |
| Wizard › Security: Require MFA (Authenticator / SMS), IP restriction, Session timeout, Login hours (Anytime / Business / Custom from–to) | `Users.mfaEnabled`, `.mfaMethod`, `.ipRestricted`, `.ipAllowlist`, `.sessionTimeoutMin`, `.loginHours`, `.loginFrom`, `.loginTo` | |

**Statuses.** INVITED → ACTIVE (invite accepted) · ACTIVE ⇄ SUSPENDED (Suspend / Reactivate) · REMOVED (soft, `deletedAt`).
**Actions → effects.** *Add user / Send invite* → INSERT `Users` (INVITED) + `UserRoles` + `UserBranches` + `UserWarehouses` + `PasswordResets` (INVITE, 7 days); *Create account now* → `Users` ACTIVE with temporary hash. *Edit access* → updates the same rows. *Suspend* → status SUSPENDED, `suspendedAt`, revokes all sessions (revokeReason SUSPENDED); cannot suspend yourself. *Reset MFA* → clears `mfaSecretEnc`, `mfaRecoveryCodes`, audit MFA_RESET. *Send password reset* → `PasswordResets` ADMIN_RESET. *Revoke session* → `UserSessions.revokedAt` (ADMIN_REVOKED), audit SESSION_REVOKED. *Enforce MFA* → `mfaEnabled = true` for the selected users (enrolment at next sign-in). *Export* → audit EXPORT. *Transfer ownership* → moves the OWNER role (confirmation by email).
**Permission.** `usr:view`, `usr:create`, `usr:edit`, `usr:delete`, `usr:export` · **Approval.** —

### Roles & Permissions — `app/settings/roles`
*Source:* `src/49-cash-users.html` (section shell) · `src/9E-cash-users.js` (ROLES, GROUPS, ACT, grantDefault, rolesMount, conflicts)
**Purpose.** Define what each role can view, create, edit, approve, post, delete and export, per module.
**Tables.** Primary: `Company.Roles`, `Company.RolePermissions` · Reads: `Company.Permissions`, `Company.UserRoles`, `Company.Users` · Writes: `Company.Roles`, `Company.RolePermissions`, `Company.AuditTrailEntries` (action PERMISSION)
**Functions.** Save → `Company.roleAddUpdate` · Open → `Company.getRoleInfo`
**Lookups.** `Roles.systemKey` → `SystemKey` · `Roles.tone` → `RoleTone` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Roles list (name, icon, "System"/"Custom", user count) | `Company.Roles.name`, `.icon`, `.tone`, `.isSystem`, `.systemKey`; count of `Company.UserRoles` | System roles: OWNER, FINANCE_MANAGER, ACCOUNTANT, HR_MANAGER, PAYROLL_OFFICER, SALES_EXECUTIVE, STOREKEEPER, AUDITOR. |
| Role header: description, users with this role, "Branch-restricted" switch | `Roles.description`; `UserRoles`; `Roles.branchRestricted` | |
| Matrix group tabs (Finance, Sales & Purchases, Inventory, HR & Payroll, System) | `Company.Permissions.module` | FINANCE / SALES_PURCHASES / INVENTORY / HR_PAYROLL / SYSTEM |
| Module rows (Chart of accounts, Journal vouchers, Sales invoices …) | `Company.Permissions.resource`, `.resourceLabel` | coa, vch, cash, bank, recon, fa, bud, tax, close, frep, quo, sinv, rcpt, cust, po, bill, vpay, vend, item, grn, adj, xfer, wh, irep, emp, att, lv, prun, loan, fs, hrep, comp, usr, rol, wf, intg, aud, bak |
| Columns View / Create / Edit / Approve / Post / Delete / Export | `Company.Permissions.action` | VIEW … EXPORT; "—" = no permission row exists for that cell. |
| Ticked cell | `Company.RolePermissions (roleId, permissionCode)` | e.g. `sinv:post`. |
| "Last changed by … · date" | `Company.AuditTrailEntries` (table RolePermissions, latest) | |
| New role / Duplicate role modal: Role name *, Description, Copy permissions from | `Roles.name`, `.description`, `.copiedFromRoleId` + copied `RolePermissions` rows | |
| Segregation-of-duties banners | computed in the app in Basic; rule table `Company.SegregationOfDutiesRules` is Full | |
| Data limits panel (max voucher, discount, back-dating, salary visibility) | — | Full only (`Company.RoleLimits`). Basic uses `Users.approvalLimit`. |

**Statuses.** —
**Actions → effects.** *Toggle cell / row / column* → draft in the UI; *Save changes* → INSERT/DELETE `RolePermissions` rows, one `AuditTrailEntries` PERMISSION entry per change ("+ Post on Payroll"). *Discard* → none. *Create role* → INSERT `role` + copied permissions. System roles cannot be deleted (CHECK `roleSystemNotDeletedChk`).
**Permission.** `rol:view`, `rol:create`, `rol:edit`, `rol:delete`, `rol:export` · **Approval.** —

### Audit Trail — `app/settings/audit`
*Source:* `src/60-settings-ess.html` (section `app/settings/audit`, drawer `set-audit-diff`)
**Purpose.** Immutable, hash-chained log of every create, edit, post, delete, login and permission change.
**Tables.** Primary: `Company.AuditTrailEntries` (partitioned by month) · Reads: `Company.getAuditTrail`, `Company.AuditTrailSeals`, `Company.Users`, `Company.UserRoles` · Writes: `Company.AuditTrailEntries` (EXPORT entry only)

| UI field / column | Table.column | Notes |
|---|---|---|
| Banner "Hash chain verified — n entries · last block · SHA-256 verified" | `Company.AuditTrailSeals.blockNo`, `.lastLogId`, `.sealedAt`; count of `AuditTrailEntries` | *Verify chain* recomputes each block's `sealHash`. |
| Search record, user or IP | `AuditTrailEntries.recordLabel`, user name, `.ipAddress` | |
| Module filter (Vouchers, Sales, Payroll, Settings, Users) | `AuditTrailEntries.module` (or derived from `schemaName`) | |
| User filter | `AuditTrailEntries.userId` | |
| Period (Last 7 days / Today / This month / Custom) | `AuditTrailEntries.occurredAt` | Partition pruning. |
| Action chips All / Create / Edit / Post / Delete / Login | `AuditTrailEntries.action` | INSERT / UPDATE / POST / DELETE / LOGIN (+ LOGIN_FAILED, PERMISSION, EXPORT …). |
| Timestamp | `AuditTrailEntries.occurredAt` | |
| User (name, role) | `AuditTrailEntries.userId` → `Users.fullName`; role via `UserRoles`; failed logins show `actorEmail` | |
| Module, Action | `AuditTrailEntries.module`, `.action` | |
| Record (JV-2026-000045) | `AuditTrailEntries.recordLabel` (+ `tableName`, `recordId` for the link) | |
| IP address | `AuditTrailEntries.ipAddress` | |
| Change "Status: Approved → Posted" | summary of `AuditTrailEntries.changes` | |
| Drawer: IP / device, Session | `.ipAddress`, `.userAgent`, `.sessionId` | |
| Drawer: Entry hash / Previous hash | `.entryHash`; previous = `entryHash` of the prior id (`Company.getAuditTrail.prevEntryHash`) | |
| Drawer: Field / Before / After | `AuditTrailEntries.changes` → `{"field": {"before","after"}}` | Secrets show "[redacted]". |
| Showing 1–10 of 3,418 this week | count over the filter | |

**Statuses.** "Chain intact" / break detected (verification result, not stored per row).
**Actions → effects.** *Verify chain* → recomputes seals (read-only). *Export CSV* → file download + `AuditTrailEntries` EXPORT. Rows are never updated or deleted (`triggerAppendOnly`, no DELETE grant).
**Permission.** `aud:view`, `aud:export` · **Approval.** —

### Notification Centre — `app/notifications`
*Source:* `src/40-acc-core.html` (section `app/notifications`)
**Purpose.** Approvals, finance alerts, HR events and system messages in one inbox, with delivery-channel preferences.
**Tables.** Primary: `Company.Notifications` · Reads: `Company.getNotificationSummary`, `Company.UserPreferences` · Writes: `Company.Notifications` (readAt), `Company.UserPreferences`

| UI field / column | Table.column | Notes |
|---|---|---|
| Tabs All / Approvals / Finance / HR / System (counts) | `Notifications.category` | APPROVALS / FINANCE / HR / SYSTEM |
| Groups Today / Yesterday / Earlier this week | `Notifications.createdAt` | |
| Title ("Hira Ali submitted JV-2026-000045 for approval") | `Notifications.title` | |
| Sub-line ("Payroll accrual · Rs 14,620,000 · 08:42 AM") | `Notifications.body`, `.amount`, `.createdAt` | |
| Link target | `Notifications.linkRoute`, `.entityType`, `.entityId` | |
| Unread / Read | `Notifications.readAt` | |
| Summary: Unread, Needs action, Mentions, Total received (7 days) | `Company.getNotificationSummary.unread`, `.needsAction`, `.mentions`, `.total7d` | from `readAt`, `needsAction`, `isMention`. |
| Delivery channels: In-app, Email digest (daily 08:00), SMS for approvals above Rs 1M, WhatsApp cheque maturity alerts | `Company.UserPreferences.notifyInApp`, `.notifyEmailDigest` + `.emailDigestTime`, `.notifySmsApprovalsAbove`, `.notifyWhatsapp` | |

**Statuses.** Unread → Read · Archived.
**Actions → effects.** *Open* → sets `readAt`. *Mark all read* → UPDATE all unread rows of the user. *Preferences* → `app/profile`.
**Permission.** any signed-in user (own rows only) · **Approval.** —

### My Profile — `app/profile`
*Source:* `src/60-settings-ess.html` (section `app/profile`, tabs prof-profile, prof-security, prof-prefs)
**Purpose.** The signed-in user's personal details, password, MFA, sessions and preferences.
**Tables.** Primary: `Company.Users`, `Company.UserPreferences`, `Company.UserSessions` · Reads: `Company.UserRoles`/`Company.Roles`, `Company.UserBranches`, `Company.AuditTrailEntries` (recent activity) · Writes: `Company.Users`, `Company.UserPreferences`, `Company.UserSessions`, `Company.Attachments` (photo), `Company.AuditTrailEntries`
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo` ‖ Save → `Company.userPreferenceAddUpdate` · Open → `Company.getUserPreferenceInfo`
**Lookups.** `Users.status` → `UserStatus` · `Users.dataScope` → `DataScope` · `Users.mfaMethod` → `UserMfaMethod` · `Users.loginHours` → `LoginHours` · `Users.ssoProvider` → `UserSsoProvider` · `UserPreferences.language` → `EnUrLanguage` · `UserPreferences.dateFormat` → `DateFormat` · `UserPreferences.numberFormat` → `NumberFormat` · `UserPreferences.startRoute` → `StartRoute` · `UserPreferences.theme` → `Theme` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Header: name, role, department, branch, email, "MFA on", "Member since" | `Users.fullName`, role, `.department`, `defaultBranchId` → `Branches.name`, `.email`, `.mfaEnabled`, `.activatedAt` | |
| Change photo | `Users.avatarAttachmentId` → `Company.Attachments` (AVATAR) | |
| First name, Last name, Display name, Job title | `Users.firstName`, `.lastName`, `.fullName`, `.jobTitle` | |
| Email (disabled) | `Users.email` | Changed only by an admin. |
| Mobile | `Users.phone` | |
| Default branch | `Users.defaultBranchId` | must be one of `UserBranches`. |
| Linked employee EMP-0007 (disabled) | — | Full only (`Users.employeeId`). |
| Email signature | `Users.emailSignature` | |
| Access summary: Role, Branches, Approval limit, Last sign-in | `UserRoles`, `UserBranches`, `Users.approvalLimit`, `.lastLoginAt` | |
| Recent activity | `Company.AuditTrailEntries` where `userId` = me | |
| Change password (current, new, confirm; "Last changed 64 days ago"; min 12 chars) | `Users.passwordHash`, `.passwordChangedAt` | |
| Two-factor authentication: setup key, 6-digit code, Recovery codes | `Users.mfaSecretEnc`, `.mfaMethod`, `.mfaEnabled`, `.mfaRecoveryCodes` | |
| Active sessions (Device, Location, IP, Signed in, Last active, Revoke, Revoke all others) | `Company.UserSessions.deviceLabel`, `.locationLabel`, `.ipAddress`, `.signedInAt`, `.lastActiveAt`, `.revokedAt` | |
| Language, Date format, Number format, Start page, Theme, Compact tables, Show account codes | `Company.UserPreferences.language`, `.dateFormat`, `.numberFormat`, `.startRoute`, `.theme`, `.compactTables`, `.showAccountCodes` | |
| Notifications toggles (approvals assigned, vouchers rejected, bank alerts, credit breaches, daily cash email 08:00, tax due, WhatsApp) | `UserPreferences.notifyEvents` (APPROVAL_ASSIGNED, DOC_REJECTED, BANK_ALERT, CREDIT_BREACH, DAILY_CASH_POSITION, TAX_DUE), `.notifyWhatsapp` | |

**Statuses.** —
**Actions → effects.** *Save profile* → UPDATE `Users`. *Update password* → new hash, `passwordChangedAt`, revoke other sessions (PASSWORD_CHANGED), audit PASSWORD_RESET (redacted). *Verify authenticator* → `mfaEnabled = true`. *Recovery codes* → regenerates `mfaRecoveryCodes`. *Revoke / Revoke all others* → `UserSessions.revokedAt` (USER_REVOKED). *Save preferences* → UPSERT `UserPreferences`.
**Permission.** any signed-in user (own record) · **Approval.** —

### No access — `app/unauthorized`
*Source:* `src/60-settings-ess.html` (section `app/unauthorized`)
**Purpose.** Explains the missing permission and lets the user request access from an administrator.
**Tables.** Primary: `Company.Notifications` · Reads: `Company.UserRoles`/`Company.Roles`, `Company.getUserEffectivePermissions`, `Company.Users` (admins holding `rol:edit`) · Writes: `Company.Notifications`

| UI field / column | Table.column | Notes |
|---|---|---|
| "Your role Sales Executive doesn't include … Payroll › Run Payroll" | `Company.Roles.name`; missing `Company.Permissions.code` (e.g. `prun:view`) | |
| Request access from (Owner / HR Manager) | `Company.Users` with `rol:edit` | |
| Reason | `Company.Notifications.body` | |

**Statuses.** —
**Actions → effects.** *Request access* → INSERT `notification` for the chosen admin (category SYSTEM, eventCode ACCESS_REQUEST, `needsAction` = true, `linkRoute` = `app/settings/roles`).
**Permission.** any signed-in user · **Approval.** —

### Page not found — `app/404`
*Source:* `src/60-settings-ess.html` (section `app/404`)
**Purpose.** Pure UI error page ("Error reference NF-…", links to dashboard / Today's work).
**Tables.** no data (the error reference is a client-side correlation id; nothing is stored).
**Statuses.** — · **Actions → effects.** *Report a problem* → opens Audit Trail (no write).
**Permission.** — · **Approval.** —
