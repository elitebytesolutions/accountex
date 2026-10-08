import { E, POST_RULES, type Phase } from "./types";

// Workspace transactions: posting, approval, reversal and immutability apply.

export const transactions: Phase[] = [
  {
    no: 16, title: "General ledger", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "The approval engine and the core journal: vouchers, opening balances and recurring vouchers.",
    reports: ["Trial Balance", "General Ledger", "Day Book", "Account Ledger"],
    entities: [
      E("approvals", "Approvals Inbox", ["Company.Approvals", "Company.ApprovalActions"], {
        tpl: ["app/approvals"], api: "approvals", perm: ["wf"],
        x: ["GET /approvals/inbox (Company.getApprovalsInbox)", "POST /approvals/:id/approve|reject|request-changes|delegate", "POST /approvals/bulk"],
        rules: ["Engine used by every later document type", "Requester cannot approve own document (segregation of duties)", "Every action is an ApprovalActions row", "Full Phase 2 workflow steps (role/user/line manager, ANY/ALL, amount thresholds, delegation); inbox open to every signed-in user for their own items; SLA reminders later (decided 2026-10-07)"],
        deps: ["approval-workflows", "users"],
      }),
      E("vouchers", "Journal Vouchers", ["Accounting.Vouchers", "Accounting.VoucherLines", "Accounting.VoucherActivities"], {
        tpl: ["app/accounting/vouchers", "app/accounting/vouchers/new", "app/accounting/vouchers/view"], api: "accounting/vouchers", perm: ["vch"],
        x: ["POST /accounting/vouchers/:id/submit|post|reverse", "POST /accounting/vouchers/:id/duplicate", "GET /accounting/vouchers/:id/pdf"],
        rules: [...POST_RULES, "Debits equal credits", "Postings only into open periods and postable accounts", "No matching workflow: vch:post posts directly; tests run in a separate Test Co; PDF = browser print (decided 2026-10-07)"],
        deps: ["chart-of-accounts", "fiscal-periods", "cost-centres", "numbering-series", "approvals"],
      }),
      E("opening-balances", "Opening Balances", ["Accounting.OpeningBalances", "Accounting.OpeningBalanceLines"], {
        tpl: ["app/accounting/opening"], api: "accounting/opening-balances", perm: ["vch"],
        x: ["POST /accounting/opening-balances/:id/post", "POST /accounting/opening-balances/import"],
        rules: [...POST_RULES, "One opening batch per fiscal year start; must balance"],
        deps: ["chart-of-accounts", "fiscal-periods"],
      }),
      E("recurring-vouchers", "Recurring Vouchers", ["Accounting.RecurringVoucherTemplates", "Accounting.RecurringVoucherTemplateLines", "Accounting.RecurringVoucherRuns"], {
        tpl: ["app/accounting/recurring"], api: "accounting/recurring-vouchers", perm: ["vch"],
        x: ["POST /accounting/recurring-vouchers/:id/run-now", "POST /accounting/recurring-vouchers/:id/pause|resume", "Scheduled job creates vouchers (actor = SERVICE)"],
        rules: ["Each run creates a draft or posted voucher per template setting; runs are history", "Hourly in-app job + Run now (decided 2026-10-07)"],
        deps: ["vouchers"],
      }),
    ],
  },
  {
    no: 17, title: "Banking", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "Bank transactions, statement import, reconciliation and cheques (received, issued, bounced, batched).",
    reports: ["Bank Book"],
    entities: [
      E("bank-transactions", "Bank Transactions", ["BankCash.BankTransactions"], {
        tpl: ["app/bank/transactions"], api: "bank/transactions", perm: ["bank"],
        x: ["POST /bank/transactions/:id/categorise", "POST /bank/transactions/:id/post|reverse"],
        rules: [...POST_RULES, "Generated from posted vouchers on a bank GL account and from categorised statement lines (BPV/BRV); never typed (decided 2026-10-07)"], deps: ["bank-accounts", "vouchers"],
      }),
      E("statement-imports", "Statement Imports", ["BankCash.BankStatementImports", "BankCash.BankStatementLines"], {
        tpl: ["app/bank/rules"], api: "bank/statement-imports", perm: ["bank"],
        x: ["POST /bank/statement-imports (CSV/XLSX upload)", "POST /bank/statement-imports/:id/apply-rules"],
        rules: ["Duplicate statement lines detected by date+amount+reference", "CSV with a saved column mapping per bank account; Excel / MT940 later (decided 2026-10-07)"], deps: ["bank-rules"],
      }),
      E("bank-reconciliation", "Bank Reconciliation", ["BankCash.BankReconciliations", "BankCash.BankReconciliationMatches"], {
        tpl: ["app/bank/reconciliation"], api: "bank/reconciliations", perm: ["recon"],
        x: ["POST /bank/reconciliations/:id/match|unmatch", "POST /bank/reconciliations/:id/auto-match", "POST /bank/reconciliations/:id/complete"],
        rules: ["Completed reconciliation is locked; difference must be zero"], deps: ["bank-transactions", "statement-imports"],
      }),
      E("cheques", "Cheques & Batches", ["BankCash.Cheques", "BankCash.ChequeBounces", "BankCash.ChequeBatches", "BankCash.ChequeBatchLines"], {
        tpl: ["app/bank/cheques", "app/bank/cheque-register", "app/bank/cheque-voucher"], api: "bank/cheques", perm: ["bank"],
        x: ["POST /bank/cheques/:id/deposit|clear|bounce|cancel", "POST /bank/cheque-batches (bulk cheque voucher)", "GET /bank/cheques/pdc?maturing="],
        rules: [...POST_RULES, "Cheque state machine: received → deposited → cleared | bounced", "Issued leaf numbers come from cheque books", "Clearing accounts: received Dr Cheques in hand / Cr customer, cleared Dr Bank / Cr Cheques in hand; issued Dr vendor / Cr PDC payable, cleared Dr PDC payable / Cr Bank; invoice / bill allocation in Phase 24 (decided 2026-10-07)"],
        deps: ["bank-accounts", "cheque-books", "customers", "vendors"],
      }),
    ],
  },
  {
    no: 18, title: "Cash", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "Cash book, daily cash close, petty cash and expense claims (also used by My Profile › Expense Claims).",
    reports: ["Cash Book", "Cash Ledger"],
    entities: [
      E("cash-book", "Cash Book Entries", ["BankCash.CashBookEntries"], {
        tpl: ["app/cash/book", "app/cash/ledger"], api: "cash/entries", perm: ["cash"],
        x: ["POST /cash/entries/:id/post|reverse"], rules: [...POST_RULES, "Quick entry: cash in/out, bank in/out, transfer and cheque mode; each entry is a voucher under the normal approval rules (decided 2026-10-07)"], deps: ["cash-accounts", "vouchers"],
      }),
      E("cash-day-close", "Cash Day Close", ["BankCash.CashDayCloses", "BankCash.CashDayCloseDenominations"], {
        tpl: ["app/cash/book"], api: "cash/day-closes", perm: ["cash"],
        x: ["POST /cash/day-closes/:id/close|reopen"],
        rules: ["Closed day blocks cash entries for that date; reopen needs approval"], deps: ["cash-book"],
      }),
      E("petty-cash", "Petty Cash Vouchers & Replenishment", ["BankCash.PettyCashVouchers", "BankCash.PettyCashReplenishments"], {
        tpl: ["app/cash/petty"], api: "cash/petty", perm: ["cash"],
        x: ["POST /cash/petty/vouchers/:id/post", "POST /cash/petty/funds/:id/replenish"],
        rules: [...POST_RULES, "Vouchers cannot exceed fund balance", "Receipts: count + missing flag; files with document storage in Phase 35 (decided 2026-10-07)"], deps: ["petty-cash-funds", "expense-categories"],
      }),
      E("expense-claims", "Expense Claims", ["BankCash.ExpenseClaims", "BankCash.ExpenseClaimLines", "BankCash.ExpenseClaimActions"], {
        tpl: ["app/cash/expenses", "app/profile/expenses"], api: "cash/expense-claims", perm: ["cash", "myexp"],
        x: ["POST /cash/expense-claims/:id/submit|approve|reject|pay", "Own claims: GET/POST /me/expense-claims (myexp)"],
        rules: [...POST_RULES, "Employee sees only own claims; receipts as attachments", "Approval engine with a seeded editable workflow Line manager → Finance; paid by cash or bank now, with payroll later; receipt files in Phase 35 (decided 2026-10-07)"], deps: ["expense-categories", "employees", "approvals"],
      }),
    ],
  },
  {
    no: 19, title: "Purchasing", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "Purchase orders through goods receipt and vendor bills, with landed cost.",
    entities: [
      E("purchase-orders", "Purchase Orders", ["Purchases.PurchaseOrders", "Purchases.PurchaseOrderLines"], {
        tpl: ["app/purchases/orders"], api: "purchases/orders", perm: ["po"],
        x: ["POST /purchases/orders/:id/submit|approve|close|cancel", "GET /purchases/orders/:id/pdf"],
        rules: ["Ordered ≥ received ≥ billed quantities enforced", "Approval engine when a PO workflow exists, else po:approve approves directly; nothing seeded (decided 2026-10-08)"], deps: ["vendors", "products", "warehouses", "approvals"],
      }),
      E("grn", "Goods Received Notes", ["Purchases.GoodsReceivedNotes", "Purchases.GoodsReceivedNoteLines"], {
        tpl: ["app/purchases/grn", "app/purchases/voucher"], api: "purchases/grns", perm: ["grn"],
        x: ["POST /purchases/grns/:id/post (stock in: StockMovements/StockBalances)", "POST /purchases/grns/:id/reverse"],
        rules: [...POST_RULES, "Batch/expiry captured for batch-tracked products (fields added beyond the template, decided 2026-10-08)"], deps: ["purchase-orders", "warehouses"],
      }),
      E("vendor-bills", "Vendor Bills", ["Purchases.VendorBills", "Purchases.VendorBillLines"], {
        tpl: ["app/purchases/bills", "app/purchases/bills/new"], api: "purchases/bills", perm: ["bill"],
        x: ["POST /purchases/bills/:id/submit|approve|post|void", "POST /purchases/bills/from-grn/:grnId"],
        rules: [...POST_RULES, "Vendor invoice number unique per vendor (billVendorInvoiceIdx)", "WHT computed from tax codes", "Purchase voucher = counter bill with pay-now; approval engine or bill:approve; bill payments in Phase 20 (decided 2026-10-08)"],
        deps: ["grn", "tax-codes"],
      }),
      E("landed-cost", "Landed Cost", ["Purchases.LandedCostShipments", "Purchases.LandedCostItems", "Purchases.LandedCostCharges"], {
        tpl: ["app/purchases/landed-cost"], api: "purchases/landed-cost", perm: ["bill"],
        x: ["POST /purchases/landed-cost/:id/allocate (by value/qty/weight)", "POST /purchases/landed-cost/:id/post"],
        rules: [...POST_RULES, "Allocated charges revalue stock cost"], deps: ["grn", "vendor-bills"],
      }),
    ],
  },
  {
    no: 20, title: "Payables", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "Purchase returns, debit notes and vendor payments with allocation.",
    reports: ["AP Ageing", "Vendor Statement"],
    entities: [
      E("purchase-returns", "Purchase Returns", ["Purchases.PurchaseReturns", "Purchases.PurchaseReturnLines"], {
        tpl: ["app/purchases/returns"], api: "purchases/returns", perm: ["grn"],
        x: ["POST /purchases/returns/:id/post|reverse"], rules: [...POST_RULES, "Return qty ≤ received qty"], deps: ["grn"],
      }),
      E("debit-notes", "Debit Notes", ["Purchases.DebitNotes", "Purchases.DebitNoteLines"], {
        tpl: ["app/purchases/debit-notes"], api: "purchases/debit-notes", perm: ["bill"],
        x: ["POST /purchases/debit-notes/:id/post|void|refund|apply"], rules: [...POST_RULES, "Refund-requested notes get a refund-received step (decided 2026-10-08)"], deps: ["vendor-bills", "purchase-returns"],
      }),
      E("vendor-payments", "Vendor Payments", ["Purchases.VendorPayments", "Purchases.VendorPaymentAllocations"], {
        tpl: ["app/payables/payments"], api: "payables/payments", perm: ["vpay"],
        x: ["POST /payables/payments/:id/submit|approve|post|void", "PUT /payables/payments/:id/allocations", "GET /payables/open-items?vendor="],
        rules: [...POST_RULES, "Allocations ≤ open bill amounts; WHT deducted at payment", "Approval engine when a Vendor payment workflow exists, else vpay:post posts directly; nothing seeded (decided 2026-10-08)", "Cheques via PDC payable clearing, cleared in the cheque register; purchase-voucher cheque pay-now aligned (decided 2026-10-08)", "Payment run: bills of many vendors → one payment per vendor; Vendor Bills 'Pay selected' opens it (decided 2026-10-08)", "AP Ageing + Vendor Statement on the Payables studio; other studio tabs disabled (decided 2026-10-08)"], deps: ["vendor-bills", "bank-accounts", "cheques"],
      }),
    ],
  },
  {
    no: 21, title: "Stock operations", portal: "workspace", kind: "TRANSACTIONAL", status: "in-progress",
    objective: "Manual stock in/out, transfers, adjustments and stock counts. The stock ledger (StockMovements, StockBalances, StockReservations) is produced by posting.",
    reports: ["Whole Stock", "Stock In View", "Stock Movements"],
    entities: [
      E("stock-in-out", "Stock In/Out", ["Inventory.StockInOut", "Inventory.StockInOutEntryLines"], {
        tpl: ["app/inventory/stock-in-out"], api: "inventory/stock-in-out", perm: ["adj"],
        x: ["POST /inventory/stock-in-out/:id/post|reverse"], rules: POST_RULES, deps: ["products", "warehouses", "movement-reasons"],
      }),
      E("stock-transfers", "Stock Transfers", ["Inventory.StockTransfers", "Inventory.StockTransferLines", "Inventory.StockTransferReceiptLines"], {
        tpl: ["app/inventory/transfer"], api: "inventory/transfers", perm: ["xfer"],
        x: ["POST /inventory/transfers/:id/dispatch|receive|reverse"],
        rules: [...POST_RULES, "In-transit stock tracked between dispatch and receipt", "Two-step dispatch → receive; receipt variance to stock loss / gain (decided 2026-10-08)"], deps: ["warehouses", "products"],
      }),
      E("stock-adjustments", "Stock Adjustments", ["Inventory.StockAdjustments", "Inventory.StockAdjustmentLines"], {
        tpl: ["app/inventory/adjustments"], api: "inventory/adjustments", perm: ["adj"],
        x: ["POST /inventory/adjustments/:id/submit|approve|post|reverse"], rules: [...POST_RULES, "Write-offs need approval", "Approval engine when a Stock adjustment workflow exists, else adj:post / cnt:approve posts directly; nothing seeded (decided 2026-10-08)"], deps: ["movement-reasons", "approvals"],
      }),
      E("stock-counts", "Stock Counts", ["Inventory.StockCounts", "Inventory.StockCountLines"], {
        tpl: ["app/inventory/count"], api: "inventory/counts", perm: ["cnt"],
        x: ["POST /inventory/counts/:id/freeze|submit|approve|post (variance → adjustment)"],
        rules: [...POST_RULES, "Frozen snapshot of book quantity at count start"], deps: ["stock-adjustments"],
      }),
    ],
  },
  {
    no: 22, title: "Stock vouchers & demand", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Stock vouchers, assembly, demand planning, principal claims/targets and bulk price updates.",
    reports: ["Inventory Reports"],
    entities: [
      E("stock-vouchers", "Stock Vouchers", ["Inventory.StockVouchers", "Inventory.StockVoucherLines"], {
        tpl: ["app/inventory/stock-vouchers"], api: "inventory/stock-vouchers", perm: ["adj"],
        x: ["POST /inventory/stock-vouchers/:id/post|reverse"], rules: POST_RULES, deps: ["products", "warehouses"],
      }),
      E("assembly-vouchers", "Assembly Vouchers", ["Inventory.AssemblyVouchers", "Inventory.AssemblyVoucherLines"], {
        tpl: [], api: "inventory/assembly-vouchers", perm: ["adj"],
        x: ["POST /inventory/assembly-vouchers/:id/post|reverse (consume components, produce kit)"],
        rules: POST_RULES, deps: ["kits"], open: ["No template for assembly vouchers: needs design"],
      }),
      E("goods-demands", "Goods Demands", ["Inventory.GoodsDemands", "Inventory.GoodsDemandLines"], {
        tpl: ["app/inventory/demand"], api: "inventory/demands", perm: ["item"],
        x: ["POST /inventory/demands/generate (from reorder rules)", "POST /inventory/demands/:id/convert-to-po"],
        deps: ["reorder-rules", "purchase-orders"],
      }),
      E("principal-claims", "Principal Claims & Targets", ["Inventory.PrincipalClaims", "Inventory.PrincipalTargets"], {
        tpl: [], api: "inventory/principal-claims", perm: ["item"],
        x: ["POST /inventory/principal-claims/:id/submit|settle"], deps: ["brands"],
        open: ["No template for principal claims/targets: needs design"],
      }),
      E("bulk-price-updates", "Bulk Price Updates", ["Inventory.BulkPriceUpdates", "Inventory.BulkPriceUpdateLines"], {
        tpl: [], api: "inventory/bulk-price-updates", perm: ["item"],
        x: ["POST /inventory/bulk-price-updates/:id/preview|apply (writes ProductPriceLogs)"],
        deps: ["products", "price-lists"], open: ["No template for bulk price updates: needs design"],
      }),
    ],
  },
  {
    no: 23, title: "Sales documents", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Quotation → order → delivery challan → invoice, with FBR submission on posting.",
    entities: [
      E("quotations", "Quotations", ["Sales.Quotations", "Sales.QuotationLines"], {
        tpl: ["app/sales/quotations"], api: "sales/quotations", perm: ["quo"],
        x: ["POST /sales/quotations/:id/send|accept|reject|convert-to-order", "GET /sales/quotations/:id/pdf"],
        deps: ["customers", "products", "price-lists", "sales-schemes", "approvals"],
      }),
      E("sales-orders", "Sales Orders", ["Sales.SalesOrders", "Sales.SalesOrderLines"], {
        tpl: ["app/sales/orders"], api: "sales/orders", perm: ["quo"],
        x: ["POST /sales/orders/:id/submit|approve|close|cancel", "POST /sales/orders/:id/reserve-stock"],
        rules: ["Credit limit checked on approval (override needs permission)", "Stock reservation via StockReservations"], deps: ["quotations", "approvals"],
      }),
      E("delivery-challans", "Delivery Challans", ["Sales.DeliveryChallans", "Sales.DeliveryChallanLines"], {
        tpl: ["app/sales/challans"], api: "sales/challans", perm: ["sinv"],
        x: ["POST /sales/challans/:id/post (stock out)|reverse", "GET /sales/challans/:id/pdf"], rules: POST_RULES, deps: ["sales-orders", "warehouses"],
      }),
      E("sales-invoices", "Sales Invoices", ["Sales.SalesInvoices", "Sales.SalesInvoiceLines"], {
        tpl: ["app/sales/invoices", "app/sales/invoices/new", "app/sales/invoices/view", "app/sales/voucher"], api: "sales/invoices", perm: ["sinv"],
        x: ["POST /sales/invoices/:id/submit|approve|post|void", "POST /sales/invoices/from-challan/:id", "GET /sales/invoices/:id/pdf", "Posting submits to FBR when enabled (FbrInvoiceSubmissions; retries in Phase 28)"],
        rules: [...POST_RULES, "Tax from tax codes; scheme free items as zero-price lines"], deps: ["delivery-challans", "tax-codes", "fbr-settings", "approvals"],
      }),
    ],
  },
  {
    no: 24, title: "Sales completion", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Returns, credit notes, customer receipts with allocation, recurring invoices and POS.",
    reports: ["AR Ageing", "Customer Statement"],
    entities: [
      E("sales-returns", "Sales Returns", ["Sales.SalesReturns", "Sales.SalesReturnLines"], {
        tpl: ["app/sales/returns"], api: "sales/returns", perm: ["sinv"],
        x: ["POST /sales/returns/:id/post|reverse (stock back in)"], rules: [...POST_RULES, "Return qty ≤ invoiced qty"], deps: ["sales-invoices"],
      }),
      E("credit-notes", "Credit Notes", ["Sales.CreditNotes", "Sales.CreditNoteLines"], {
        tpl: ["app/sales/credit-notes"], api: "sales/credit-notes", perm: ["sinv"],
        x: ["POST /sales/credit-notes/:id/post|void"], rules: POST_RULES, deps: ["sales-invoices", "sales-returns"],
      }),
      E("customer-receipts", "Customer Receipts", ["Sales.CustomerReceipts", "Sales.CustomerReceiptAllocations", "BankCash.ChequeAllocations"], {
        tpl: ["app/receivables/receipts"], api: "receivables/receipts", perm: ["rcpt"],
        x: ["POST /receivables/receipts/:id/post|void", "PUT /receivables/receipts/:id/allocations", "GET /receivables/open-items?customer="],
        rules: [...POST_RULES, "Allocations ≤ open invoice amounts", "Cheque allocations to invoices / bills and Raast-IBFT invoice matching moved here from Phase 17 (decided 2026-10-07)"], deps: ["sales-invoices", "bank-accounts", "cash-accounts", "cheques"],
      }),
      E("recurring-invoices", "Recurring Invoices", ["Sales.RecurringInvoices", "Sales.RecurringInvoiceLines"], {
        tpl: ["app/sales/recurring"], api: "sales/recurring-invoices", perm: ["sinv"],
        x: ["POST /sales/recurring-invoices/:id/run-now|pause|resume", "Scheduled job (actor = SERVICE)"], deps: ["sales-invoices"],
      }),
      E("pos", "POS Shifts & Payments", ["Sales.PosShifts", "Sales.PosShiftDenominations", "Sales.PosPayments"], {
        tpl: ["app/sales/pos"], api: "sales/pos", perm: ["pos"],
        x: ["POST /sales/pos/shifts/open|:id/close", "POST /sales/pos/sales (invoice + payment in one transaction)", "POST /sales/pos/sales/:id/hold|resume"],
        rules: ["One open shift per terminal/user", "Shift close reconciles denominations"], deps: ["sales-invoices", "cash-accounts"],
      }),
    ],
  },
  {
    no: 25, title: "Wholesale", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Order bookings from the field, quick wholesale entry, bulk invoicing and back-orders.",
    entities: [
      E("order-bookings", "Order Bookings", ["Distribution.OrderBookings", "Distribution.OrderBookingLines"], {
        tpl: ["app/wholesale/bookings"], api: "distribution/bookings", perm: ["booking"],
        x: ["POST /distribution/bookings/:id/approve|cancel", "Order Booker sees own route bookings only"],
        deps: ["routes", "order-templates", "price-tiers"],
      }),
      E("order-templates", "Order Templates", ["Distribution.OrderTemplates", "Distribution.OrderTemplateLines"], {
        tpl: ["app/wholesale/entry"], api: "distribution/order-templates", perm: ["booking"], deps: ["customers", "products"],
        x: ["Templates dropdown and 'Save as template' on Quick Wholesale Entry"],
      }),
      E("held-bills", "Quick Wholesale Entry (Held Bills)", ["Distribution.HeldBills", "Distribution.HeldBillLines"], {
        tpl: ["app/wholesale/entry"], api: "distribution/held-bills", perm: ["wsentry"],
        x: ["POST /distribution/held-bills/:id/convert-to-invoice"], deps: ["sales-invoices"],
      }),
      E("bulk-invoicing", "Bulk Invoice Runs", ["Distribution.BulkInvoiceRuns", "Distribution.BulkInvoiceRunCells", "Distribution.BulkInvoiceSkippedShops"], {
        tpl: ["app/wholesale/bulk"], api: "distribution/bulk-invoice-runs", perm: ["bulkinv"],
        x: ["POST /distribution/bulk-invoice-runs/:id/preview|approve|post (creates invoices, records skipped shops)"],
        rules: ["Run is atomic per shop; skipped shops recorded with reason"], deps: ["order-bookings", "sales-invoices"],
      }),
      E("back-orders", "Back-orders", ["Distribution.BackOrders", "Distribution.BackOrderAllocations", "Distribution.BackOrderCancellations"], {
        tpl: ["app/wholesale/backorders"], api: "distribution/back-orders", perm: ["backord"],
        x: ["POST /distribution/back-orders/:id/allocate|cancel"], deps: ["order-bookings", "grn"],
      }),
    ],
  },
  {
    no: 26, title: "Distribution", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Load sheets and delivery, route settlement, recovery, salesman targets/commissions and credit control.",
    entities: [
      E("load-sheets", "Load Sheets & Delivery", ["Distribution.LoadSheets", "Distribution.LoadSheetLines", "Distribution.LoadSheetInvoices", "Distribution.VanStockCounts"], {
        tpl: ["app/wholesale/load-sheet"], api: "distribution/load-sheets", perm: ["loadsht", "delivery"],
        x: ["POST /distribution/load-sheets/:id/approve|post (stock to van)", "GET /distribution/load-sheets/:id/pick-list", "PATCH /distribution/load-sheets/:id/invoices/:invoiceId/delivery (delivered|returned; Deliveryman)"],
        rules: [...POST_RULES, "Deliveryman updates delivery status only on own load sheets"], deps: ["sales-invoices", "vans", "routes"],
      }),
      E("route-settlements", "Route Settlements", ["Distribution.RouteSettlements", "Distribution.RouteSettlementLines", "Distribution.RouteSettlementCashCounts", "Distribution.RouteSettlementCheques", "Distribution.RouteSettlementReturns"], {
        tpl: ["app/wholesale/settlement"], api: "distribution/settlements", perm: ["settle"],
        x: ["POST /distribution/settlements/:id/count-cash (Cashier)|submit|approve|post"],
        rules: [...POST_RULES, "Cash short/excess posted to mapped accounts"], deps: ["load-sheets", "customer-receipts", "cheques"],
      }),
      E("recovery-sheets", "Recovery Sheets", ["Distribution.RecoverySheets", "Distribution.RecoverySheetLines"], {
        tpl: ["app/wholesale/recovery"], api: "distribution/recovery-sheets", perm: ["recov"],
        x: ["POST /distribution/recovery-sheets/generate?route&date", "POST /distribution/recovery-sheets/:id/post (creates receipts)"],
        rules: POST_RULES, deps: ["customer-receipts", "routes"],
      }),
      E("salesman-targets", "Salesman Targets & Commissions", ["Distribution.SalesmanTargets", "Distribution.SalesmanCommissions"], {
        tpl: ["app/wholesale/routes"], api: "distribution/targets", perm: ["target"],
        x: ["POST /distribution/commissions/calculate?period", "POST /distribution/commissions/:id/approve|post (to payroll adjustments)"],
        deps: ["commission-slabs", "sales-invoices"],
      }),
      E("credit-control", "Credit Control", ["Sales.CreditOverrides", "Sales.CreditHoldEvents", "Distribution.CreditOverrideLogs"], {
        tpl: ["app/receivables/credit"], api: "receivables/credit", perm: ["crovr", "rcpt"],
        x: ["POST /receivables/credit/holds/:customerId/place|release", "POST /receivables/credit/overrides/:id/approve|reject"],
        rules: ["Every override is logged with its approver"], deps: ["customers", "approvals"],
      }),
    ],
  },
  {
    no: 27, title: "Assets & budgets", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Fixed asset register, depreciation, transfers/disposals and budgets.",
    reports: ["Budget vs Actual", "Asset Register report"],
    entities: [
      E("fixed-assets", "Fixed Asset Register", ["FixedAssets.FixedAssets"], {
        tpl: ["app/assets", "app/assets/view"], api: "assets", perm: ["fa"],
        x: ["POST /assets/:id/capitalise (from bill line)", "GET /assets/:id/schedule"],
        rules: ["Capitalisation posts to the asset account; register entries are not deleted after capitalisation"], deps: ["asset-categories", "vendor-bills"],
      }),
      E("depreciation", "Depreciation", ["FixedAssets.DepreciationRuns", "FixedAssets.DepreciationRunLines", "FixedAssets.DepreciationSchedules"], {
        tpl: ["app/assets/depreciation"], api: "assets/depreciation-runs", perm: ["fa"],
        x: ["POST /assets/depreciation-runs/preview?period", "POST /assets/depreciation-runs/:id/post|reverse"],
        rules: [...POST_RULES, "One run per period"], deps: ["fixed-assets", "fiscal-periods"],
      }),
      E("asset-movements", "Asset Transfers & Disposals", ["FixedAssets.AssetTransfers", "FixedAssets.AssetDisposals"], {
        tpl: ["app/assets/disposals"], api: "assets/movements", perm: ["fa"],
        x: ["POST /assets/:id/transfer", "POST /assets/:id/dispose (gain/loss posting)"], rules: POST_RULES, deps: ["fixed-assets", "depreciation"],
      }),
      E("budgets", "Budgets", ["Accounting.Budgets", "Accounting.BudgetVersions", "Accounting.BudgetVersionLines"], {
        tpl: ["app/budgets", "app/budgets/variance"], api: "accounting/budgets", perm: ["bud"],
        x: ["POST /accounting/budgets/:id/versions", "POST /accounting/budgets/versions/:id/submit|approve", "GET /accounting/budgets/:id/variance"],
        rules: ["One approved version per budget (budgetVersionOneApprovedUk)"], deps: ["chart-of-accounts", "cost-centres", "fiscal-periods"],
      }),
    ],
  },
  {
    no: 28, title: "Tax compliance", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Sales tax returns, withholding tax lifecycle and FBR invoice submissions.",
    entities: [
      E("sales-tax-returns", "Sales Tax Returns", ["Tax.SalesTaxReturns", "Tax.SalesTaxReturnLines"], {
        tpl: ["app/tax/sales-tax"], api: "tax/sales-tax-returns", perm: ["tax"],
        x: ["POST /tax/sales-tax-returns/prepare?period", "POST /tax/sales-tax-returns/:id/approve|file", "GET /tax/sales-tax-returns/:id/annex-c.xlsx"],
        rules: ["A filed return locks the period's tax documents"], deps: ["sales-invoices", "vendor-bills"],
      }),
      E("wht", "WHT Deductions & Challans", ["Tax.WhtDeductions", "Tax.WhtChallans"], {
        tpl: ["app/tax/wht"], api: "tax/wht", perm: ["tax"],
        x: ["POST /tax/wht/challans (pay selected deductions)", "POST /tax/wht/challans/:id/post"], rules: POST_RULES, deps: ["vendor-payments"],
      }),
      E("wht-certificates", "WHT Certificates & Statements", ["Tax.WhtCertificates", "Tax.WhtStatements"], {
        tpl: ["app/tax/wht"], api: "tax/wht/certificates", perm: ["tax"],
        x: ["POST /tax/wht/certificates/generate", "GET /tax/wht/certificates/:id/pdf", "POST /tax/wht/statements/prepare?period"], deps: ["wht"],
      }),
      E("fbr-submissions", "FBR Submissions", ["Tax.FbrInvoiceSubmissions", "Tax.FbrConnectionEvents"], {
        tpl: ["app/tax/fbr"], api: "tax/fbr/submissions", perm: ["tax"],
        x: ["POST /tax/fbr/submissions/:id/retry", "GET /tax/fbr/connection-events", "POST /tax/fbr/test-connection and Sync now (moved from Phase 5)"],
        rules: ["Submissions are append-only; retries create new attempts"], deps: ["sales-invoices", "fbr-settings"],
      }),
    ],
  },
  {
    no: 29, title: "Period close & work queue", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Period reopen, year-end close, reminder runs, tasks and notifications; completes the financial statements.",
    reports: ["Profit & Loss", "Balance Sheet", "Cash Flow", "Workspace Dashboard"],
    entities: [
      E("period-reopen", "Period Reopen Requests", ["Accounting.PeriodReopenRequests"], {
        tpl: ["app/periods"], api: "accounting/period-reopen-requests", perm: ["close"],
        x: ["POST /accounting/period-reopen-requests/:id/approve|reject"], rules: ["Reopen always needs approval; auto-relock after the window"], deps: ["fiscal-periods", "approvals"],
      }),
      E("year-end", "Year-End Close", ["Accounting.YearEndAdjustments", "Accounting.YearEndCloses"], {
        tpl: ["app/periods/close"], api: "accounting/year-end", perm: ["close"],
        x: ["POST /accounting/year-end/:fiscalYearId/checklist", "POST /accounting/year-end/:fiscalYearId/close (retained earnings transfer)"],
        rules: [...POST_RULES, "All periods locked and checklist complete before close"], deps: ["vouchers", "fiscal-periods"],
      }),
      E("reminder-runs", "Payment Reminder Runs", ["Sales.PaymentReminderLogs"], {
        tpl: ["app/receivables/reminders"], api: "receivables/reminder-runs", perm: ["rcpt"],
        x: ["POST /receivables/reminder-runs (run rules now)", "Scheduled job (actor = SERVICE)"], deps: ["reminder-setup", "sales-invoices"],
      }),
      E("tasks-notifications", "Tasks & Notifications", ["Company.Tasks", "Company.Notifications", "Company.NotificationPreferences"], {
        tpl: ["app/today", "app/notifications"], api: "work", perm: [],
        x: ["GET /work/today (Company.getTodayDueItems, getTodayKpis)", "CRUD /work/tasks", "GET /me/notifications, POST /me/notifications/read-all"],
        rules: ["Own tasks/notifications only unless assigned"], deps: ["users"],
      }),
      E("sign-in-recovery", "Sign-in Recovery & MFA", ["Company.UserInvites", "Company.UserMfaMethods", "Company.TrustedDevices", "Company.PasswordResets"], {
        tpl: ["login/mfa", "login/forgot"], api: "me/mfa", perm: [],
        x: ["POST /settings/users/invite (email/WhatsApp link) + accept page", "POST /me/mfa/enrol|verify|disable", "DELETE /me/trusted-devices/:id", "POST /auth/forgot, POST /auth/reset"],
        rules: ["Deferred from Phase 2 and Phase 15: needs an email/SMS provider (shared with reminder runs in this phase)", "Reset and invite tokens hashed and single-use", "MFA secrets encrypted; recovery codes hashed"],
        deps: ["users", "account-security"],
      }),
    ],
  },
  {
    no: 30, title: "Time & attendance", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "Punches and the attendance register, regularisation, rosters and shift swaps, overtime; also My Profile › Attendance/Shifts.",
    entities: [
      E("attendance", "Attendance", ["HumanResources.AttendancePunches", "HumanResources.AttendanceRegister"], {
        tpl: ["app/hr/attendance", "app/hr/attendance/register", "app/profile/attendance", "app/profile"], api: "hr/attendance", perm: ["att", "myatt"],
        x: ["POST /me/attendance/punch (check-in/out with location)", "POST /hr/attendance/process?date (build register)", "GET /hr/attendance/register?month"],
        rules: ["Punches append-only; register derived and lockable per payroll period"], deps: ["employees", "work-shifts", "biometric-devices", "holidays"],
      }),
      E("regularisation", "Regularisation Requests", ["HumanResources.RegularisationRequests"], {
        tpl: ["app/hr/attendance/requests", "app/profile/attendance"], api: "hr/regularisation-requests", perm: ["att", "myatt"],
        x: ["POST /me/regularisation-requests", "POST /hr/regularisation-requests/:id/approve|reject"], deps: ["attendance", "approvals"],
      }),
      E("rosters", "Rosters & Shift Swaps", ["HumanResources.ShiftRosters", "EmployeeSelfService.ShiftSwapRequests", "EmployeeSelfService.OpenShifts", "EmployeeSelfService.OpenShiftClaims"], {
        tpl: ["app/hr/shifts", "app/profile/shifts"], api: "hr/rosters", perm: ["att", "myshift"],
        x: ["POST /hr/rosters/publish?week", "POST /me/shift-swaps, POST /hr/shift-swaps/:id/approve|reject", "POST /me/open-shifts/:id/claim"], deps: ["work-shifts", "employees"],
      }),
      E("overtime-claims", "Overtime Claims", ["HumanResources.OvertimeClaims"], {
        tpl: ["app/hr/overtime"], api: "hr/overtime-claims", perm: ["att"],
        x: ["POST /hr/overtime-claims/:id/approve|reject"], rules: ["Within overtime policy limits"], deps: ["overtime-policies", "attendance"],
      }),
    ],
  },
  {
    no: 31, title: "Leave & lifecycle", portal: "workspace", kind: "TRANSACTIONAL", status: "done",
    objective: "Leave requests and balances, onboarding and offboarding; also My Profile › Leave.",
    entities: [
      E("leave-requests", "Leave Requests", ["HumanResources.LeaveRequests"], {
        tpl: ["app/hr/leave", "app/hr/leave/requests", "app/profile/leave"], api: "hr/leave-requests", perm: ["lv", "mylv"],
        x: ["POST /me/leave-requests, POST /me/leave-requests/:id/cancel", "POST /hr/leave-requests/:id/approve|reject"],
        rules: ["Balance checked; overlapping requests rejected"], deps: ["leave-types", "employees", "approvals"],
      }),
      E("leave-balances", "Leave Balances", ["HumanResources.LeaveBalances", "HumanResources.LeaveAdjustments", "HumanResources.LeaveYearEndClosings"], {
        tpl: ["app/hr/leave/balances"], api: "hr/leave-balances", perm: ["lv"],
        x: ["POST /hr/leave-balances/accrue?month", "POST /hr/leave-adjustments", "POST /hr/leave-year-end/:year/close (carry forward/encash)"],
        rules: ["Balances change only through accrual, approved requests or adjustments"], deps: ["leave-requests"],
      }),
      E("onboardings", "Onboardings", ["HumanResources.Onboardings", "HumanResources.OnboardingTasks"], {
        tpl: ["app/hr/onboarding", "app/profile/onboarding"], api: "hr/onboardings", perm: ["emp", "myonb"],
        x: ["POST /hr/onboardings (from template)", "POST /me/onboarding/tasks/:id/complete"], deps: ["onboarding-templates", "employees"],
      }),
      E("offboardings", "Offboardings", ["HumanResources.Offboardings", "HumanResources.ClearanceItems", "HumanResources.ExitInterviews"], {
        tpl: ["app/hr/offboarding"], api: "hr/offboardings", perm: ["emp"],
        x: ["POST /hr/offboardings/:id/clearance/:itemId/clear", "POST /hr/offboardings/:id/complete (deactivates the user)"],
        rules: ["Completion requires every clearance item"], deps: ["employees"],
      }),
    ],
  },
  {
    no: 32, title: "Payroll", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Payroll runs end to end, adjustments, loans, payslips/payments and tax declarations; also My Profile › Payslips/Tax/Loans.",
    reports: ["Payroll Overview", "Statutory Reports"],
    entities: [
      E("payroll-runs", "Payroll Runs", ["Payroll.PayrollRuns", "Payroll.PayrollRunLines", "Payroll.PayrollRunLineComponents", "Payroll.PayrollRunBranches", "Payroll.PayrollRunChecklistItems"], {
        tpl: ["app/hr/payroll", "app/hr/payroll/run"], api: "payroll/runs", perm: ["prun"],
        x: ["POST /payroll/runs (snapshot eligible employees)", "POST /payroll/runs/:id/calculate|submit|approve|post|reverse", "GET /payroll/runs/:id/variance"],
        rules: [...POST_RULES, "Preparer cannot approve own run", "Attendance/leave locked for the period on approval"],
        deps: ["employee-salaries", "attendance", "leave-requests", "tax-slabs"],
      }),
      E("payroll-adjustments", "Payroll Adjustments", ["Payroll.PayrollAdjustments"], {
        tpl: ["app/hr/payroll/run"], api: "payroll/adjustments", perm: ["prun"], deps: ["payroll-runs"],
      }),
      E("loans", "Loans & Advances", ["Payroll.LoansAndAdvances", "Payroll.LoanInstallments"], {
        tpl: ["app/hr/loans", "app/profile/loans"], api: "payroll/loans", perm: ["loan", "myloan"],
        x: ["POST /me/loans (request)", "POST /payroll/loans/:id/approve|disburse|reschedule"],
        rules: ["Installments are deducted by payroll runs"], deps: ["employees", "approvals"],
      }),
      E("payslips", "Payslips & Salary Payments", ["Payroll.Payslips", "Payroll.SalaryPaymentBatches"], {
        tpl: ["app/hr/payroll/payslips", "app/hr/payroll/payslip", "app/profile/payslips"], api: "payroll/payslips", perm: ["prun", "mypay"],
        x: ["POST /payroll/runs/:id/publish-payslips", "GET /me/payslips, GET /me/payslips/:id/pdf", "POST /payroll/payment-batches (bank file)"],
        rules: ["Employees see own payslips only"], deps: ["payroll-runs", "bank-accounts"],
      }),
      E("tax-declarations", "Tax Declarations", ["Payroll.TaxDeclarations"], {
        tpl: ["app/profile/tax"], api: "payroll/tax-declarations", perm: ["prun", "mytax"],
        x: ["POST /me/tax-declarations, POST /payroll/tax-declarations/:id/verify|reject"], deps: ["employees", "tax-slabs"],
      }),
    ],
  },
  {
    no: 33, title: "Talent & exits", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Final settlements, recruitment, performance, training, employee letters and assets.",
    reports: ["HR Reports"],
    entities: [
      E("final-settlements", "Final Settlements", ["Payroll.FinalSettlements", "Payroll.FinalSettlementLines"], {
        tpl: ["app/hr/settlement"], api: "payroll/final-settlements", perm: ["fs"],
        x: ["POST /payroll/final-settlements/:id/calculate|approve|post"], rules: POST_RULES, deps: ["offboardings", "loans", "leave-balances"],
      }),
      E("recruitment", "Recruitment", ["HumanResources.JobOpenings", "HumanResources.Candidates", "HumanResources.CandidateActivities"], {
        tpl: ["app/hr/recruitment"], api: "hr/recruitment", perm: ["emp"],
        x: ["POST /hr/recruitment/candidates/:id/move-stage", "POST /hr/recruitment/candidates/:id/hire (creates employee + onboarding)"], deps: ["designations", "onboardings"],
      }),
      E("performance", "Performance", ["HumanResources.PerformanceReviews", "HumanResources.Goals", "HumanResources.PerformanceFeedback", "HumanResources.OneOnOneMeetings", "HumanResources.CompetencyRatings", "HumanResources.KeyResults"], {
        tpl: ["app/hr/performance", "app/profile/goals"], api: "hr/performance", perm: ["emp", "mygoal"],
        x: ["POST /me/goals, POST /me/reviews/:id/self-assessment", "POST /hr/performance/reviews/:id/calibrate|finalise"], deps: ["performance-cycles", "employees"],
      }),
      E("training", "Training", ["HumanResources.TrainingSessions", "HumanResources.TrainingEnrolments", "HumanResources.Certifications"], {
        tpl: ["app/hr/training"], api: "hr/training", perm: ["emp"],
        x: ["POST /hr/training/sessions/:id/enrol|complete"], deps: ["training-programs", "employees"],
      }),
      E("employee-letters-assets", "Employee Letters & Assets", ["HumanResources.EmployeeLetters", "HumanResources.EmployeeAssets"], {
        tpl: ["app/hr/employees/view"], api: "hr/employee-records", perm: ["emp"],
        x: ["POST /hr/employees/:id/letters (generate from template)", "POST /hr/employees/:id/assets/:assetId/issue|return"], deps: ["employees", "document-templates"],
      }),
    ],
  },
  {
    no: 34, title: "Self-service requests", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Employee requests and engagement from My Profile.",
    reports: ["My Day (getMyDay)", "My Team (getMyTeamToday)"],
    entities: [
      E("letter-requests", "Letter Requests", ["EmployeeSelfService.LetterRequests"], {
        tpl: ["app/profile/requests"], api: "me/letter-requests", perm: ["myreq"],
        x: ["POST /me/letter-requests", "POST /hr/letter-requests/:id/issue|reject"], deps: ["employee-letters-assets"],
      }),
      E("profile-change-requests", "Profile Change Requests", ["EmployeeSelfService.ProfileChangeRequests"], {
        tpl: ["app/profile/details"], api: "me/profile-change-requests", perm: ["myprof"],
        x: ["POST /me/profile-change-requests", "POST /hr/profile-change-requests/:id/approve|reject (applies to the employee record)"],
        rules: ["An employee never edits the HR master directly"], deps: ["employees"],
      }),
      E("helpdesk-tickets", "Helpdesk Tickets", ["EmployeeSelfService.HelpdeskTickets", "EmployeeSelfService.HelpdeskTicketMessages"], {
        tpl: ["app/profile/helpdesk"], api: "helpdesk/tickets", perm: ["myhelp"],
        x: ["POST /helpdesk/tickets/:id/messages", "POST /helpdesk/tickets/:id/assign|resolve|reopen"], deps: ["helpdesk-setup"],
      }),
      E("engagement", "Kudos, Survey Responses, Reads & Presence", ["EmployeeSelfService.Kudos", "EmployeeSelfService.KudosReactions", "EmployeeSelfService.PollVotes", "EmployeeSelfService.PulseSurveyResponses", "EmployeeSelfService.CompanyAnnouncementReads", "EmployeeSelfService.PresenceStatuses"], {
        tpl: ["app/profile/kudos", "app/profile/directory"], api: "me/engagement", perm: ["mykudos", "dir"],
        x: ["POST /me/kudos, POST /me/kudos/:id/react", "POST /me/polls/:id/vote", "POST /me/pulse-surveys/:id/respond", "POST /company/announcements/:id/read (RSVP)", "PUT /me/presence"],
        rules: ["One vote/response per user per poll/survey"], deps: ["surveys", "announcements", "employees"],
      }),
      E("policy-acknowledgements", "Policy Acknowledgements", ["EmployeeSelfService.PolicyAcknowledgements"], {
        tpl: ["app/profile/onboarding", "app/profile/team"], api: "me/policy-acknowledgements", perm: ["myonb", "myteam"],
        x: ["POST /me/policies/:id/acknowledge", "GET /hr/policies/:id/acknowledgements"], deps: ["company-policies"],
      }),
    ],
  },
  {
    no: 35, title: "Data & collaboration", portal: "workspace", kind: "TRANSACTIONAL",
    objective: "Imports, integrations/API keys, backups, report runs and the cross-cutting activity/comments/attachments layer.",
    reports: ["Audit Trail", "Reports Hub"],
    entities: [
      E("data-imports", "Data Imports", ["Company.DataImports", "Company.DataImportErrors"], {
        tpl: ["app/import"], api: "imports", perm: ["bak"],
        x: ["POST /imports (upload + map)", "POST /imports/:id/validate|run", "GET /imports/:id/errors.csv"],
        rules: ["Each row goes through the target entity's own use case (same validation and audit)"], deps: ["customers", "vendors", "products", "employees"],
      }),
      E("integrations", "Integrations & API Keys", ["Company.Integrations", "Company.IntegrationWebhooks", "Company.IntegrationWebhookDeliveries", "Company.ApiKeys"], {
        tpl: ["app/settings/integrations"], api: "settings/integrations", perm: ["intg"],
        x: ["POST /settings/api-keys (secret shown once, stored hashed)", "POST /settings/integrations/webhooks/:id/test", "POST /settings/integrations/webhooks/deliveries/:id/redeliver"],
      }),
      E("backups", "Backup & Restore", ["Company.Backups", "Company.BackupSettings", "Company.BackupRestoreRequests"], {
        tpl: ["app/settings/backup"], api: "settings/backups", perm: ["bak"],
        x: ["POST /settings/backups/run", "POST /settings/backups/:id/restore-request (needs approval)"],
      }),
      E("report-runs", "Report Runs", ["Reports.ReportRuns"], {
        tpl: ["app/reports", "app/reports/studio"], api: "reports/runs", perm: ["rpt"],
        x: ["POST /reports/saved/:id/run", "GET /reports/runs/:id/download"], deps: ["saved-reports"],
      }),
      E("collaboration", "Activity, Comments & Attachments", ["Company.ActivityEvents", "Company.Comments", "Company.Mentions", "Company.Reactions", "Company.Attachments", "Company.Tags", "Company.TaggedRecords"], {
        tpl: ["app/activity"], api: "collaboration", perm: [],
        x: ["GET /collaboration/feed", "POST /collaboration/comments, POST /collaboration/reactions, POST /collaboration/attachments (upload)", "PUT /collaboration/tags/:recordType/:recordId"],
        rules: ["Visibility follows the target record's permission"], deps: ["users"],
      }),
    ],
  },
];
