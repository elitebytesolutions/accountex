import type { PrismaService } from './prisma.service.js';

/** Allow-listed tables (interpolated into SQL as regclass literals). */
const TABLES = {
  taxCodes: '"Tax"."TaxCodes"',
  taxCodeRates: '"Tax"."TaxCodeRates"',
  banks: '"BankCash"."Banks"',
  bankAccounts: '"BankCash"."BankAccounts"',
  chequeBooks: '"BankCash"."ChequeBooks"',
  cashAccounts: '"BankCash"."CashAccounts"',
  cashCategories: '"BankCash"."CashCategories"',
  expenseCategories: '"BankCash"."ExpenseCategories"',
  bankRules: '"BankCash"."BankRules"',
  bankRuleConditions: '"BankCash"."BankRuleConditions"',
  pettyCashFunds: '"BankCash"."PettyCashFunds"',
  fixedAssetCategories: '"FixedAssets"."FixedAssetCategories"',
  unitsOfMeasure: '"Inventory"."UnitsOfMeasure"',
  productCompanies: '"Inventory"."ProductCompanies"',
  productClasses: '"Inventory"."ProductClasses"',
  productSubclasses: '"Inventory"."ProductSubclasses"',
  warehouses: '"Inventory"."Warehouses"',
  warehouseBins: '"Inventory"."WarehouseBins"',
  stockMovementReasons: '"Inventory"."StockMovementReasons"',
  products: '"Inventory"."Products"',
  productUnits: '"Inventory"."ProductUnits"',
  productBarcodes: '"Inventory"."ProductBarcodes"',
  productSuppliers: '"Inventory"."ProductSuppliers"',
  productBatches: '"Inventory"."ProductBatches"',
  productPriceLogs: '"Inventory"."ProductPriceLogs"',
  kits: '"Inventory"."KitsAndBundles"',
  kitComponents: '"Inventory"."KitComponents"',
  labelTemplates: '"Inventory"."BarcodeLabelTemplates"',
  reorderRules: '"Inventory"."ReorderRules"',
  customerGroups: '"Sales"."CustomerGroups"',
  customers: '"Sales"."Customers"',
  customerContacts: '"Sales"."CustomerContacts"',
  customerAddresses: '"Sales"."CustomerAddresses"',
  customerNotes: '"Sales"."CustomerNotes"',
  vendorCategories: '"Purchases"."VendorCategories"',
  vendors: '"Purchases"."Vendors"',
  vendorContacts: '"Purchases"."VendorContacts"',
  vendorBankAccounts: '"Purchases"."VendorBankAccounts"',
  priceLists: '"Sales"."PriceLists"',
  priceListItems: '"Sales"."PriceListItems"',
  quantityBreaks: '"Sales"."PriceListQuantityBreaks"',
  schemes: '"Sales"."SalesSchemes"',
  schemeItems: '"Sales"."SalesSchemeItems"',
  schemeEligibilities: '"Sales"."SalesSchemeEligibilities"',
  reminderTemplates: '"Sales"."PaymentReminderTemplates"',
  reminderRules: '"Sales"."PaymentReminderRules"',
  priceTiers: '"Distribution"."PriceTiers"',
  departments: '"HumanResources"."Departments"',
  designations: '"HumanResources"."Designations"',
  grades: '"HumanResources"."Grades"',
  workShifts: '"HumanResources"."WorkShifts"',
  holidays: '"HumanResources"."Holidays"',
  holidayBranches: '"HumanResources"."HolidayBranches"',
  leaveTypes: '"HumanResources"."LeaveTypes"',
  leaveEligibilityRules: '"HumanResources"."LeaveEligibilityRules"',
  overtimePolicies: '"HumanResources"."OvertimePolicies"',
  devices: '"HumanResources"."BiometricDevices"',
  employees: '"HumanResources"."Employees"',
  employeeStatutory: '"HumanResources"."EmployeeStatutoryDetails"',
  employeeBankAccounts: '"HumanResources"."EmployeeBankAccounts"',
  employeeDocuments: '"HumanResources"."EmployeeDocuments"',
  employeePositionHistory: '"HumanResources"."EmployeePositionHistory"',
} as const;
export type ReferencedTable = keyof typeof TABLES;

/** Company.isReferenced: does any row (through a real foreign key) point at this id? `ignore` = the row's own child tables. */
export async function isReferenced(prisma: PrismaService, table: ReferencedTable, id: string, ignore: ReferencedTable[] = []): Promise<boolean> {
  const ignoreSql = ignore.length ? `array[${ignore.map((t) => `'${TABLES[t]}'::regclass`).join(',')}]` : `'{}'::regclass[]`;
  const rows = await prisma.db().$queryRawUnsafe<{ used: boolean }[]>(
    `select "Company"."isReferenced"('${TABLES[table]}'::regclass, $1::uuid, ${ignoreSql}) as used`,
    id,
  );
  return rows[0]!.used;
}

/**
 * Today's balance (debit − credit of posted and reversed vouchers) of GL accounts, keyed by account id. Same sum as
 * BankCash.getBankAccountBalanceOn / getCashAccountBalanceOn, with the tenant passed in (those read app.tenantId,
 * which is only set inside a write transaction).
 */
export async function glBalances(prisma: PrismaService, tenantId: string, accountIds: string[]): Promise<Map<string, number>> {
  if (!accountIds.length) return new Map();
  const rows = await prisma.db().$queryRaw<{ accountId: string; balance: string }[]>`
    select jl."accountId"::text as "accountId", sum(jl.debit - jl.credit)::text as balance
      from "Accounting"."VoucherLines" jl
      join "Accounting"."Vouchers" je on je."tenantId" = jl."tenantId" and je.id = jl."journalEntryId"
     where jl."tenantId" = ${tenantId}::uuid and jl."accountId" = any(${accountIds}::uuid[])
       and je.status in ('POSTED', 'REVERSED') and je."postingDate" <= current_date
     group by jl."accountId"`;
  return new Map(rows.map((r) => [r.accountId, Number(r.balance)]));
}
