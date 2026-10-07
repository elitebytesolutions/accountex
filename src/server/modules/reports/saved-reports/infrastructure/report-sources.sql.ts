/**
 * The fixed SQL behind each report source: its FROM clause, tenant / date / branch columns and one expression per
 * allow-listed field key (the same keys as REPORT_SOURCES in src/shared/reports/saved-report.ts). Nothing here comes
 * from the request; user values are always bound as parameters by PrismaReportStore.run.
 */
export type SourceSql = {
  from: string;
  tenant: string;
  /** Always-on conditions (e.g. not deleted, posted only). */
  where?: string;
  date?: string;
  branch?: string;
  fields: Record<string, string>;
};

const branchJoin = (alias: string, col: string) => `left join "Company"."Branches" b on b."tenantId" = ${alias}."tenantId" and b.id = ${col}`;

export const SOURCE_SQL: Record<string, SourceSql> = {
  // Sales.SalesInvoices (+ customer, branch). Draft and void invoices are not sales.
  SALES_INVOICES: {
    from: `"Sales"."SalesInvoices" si
      left join "Sales"."Customers" c on c."tenantId" = si."tenantId" and c.id = si."customerId"
      ${branchJoin('si', 'si."branchId"')}`,
    tenant: 'si."tenantId"',
    where: `si.status not in ('DRAFT', 'VOID')`,
    date: 'si."docDate"',
    branch: 'si."branchId"',
    fields: {
      docNo: 'si."docNo"', docDate: 'si."docDate"', dueDate: 'si."dueDate"', customer: 'coalesce(c.name, si."buyerName")', branch: 'b.name',
      city: 'si."buyerCity"', salesperson: 'si."salesmanName"', status: 'si.status', invoiceCount: '1', netSales: 'si."taxableAmount"', gst: 'si."taxAmount"',
      furtherTax: 'si."furtherTaxAmount"', grossTotal: 'si."netAmount"', paid: 'si."paidAmount"', balance: 'si."balanceAmount"',
    },
  },
  // Purchases.VendorBills (+ vendor, branch). Built in Phase 19; draft and void bills excluded.
  VENDOR_BILLS: {
    from: `"Purchases"."VendorBills" vb
      left join "Purchases"."Vendors" v on v."tenantId" = vb."tenantId" and v.id = vb."vendorId"
      ${branchJoin('vb', 'vb."branchId"')}`,
    tenant: 'vb."tenantId"',
    where: `vb.status not in ('DRAFT', 'VOID')`,
    date: 'vb."docDate"',
    branch: 'vb."branchId"',
    fields: {
      docNo: 'vb."docNo"', docDate: 'vb."docDate"', dueDate: 'vb."dueDate"', vendor: 'v.name', vendorInvoiceNo: 'vb."vendorInvoiceNo"', branch: 'b.name',
      status: 'vb.status', billCount: '1', netAmount: 'vb."netAmount"', tax: 'vb."taxAmount"', total: 'vb."totalAmount"', wht: 'vb."whtAmount"', balance: 'vb."balanceAmount"',
    },
  },
  // Accounting.VoucherLines of posted / reversed vouchers (+ account, branch). Built in Phase 16.
  GL_TRANSACTIONS: {
    from: `"Accounting"."VoucherLines" l
      join "Accounting"."Vouchers" v on v."tenantId" = l."tenantId" and v.id = l."journalEntryId"
      left join "Accounting"."ChartOfAccounts" a on a."tenantId" = l."tenantId" and a.id = l."accountId"
      ${branchJoin('l', 'coalesce(l."branchId", v."branchId")')}`,
    tenant: 'l."tenantId"',
    where: `v.status in ('POSTED', 'REVERSED')`,
    date: 'v."postingDate"',
    branch: 'coalesce(l."branchId", v."branchId")',
    fields: {
      docNo: 'v."docNo"', voucherType: 'v."voucherType"', postingDate: 'v."postingDate"', accountCode: 'a.code', account: 'a.name',
      particulars: 'coalesce(l.particulars, v.narration)', branch: 'b.name', lineCount: '1', debit: 'l.debit', credit: 'l.credit', net: '(l.debit - l.credit)',
    },
  },
  // Sales.Customers (+ group, branch). A master list: no date range.
  CUSTOMERS: {
    from: `"Sales"."Customers" c
      left join "Sales"."CustomerGroups" g on g."tenantId" = c."tenantId" and g.id = c."customerGroupId"
      ${branchJoin('c', 'c."branchId"')}`,
    tenant: 'c."tenantId"',
    where: 'c."deletedAt" is null',
    branch: 'c."branchId"',
    fields: {
      code: 'c.code', name: 'c.name', customerType: 'c."customerType"', group: 'g.name', branch: 'b.name', city: 'c.city', area: 'c.area', status: 'c.status',
      customerCount: '1', creditLimit: 'c."creditLimit"', creditDays: 'c."creditDays"', openingBalance: 'c."openingBalance"',
    },
  },
  // Inventory.StockMovements (+ item, warehouse; the branch is the warehouse's).
  STOCK_MOVEMENTS: {
    from: `"Inventory"."StockMovements" m
      left join "Inventory"."Products" p on p."tenantId" = m."tenantId" and p.id = m."itemId"
      left join "Inventory"."Warehouses" w on w."tenantId" = m."tenantId" and w.id = m."warehouseId"`,
    tenant: 'm."tenantId"',
    date: 'm."movementDate"',
    branch: 'w."branchId"',
    fields: {
      movementDate: 'm."movementDate"', docNo: 'm."sourceDocNo"', movementType: 'm."movementType"', sku: 'p.sku', item: 'p.name', warehouse: 'w.name', party: 'm."partyLabel"',
      movementCount: '1', qtyIn: 'm."qtyIn"', qtyOut: 'm."qtyOut"', netQty: '(m."qtyIn" - m."qtyOut")', value: 'm.value',
    },
  },
  // Payroll.PayrollRunLines of approved / posted / paid runs (+ employee, department, branch). Built in Phase 32.
  PAYROLL_LINES: {
    from: `"Payroll"."PayrollRunLines" pl
      join "Payroll"."PayrollRuns" r on r."tenantId" = pl."tenantId" and r.id = pl."payrollRunId"
      left join "HumanResources"."Employees" e on e."tenantId" = pl."tenantId" and e.id = pl."employeeId"
      left join "HumanResources"."Departments" d on d."tenantId" = pl."tenantId" and d.id = pl."departmentId"
      ${branchJoin('pl', 'pl."branchId"')}`,
    tenant: 'pl."tenantId"',
    where: `r.status in ('APPROVED', 'POSTED', 'PAID')`,
    date: 'r."payrollMonth"',
    branch: 'pl."branchId"',
    fields: {
      payrollMonth: 'r."payrollMonth"', runNo: 'r."docNo"', employeeCode: 'e.code', employee: 'e."displayName"', department: 'd.name', branch: 'b.name',
      employeeCount: '1', paidDays: 'pl."paidDays"', gross: 'pl."grossAmount"', tax: 'pl."taxAmount"', deductions: 'pl."deductionAmount"', net: 'pl."netAmount"',
    },
  },
};
