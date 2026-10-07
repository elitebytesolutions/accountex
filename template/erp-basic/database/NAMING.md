# Finsoft database naming (Basic edition)

Every object follows one convention, so a table can be found from the screen that shows it.

| Object | Style | Example |
|---|---|---|
| Schema (module) | PascalCase full name | `"Sales"`, `"FixedAssets"`, `"BankCash"` |
| Table | PascalCase, plural, named after its screen | `"Sales"."SalesInvoices"`, `"Company"."UserRoles"` |
| Column | camelCase | `"customerId"`, `"docNo"`, `status` |
| View (report read model) | camelCase `get<Report>` | `"Accounting"."getTrialBalance"` |
| Save function (insert + update) | `<entity>AddUpdate(jsonb)` | `"Sales"."salesInvoiceAddUpdate"` |
| Read function | `get<Entity>Info(uuid)` | `"Sales"."getSalesInvoiceInfo"` |
| Action function (screen button) | `<entity><Action>` | `"Sales"."salesInvoicePost"` |
| Trigger function | `trigger<What>` | `"Inventory"."triggerStockLedgerApply"` |
| Index / constraint / trigger | camelCase | `"salesInvoicesDocNoKey"` |
| Enumeration value | a row in `"Lookups"."Lookups"` — never a CHECK list | type `SalesInvoiceStatus`, code `POSTED`, label "Posted" |

No name contains an underscore. Names with capitals are always written in double quotes in SQL:

```sql
SELECT i."docNo", c."displayName", i.status
  FROM "Sales"."SalesInvoices" i
  JOIN "Sales"."Customers" c ON c.id = i."customerId"
 WHERE i."tenantId" = "Company"."getCurrentTenantId"();
```

Enumeration codes (`POSTED`, `PARTIALLY_PAID`) are **data**, not names: they are the values stored in the
columns and compared by the posting logic; each has a readable label and badge tone in `"Lookups"."Lookups"`.

Full old → new map (every schema, table, column, view and function): [`naming/rename-map.csv`](naming/rename-map.csv).

## Platform

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `audit_log` | **PlatformAuditLogs** | — | LOG | result→PlatformAuditLogResult |
| `coa_template` | **ChartOfAccountsTemplates** | `chartOfAccountsTemplateAddUpdate` · `getChartOfAccountsTemplateInfo` | MASTER | status→ChartOfAccountsTemplateStatus |
| `coa_template_account` | **ChartOfAccountsTemplateAccounts** | via `ChartOfAccountsTemplates` (accounts) | CHILD | nature→Nature |
| `plan` | **SubscriptionPlans** | `subscriptionPlanAddUpdate` · `getSubscriptionPlanInfo` | MASTER | status→SubscriptionPlanStatus |
| `plan_feature` | **SubscriptionPlanFeatures** | via `SubscriptionPlans` (features) | JOIN | moduleKey→ModuleKey, inclusion→Inclusion |
| `staff_user` | **PlatformStaff** | `platformStaffMemberAddUpdate` · `getPlatformStaffMemberInfo` | MASTER | role→PlatformStaffMemberRole, mfaType→MfaType, tenantScope→TenantScope, status→PlatformStaffMemberStatus |
| `subscription` | **Subscriptions** | `subscriptionAddUpdate` · `getSubscriptionInfo` | MASTER | billingCycle→BillingCycle, paymentMethod→DunningCasePaymentMethod, status→SubscriptionStatus |
| `tenant` | **Tenants** | `tenantAddUpdate` · `getTenantInfo` | MASTER | industry→TenantIndustry, province→Province, numberFormat→NumberFormat, dataResidency→DataResidency, defaultLanguage→DefaultLanguage, status→TenantStatus |
| `tenant_contact` | **TenantContacts** | — | CHILD | contactRole→ContactRole, language→EnUrLanguage |
| `tenant_module` | **TenantModules** | — | CHILD | moduleKey→ModuleKey, source→TenantModuleSource |

| View | New name |
|---|---|
| `v_admin_dashboard` | **getPlatformOverview** |
| `v_mrr_by_plan` | **getMrrByPlan** |
| `v_mrr_movement` | **getMrrMovement** |
| `v_subscription_kpi` | **getSubscriptionKpis** |
| `v_tenant_attention` | **getTenantsNeedingAttention** |
| `v_tenant_overview` | **getAllTenants** |

## Company

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `account_role` | **PostingRoles** | — | HELPER | roleGroup→RoleGroup, normalBalance→NormalBalance |
| `app_user` | **Users** | `userAddUpdate` · `getUserInfo` | MASTER | status→UserStatus, dataScope→DataScope, mfaMethod→UserMfaMethod, loginHours→LoginHours, ssoProvider→UserSsoProvider |
| `attachment` | **Attachments** | — | HELPER | purpose→AttachmentPurpose |
| `audit_log` | **AuditTrailEntries** | — | LOG | action→AuditTrailEntryAction, module→AuditTrailEntryModule |
| `audit_log_default` | **AuditTrailEntriesDefault** | — | PARTITION |  |
| `audit_seal` | **AuditTrailSeals** | — | LOG |  |
| `branch` | **Branches** | `branchAddUpdate` · `getBranchInfo` | MASTER | province→Province, salesTaxAuthority→SalesTaxAuthority, status→ActiveInactiveStatus |
| `company_profile` | **CompanySettings** | `companySettingAddUpdate` · `getCompanySettingInfo` | CONFIG | province→Province, industry→CompanySettingIndustry, legalStructure→LegalStructure, numberFormat→NumberFormat, fxRateSource→FxRateSource, creditLimitAction→CreditLimitAction, salesTaxReturnPeriod→SalesTaxReturnPeriod, provincialTaxAuthority→ProvincialTaxAuthority, atlStatus→CompanySettingAtlStatus, documentFont→DocumentFont, paperSize→PaperSize |
| `company_setting` | **CompanySettingValues** | — | HELPER | settingGroup→SettingGroup |
| `currency` | **Currencies** | — | HELPER |  |
| `default_account_map` | **DefaultAccountMappings** | `defaultAccountMappingAddUpdate` · `getDefaultAccountMappingInfo` | MASTER |  |
| `doc_sequence` | **NumberingSeries** | `numberingSeriesAddUpdate` · `getNumberingSeriesInfo` | MASTER | resetPolicy→ResetPolicy |
| `doc_sequence_counter` | **NumberingSeriesCounters** | — | HELPER |  |
| `doc_type` | **DocumentTypes** | — | HELPER | module→DocumentTypeModule, defaultResetPolicy→DefaultResetPolicy |
| `notification` | **Notifications** | — | LOG | category→NotificationCategory, severity→NotificationSeverity |
| `password_reset` | **PasswordResets** | — | HELPER | purpose→PasswordResetPurpose, channel→PasswordResetChannel |
| `permission` | **Permissions** | — | HELPER | module→PermissionModule, action→PermissionAction |
| `role` | **Roles** | `roleAddUpdate` · `getRoleInfo` | MASTER | systemKey→SystemKey, tone→RoleTone |
| `role_permission` | **RolePermissions** | via `Roles` (permissions) | JOIN |  |
| `user_branch` | **UserBranches** | via `Users` (branches) | JOIN |  |
| `user_preference` | **UserPreferences** | `userPreferenceAddUpdate` · `getUserPreferenceInfo` | CONFIG | language→EnUrLanguage, dateFormat→DateFormat, numberFormat→NumberFormat, startRoute→StartRoute, theme→Theme |
| `user_role` | **UserRoles** | via `Users` (roles) | JOIN |  |
| `user_session` | **UserSessions** | — | LOG | clientType→ClientType, authMethod→UserSessionAuthMethod, revokeReason→RevokeReason |
| `user_warehouse` | **UserWarehouses** | via `Users` (warehouses) | JOIN |  |

| View | New name |
|---|---|
| `v_audit_trail` | **getAuditTrail** |
| `v_dash_cash_bank` | **getDashboardCashAndBank** |
| `v_dash_expense_month` | **getDashboardMonthlyExpenses** |
| `v_dash_money_flow` | **getDashboardMoneyFlow** |
| `v_dash_recent_transactions` | **getDashboardRecentTransactions** |
| `v_dash_revenue_daily` | **getDashboardDailyRevenue** |
| `v_dash_revenue_month` | **getDashboardMonthlyRevenue** |
| `v_doc_sequence_preview` | **getNumberingSeriesPreview** |
| `v_notification_summary` | **getNotificationSummary** |
| `v_user_effective_permission` | **getUserEffectivePermissions** |
| `v_user_kpis` | **getUserKpis** |

## Accounting

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `account` | **ChartOfAccounts** | `accountAddUpdate` · `getAccountInfo` | MASTER | nature→Nature, kind→AccountKind, subType→AccountSubType, status→ActiveInactiveStatus |
| `cost_centre` | **CostCentres** | `costCentreAddUpdate` · `getCostCentreInfo` | MASTER | status→ActiveInactiveStatus |
| `fiscal_period` | **FiscalPeriods** | via `FiscalYears` (periods) | CHILD | status→OpenClosedLockedStatus |
| `fiscal_year` | **FiscalYears** | `fiscalYearAddUpdate` · `getFiscalYearInfo` | MASTER | status→OpenClosedStatus |
| `journal_entry` | **Vouchers** | `voucherAddUpdate` · `getVoucherInfo` | DOCUMENT | voucherType→VoucherType, instrumentType→VoucherInstrumentType, status→VoucherStatus, reversalReason→ReversalReason |
| `journal_line` | **VoucherLines** | via `Vouchers` (lines) | LINE |  |
| `opening_balance_batch` | **OpeningBalances** | `openingBalanceAddUpdate` · `getOpeningBalanceInfo` | DOCUMENT | status→OpeningBalanceStatus |
| `opening_balance_line` | **OpeningBalanceLines** | via `OpeningBalances` (lines) | LINE |  |

| View | New name |
|---|---|
| `v_account_balance` | **getAccountBalances** |
| `v_account_tree` | **getAccountTree** |
| `v_balance_sheet` | **getBalanceSheet** |
| `v_day_book` | **getDayBook** |
| `v_general_ledger` | **getGeneralLedger** |
| `v_ledger_line` | **getLedgerLines** |
| `v_period_summary` | **getFiscalPeriodSummary** |
| `v_profit_loss` | **getProfitAndLoss** |
| `v_trial_balance` | **getTrialBalance** |
| `v_voucher_register` | **getVoucherRegister** |

## BankCash

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `bank` | **Banks** | `bankAddUpdate` · `getBankInfo` | MASTER |  |
| `bank_account` | **BankAccounts** | `bankAccountAddUpdate` · `getBankAccountInfo` | MASTER | accountType→AccountType, purpose→BankAccountPurpose, statementFormat→StatementFormat, status→BankAccountStatus |
| `bank_transaction` | **BankTransactions** | — | LEDGER | paymentMode→BankTransactionPaymentMode, category→BankTransactionCategory, source→BankTransactionSource, status→BankTransactionStatus |
| `cash_account` | **CashAccounts** | `cashAccountAddUpdate` · `getCashAccountInfo` | MASTER | kind→CashAccountKind |
| `cash_category` | **CashCategories** | `cashCategoryAddUpdate` · `getCashCategoryInfo` | MASTER | direction→CashCategoryDirection, voucherType→CashCategoryVoucherType, partyKind→PartyKind |
| `cash_day_close` | **CashDayCloses** | `cashDayCloseAddUpdate` · `getCashDayCloseInfo` | DOCUMENT | status→CashDayCloseStatus |
| `cash_denomination_count` | **CashDayCloseDenominations** | via `CashDayCloses` (denominations) | CHILD |  |
| `cashbook_entry` | **CashBookEntries** | — | HELPER | entryKind→EntryKind, paymentMode→CashBookEntryPaymentMode |
| `cheque` | **Cheques** | `chequeAddUpdate` · `getChequeInfo` | DOCUMENT | direction→ReceivedIssuedDirection, postingMode→PostingMode, status→ChequeStatus |
| `cheque_allocation` | **ChequeAllocations** | via `Cheques` (allocations) | CHILD |  |
| `cheque_bounce` | **ChequeBounces** | — | LOG | reason→ChequeBounceReason, resolution→Resolution |

| View | New name |
|---|---|
| `v_bank_account_balance` | **getBankAccountBalances** |
| `v_bank_book` | **getBankBook** |
| `v_cash_book` | **getCashBook** |
| `v_cheque_register` | **getChequeRegister** |
| `v_pdc_maturity` | **getPdcMaturity** |

## Tax

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `tax_code` | **TaxCodes** | `taxCodeAddUpdate` · `getTaxCodeInfo` | MASTER | taxType→TaxType, appliesTo→TaxCodeAppliesTo, rateBasis→RateBasis, salesTaxKind→SalesTaxKind |
| `tax_code_rate` | **TaxCodeRates** | via `TaxCodes` (rates) | CHILD |  |

| View | New name |
|---|---|
| `v_sales_tax_output` | **getSalesTaxOutputRegister** |

## Sales

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `credit_note` | **CreditNotes** | `creditNoteAddUpdate` · `getCreditNoteInfo` | DOCUMENT | reason→CreditNoteReason, treatment→CreditNoteTreatment, status→CreditNoteStatus |
| `credit_note_line` | **CreditNoteLines** | via `CreditNotes` (lines) | LINE |  |
| `customer` | **Customers** | `customerAddUpdate` · `getCustomerInfo` | MASTER | customerType→CustomerType, atlStatus→CustomerAtlStatus, province→Province, paymentTerms→CustomerPaymentTerms, status→CustomerStatus, holdReason→CustomerHoldReason |
| `customer_contact` | **CustomerContacts** | via `Customers` (contacts) | CHILD |  |
| `customer_group` | **CustomerGroups** | `customerGroupAddUpdate` · `getCustomerGroupInfo` | MASTER |  |
| `customer_note` | **CustomerNotes** | via `Customers` (notes) | CHILD |  |
| `invoice` | **SalesInvoices** | `salesInvoiceAddUpdate` · `getSalesInvoiceInfo` | DOCUMENT | channel→SalesInvoiceChannel, paymentTerms→CustomerPaymentTerms, saleType→SaleType, deliverySlot→DeliverySlot, status→SalesInvoiceStatus, fbrStatus→FbrStatus |
| `invoice_line` | **SalesInvoiceLines** | via `SalesInvoices` (lines) | LINE |  |
| `price_list` | **PriceLists** | `priceListAddUpdate` · `getPriceListInfo` | MASTER | status→ActiveInactiveStatus |
| `price_list_item` | **PriceListItems** | via `PriceLists` (items) | CHILD |  |
| `quotation` | **Quotations** | `quotationAddUpdate` · `getQuotationInfo` | DOCUMENT | status→QuotationStatus |
| `quotation_line` | **QuotationLines** | via `Quotations` (lines) | LINE |  |
| `receipt` | **CustomerReceipts** | `customerReceiptAddUpdate` · `getCustomerReceiptInfo` | DOCUMENT | method→CustomerReceiptMethod, whtCertificateStatus→WhtCertificateStatus2, status→CustomerReceiptStatus |
| `receipt_allocation` | **CustomerReceiptAllocations** | — | CHILD | targetType→CustomerReceiptAllocationTargetType |
| `sales_order` | **SalesOrders** | `salesOrderAddUpdate` · `getSalesOrderInfo` | DOCUMENT | paymentTerms→CustomerPaymentTerms, status→SalesOrderStatus |
| `sales_order_line` | **SalesOrderLines** | via `SalesOrders` (lines) | LINE |  |

| View | New name |
|---|---|
| `v_ar_ageing` | **getReceivablesAgeing** |
| `v_credit_exposure` | **getCustomerCreditExposure** |
| `v_customer_balance` | **getCustomerBalances** |
| `v_customer_credit_position` | **getCustomerCreditPosition** |
| `v_customer_statement` | **getCustomerStatement** |
| `v_open_items` | **getReceivableOpenItems** |
| `v_sales_by_customer` | **getSalesByCustomer** |
| `v_sales_by_item` | **getSalesByItem** |
| `v_sales_register` | **getSalesRegister** |

## Purchases

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `bill` | **VendorBills** | `vendorBillAddUpdate` · `getVendorBillInfo` | DOCUMENT | channel→VendorBillChannel, captureMethod→CaptureMethod, payMode→VendorBillPayMode, matchStatus→VendorBillMatchStatus, status→VendorBillStatus |
| `bill_line` | **VendorBillLines** | via `VendorBills` (lines) | LINE | whtSection→WhtSection |
| `debit_note` | **DebitNotes** | `debitNoteAddUpdate` · `getDebitNoteInfo` | DOCUMENT | reason→DebitNoteReason, settlement→DebitNoteSettlement, status→DebitNoteStatus |
| `debit_note_line` | **DebitNoteLines** | via `DebitNotes` (lines) | LINE |  |
| `grn` | **GoodsReceivedNotes** | `goodsReceivedNoteAddUpdate` · `getGoodsReceivedNoteInfo` | DOCUMENT | qcStatus→QcStatus, matchStatus→GoodsReceivedNoteMatchStatus, billStatus→BillStatus, status→DraftPostedCancelledStatus |
| `grn_line` | **GoodsReceivedNoteLines** | via `GoodsReceivedNotes` (lines) | LINE | rejectReason→RejectReason |
| `payment_allocation` | **VendorPaymentAllocations** | via `VendorPayments` (allocations) | CHILD |  |
| `purchase_order` | **PurchaseOrders** | `purchaseOrderAddUpdate` · `getPurchaseOrderInfo` | DOCUMENT | paymentTerms→PurchaseOrderPaymentTerms, status→PurchaseOrderStatus |
| `purchase_order_line` | **PurchaseOrderLines** | via `PurchaseOrders` (lines) | LINE |  |
| `vendor` | **Vendors** | `vendorAddUpdate` · `getVendorInfo` | MASTER | atlStatus→VendorAtlStatus, defaultWhtSection→DefaultWhtSection, paymentTerms→PurchaseOrderPaymentTerms, status→ActiveInactiveStatus |
| `vendor_category` | **VendorCategories** | `vendorCategoryAddUpdate` · `getVendorCategoryInfo` | MASTER |  |
| `vendor_contact` | **VendorContacts** | via `Vendors` (contacts) | CHILD |  |
| `vendor_payment` | **VendorPayments** | `vendorPaymentAddUpdate` · `getVendorPaymentInfo` | DOCUMENT | method→VendorPaymentMethod, whtTreatment→WhtTreatment, whtSection→WhtSection, status→VendorPaymentStatus |

| View | New name |
|---|---|
| `v_ap_ageing` | **getPayablesAgeing** |
| `v_purchase_register` | **getPurchaseRegister** |
| `v_three_way_match` | **getThreeWayMatch** |
| `v_vendor_balance` | **getVendorBalances** |
| `v_vendor_statement` | **getVendorStatement** |
| `v_wht_deducted` | **getVendorWhtDeducted** |

## Inventory

| Table | Screen-based name | Entity (functions) | Role | Lookup columns |
|---|---|---|---|---|
| `batch` | **ProductBatches** | `productBatchAddUpdate` · `getProductBatchInfo` | MASTER | disposition→ProductBatchDisposition |
| `bin` | **WarehouseBins** | `warehouseBinAddUpdate` · `getWarehouseBinInfo` | MASTER |  |
| `item` | **Products** | `productAddUpdate` · `getProductInfo` | MASTER | status→ProductStatus |
| `item_barcode` | **ProductBarcodes** | via `Products` (barcodes) | CHILD | kind→ProductBarcodeKind |
| `item_uom` | **ProductUnits** | via `Products` (units) | CHILD |  |
| `manual_stock_entry` | **StockInOut** | `stockInOutEntryAddUpdate` · `getStockInOutEntryInfo` | DOCUMENT | mode→StockInOutEntryMode, status→DraftPostedCancelledStatus |
| `manual_stock_entry_line` | **StockInOutEntryLines** | via `StockInOut` (lines) | LINE |  |
| `manufacturer` | **ProductCompanies** | `productCompanyAddUpdate` · `getProductCompanyInfo` | MASTER | status→ActiveInactiveStatus |
| `movement_reason` | **StockMovementReasons** | `stockMovementReasonAddUpdate` · `getStockMovementReasonInfo` | CONFIG | direction→StockMovementReasonDirection, ledgerMovementType→StockMovementReasonLedgerMovementType |
| `product_class` | **ProductClasses** | `productClassAddUpdate` · `getProductClassInfo` | MASTER |  |
| `product_subclass` | **ProductSubclasses** | via `ProductClasses` (subclasses) | CHILD |  |
| `stock_adjustment` | **StockAdjustments** | `stockAdjustmentAddUpdate` · `getStockAdjustmentInfo` | DOCUMENT | status→StockAdjustmentStatus |
| `stock_adjustment_line` | **StockAdjustmentLines** | via `StockAdjustments` (lines) | LINE |  |
| `stock_balance` | **StockBalances** | — | HELPER |  |
| `stock_ledger` | **StockMovements** | — | LEDGER | movementType→MovementType |
| `stock_transfer` | **StockTransfers** | `stockTransferAddUpdate` · `getStockTransferInfo` | DOCUMENT | status→StockTransferStatus |
| `stock_transfer_line` | **StockTransferLines** | — | LINE |  |
| `uom` | **UnitsOfMeasure** | `unitOfMeasureAddUpdate` · `getUnitOfMeasureInfo` | MASTER | kind→UnitOfMeasureKind |
| `warehouse` | **Warehouses** | `warehouseAddUpdate` · `getWarehouseInfo` | MASTER | type→WarehouseType, status→ActiveInactiveStatus |

| View | New name |
|---|---|
| `v_near_expiry` | **getNearExpiryStock** |
| `v_stock_card` | **getStockCard** |
| `v_stock_on_hand` | **getWholeStock** |
| `v_stock_valuation` | **getStockValuation** |
