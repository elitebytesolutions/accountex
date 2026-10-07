import type {
  Bank,
  BankRule,
  BankRuleSaveFields,
  BankRuleTestResult,
  FbrAuthority,
  FbrSetting,
  FbrSettingSaveFields,
  PettyCashFund,
  PettyCashFundCreateFields,
  SampleLine,
  BankAccount,
  BankAccountCreateFields,
  BankAccountUpdate,
  BankCreateFields,
  CashAccount,
  CashAccountCreateFields,
  CashAccountUpdate,
  CashCategory,
  CashCategoryCreateFields,
  ChequeBook,
  ChequeBookCreateFields,
  ExpenseCategory,
  ExpenseCategoryCreateFields,
  TaxCode,
  TaxCodeCreateFields,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Tax Codes, Banks & Bank Accounts (with cheque books) and Cash Setup. */

export type BranchOption = { id: string; code: string; name: string };
export type CurrencyOption = { code: string; name: string; symbol: string };
/** Select options any signed-in user may read (Settings lists need comp:view). */
export const listBranchOptions = () => apiRequest<BranchOption[]>("/settings/branches/options");
export const listCurrencyOptions = () => apiRequest<CurrencyOption[]>("/settings/currencies/options");

const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });
const act = <T>(path: string, rowVersion: number, extra?: Record<string, unknown>) => apiRequest<T>(path, { method: "POST", body: { rowVersion, ...extra } });

// Tax codes
export const listTaxCodes = () => apiRequest<TaxCode[]>("/tax/codes");
export const createTaxCode = (body: TaxCodeCreateFields) => apiRequest<TaxCode>("/tax/codes", { method: "POST", body });
export const updateTaxCode = (id: string, body: Partial<TaxCodeCreateFields> & { rowVersion: number }) => apiRequest<TaxCode>(`/tax/codes/${id}`, { method: "PATCH", body });
export const setTaxCodeActive = (id: string, on: boolean, rowVersion: number) => act<TaxCode>(`/tax/codes/${id}/${on ? "activate" : "deactivate"}`, rowVersion);
export const deleteTaxCode = (id: string, rowVersion: number) => del(`/tax/codes/${id}`, rowVersion);

// Banks
export const listBanks = () => apiRequest<Bank[]>("/bank/banks");
export const createBank = (body: BankCreateFields) => apiRequest<Bank>("/bank/banks", { method: "POST", body });
export const updateBank = (id: string, body: Partial<BankCreateFields> & { rowVersion: number }) => apiRequest<Bank>(`/bank/banks/${id}`, { method: "PATCH", body });
export const setBankActive = (id: string, on: boolean, rowVersion: number) => act<Bank>(`/bank/banks/${id}/${on ? "activate" : "deactivate"}`, rowVersion);
export const deleteBank = (id: string, rowVersion: number) => del(`/bank/banks/${id}`, rowVersion);

// Bank accounts
export const listBankAccounts = () => apiRequest<BankAccount[]>("/bank/accounts");
export const createBankAccount = (body: BankAccountCreateFields) => apiRequest<BankAccount>("/bank/accounts", { method: "POST", body });
export const updateBankAccount = (id: string, body: Partial<BankAccountUpdate> & { rowVersion: number }) =>
  apiRequest<BankAccount>(`/bank/accounts/${id}`, { method: "PATCH", body });
export const bankAccountAction = (id: string, action: "dormant" | "activate" | "close", rowVersion: number, closedOn?: string) =>
  act<BankAccount>(`/bank/accounts/${id}/${action}`, rowVersion, closedOn ? { closedOn } : undefined);
export const deleteBankAccount = (id: string, rowVersion: number) => del(`/bank/accounts/${id}`, rowVersion);

// Cheque books
export const listChequeBooks = (bankAccountId?: string) => apiRequest<ChequeBook[]>(`/bank/cheque-books${bankAccountId ? `?bankAccountId=${bankAccountId}` : ""}`);
export const createChequeBook = (body: ChequeBookCreateFields) => apiRequest<ChequeBook>("/bank/cheque-books", { method: "POST", body });
export const updateChequeBook = (id: string, body: Partial<Omit<ChequeBookCreateFields, "bankAccountId">> & { rowVersion: number }) =>
  apiRequest<ChequeBook>(`/bank/cheque-books/${id}`, { method: "PATCH", body });
export const chequeBookAction = (id: string, action: "activate" | "cancel", rowVersion: number) => act<ChequeBook>(`/bank/cheque-books/${id}/${action}`, rowVersion);
export const deleteChequeBook = (id: string, rowVersion: number) => del(`/bank/cheque-books/${id}`, rowVersion);

// Cash setup
export type CashResource = "accounts" | "categories" | "expense-categories";
export const listCashAccounts = () => apiRequest<CashAccount[]>("/cash/accounts");
export const createCashAccount = (body: CashAccountCreateFields) => apiRequest<CashAccount>("/cash/accounts", { method: "POST", body });
export const updateCashAccount = (id: string, body: Partial<CashAccountUpdate> & { rowVersion: number }) =>
  apiRequest<CashAccount>(`/cash/accounts/${id}`, { method: "PATCH", body });
export const listCashCategories = () => apiRequest<CashCategory[]>("/cash/categories");
export const createCashCategory = (body: CashCategoryCreateFields) => apiRequest<CashCategory>("/cash/categories", { method: "POST", body });
export const updateCashCategory = (id: string, body: Partial<CashCategoryCreateFields> & { rowVersion: number }) =>
  apiRequest<CashCategory>(`/cash/categories/${id}`, { method: "PATCH", body });
export const listExpenseCategories = () => apiRequest<ExpenseCategory[]>("/cash/expense-categories");
export const createExpenseCategory = (body: ExpenseCategoryCreateFields) => apiRequest<ExpenseCategory>("/cash/expense-categories", { method: "POST", body });
export const updateExpenseCategory = (id: string, body: Partial<ExpenseCategoryCreateFields> & { rowVersion: number }) =>
  apiRequest<ExpenseCategory>(`/cash/expense-categories/${id}`, { method: "PATCH", body });
export const setCashActive = (resource: CashResource, id: string, on: boolean, rowVersion: number) =>
  act<unknown>(`/cash/${resource}/${id}/${on ? "activate" : "deactivate"}`, rowVersion);
export const deleteCash = (resource: CashResource, id: string, rowVersion: number) => del(`/cash/${resource}/${id}`, rowVersion);

// Bank rules (Phase 5)
export const listBankRules = () => apiRequest<BankRule[]>("/bank/rules");
export const createBankRule = (body: BankRuleSaveFields) => apiRequest<BankRule>("/bank/rules", { method: "POST", body });
export const updateBankRule = (id: string, body: BankRuleSaveFields & { rowVersion: number }) => apiRequest<BankRule>(`/bank/rules/${id}`, { method: "PATCH", body });
export const setBankRuleEnabled = (id: string, on: boolean, rowVersion: number) => act<BankRule>(`/bank/rules/${id}/${on ? "enable" : "disable"}`, rowVersion);
export const reorderBankRules = (ids: string[]) => apiRequest<BankRule[]>("/bank/rules/order", { method: "PUT", body: { ids } });
export const deleteBankRule = (id: string, rowVersion: number) => del(`/bank/rules/${id}`, rowVersion);
export const testBankRules = (lines: SampleLine[], draft?: { matchMode: "ALL" | "ANY"; conditions: { field: string; operator: string; value: string }[] }) =>
  apiRequest<BankRuleTestResult>("/bank/rules/test", { method: "POST", body: { lines, draft } });

// Petty cash funds (Phase 5)
export const listPettyFunds = () => apiRequest<PettyCashFund[]>("/cash/petty-funds");
export const listCustodians = () => apiRequest<{ id: string; name: string }[]>("/cash/petty-funds/custodians");
export const createPettyFund = (body: PettyCashFundCreateFields) => apiRequest<PettyCashFund>("/cash/petty-funds", { method: "POST", body });
export const updatePettyFund = (id: string, body: Partial<Omit<PettyCashFundCreateFields, "account">> & { rowVersion: number }) =>
  apiRequest<PettyCashFund>(`/cash/petty-funds/${id}`, { method: "PATCH", body });
export const setPettyFundClosed = (id: string, closed: boolean, rowVersion: number) => act<PettyCashFund>(`/cash/petty-funds/${id}/${closed ? "close" : "reopen"}`, rowVersion);
export const deletePettyFund = (id: string, rowVersion: number) => del(`/cash/petty-funds/${id}`, rowVersion);

// FBR / PRA settings (Phase 5)
export const getFbrSettings = () => apiRequest<FbrSetting[]>("/tax/fbr");
export const saveFbrSettings = (authority: FbrAuthority, body: FbrSettingSaveFields) => apiRequest<FbrSetting>(`/tax/fbr/${authority}`, { method: "PUT", body });
