// `.ts` extensions so both bundlers resolve them: Next.js reads the files directly,
// and the server build rewrites them to `.js` (rewriteRelativeImportExtensions).
export * from './common/api-error.ts';
export * from './auth/login.schema.ts';
export * from './auth/session-user.ts';
export * from './admin-auth/admin-session.ts';
export * from './admin-auth/admin-login.schema.ts';
export * from './common/list-query.ts';
export * from './common/history.ts';
export * from './settings/lookups.ts';
export * from './settings/branch.ts';
export * from './settings/currency.ts';
export * from './settings/company-settings.ts';
export * from './settings/numbering.ts';
export * from './settings/setup-guide.ts';
export * from './access/user.ts';
export * from './access/role.ts';
export * from './access/me.ts';
export * from './access/sod.ts';
export * from './access/approval-workflow.ts';
export * from './access/approval-conditions.ts';
export * from './settings/document-template.ts';
export * from './finance/account-code.ts';
export * from './finance/account.ts';
export * from './finance/fiscal.ts';
export * from './finance/cost-centre.ts';
export * from './finance/mapping.ts';
export * from './treasury/common.ts';
export * from './treasury/tax-code.ts';
export * from './treasury/bank.ts';
export * from './treasury/cash.ts';
export * from './treasury/bank-rule.ts';
export * from './treasury/petty-cash.ts';
export * from './treasury/banking.ts';
export * from './treasury/cash-ops.ts';
// Phase 19: purchasing
export * from './purchases/purchasing.ts';
// Phase 20: payables
export * from './purchases/payables.ts';
export * from './assets/category.ts';
// Phase 27: fixed asset register, depreciation, transfers, disposals; budgets
export * from './assets/register.ts';
export * from './finance/budget.ts';
export * from './tax/fbr.ts';
export * from './access/sod-rule.ts';
export * from './inventory/unit.ts';
export * from './inventory/company.ts';
export * from './inventory/product-class.ts';
export * from './inventory/warehouse.ts';
export * from './inventory/movement-reason.ts';
export * from './inventory/product.ts';
export * from './inventory/batch.ts';
export * from './inventory/kit.ts';
export * from './inventory/label.ts';
export * from './inventory/reorder.ts';
// Phase 21: stock operations
export * from './inventory/stock-ops.ts';
// Phase 22: stock vouchers & demand
export * from './inventory/stock-demand.ts';
export * from './parties/common.ts';
export * from './parties/customer-group.ts';
export * from './parties/customer.ts';
export * from './parties/vendor-category.ts';
export * from './parties/vendor.ts';
export * from './sales/price-list.ts';
export * from './sales/scheme.ts';
export * from './sales/price-tier.ts';
export * from './sales/reminder.ts';
// Phase 23: sales documents
export * from './sales/documents.ts';
// Phase 25: wholesale
export * from './sales/wholesale.ts';
export * from './hr/organisation.ts';
export * from './hr/people.ts';
export * from './hr/policies.ts';
export * from './hr/talent.ts';
// Phase 30: time & attendance
export * from './hr/attendance.ts';
export * from './hr/regularisation.ts';
export * from './hr/roster.ts';
export * from './hr/overtime-claim.ts';
// Phase 31: leave & lifecycle
export * from './hr/leave-request.ts';
export * from './hr/leave-balance.ts';
export * from './hr/onboarding.ts';
export * from './hr/offboarding.ts';
export * from './payroll/setup.ts';
// Phase 32: payroll runs, loans, payslips, tax declarations
export * from './payroll/run.ts';
export * from './payroll/loan.ts';
export * from './payroll/payslip.ts';
export * from './payroll/tax-declaration.ts';
export * from './finance/gl.ts';
export * from './platform/history.ts';
export * from './platform/plan.ts';
export * from './platform/module.ts';
export * from './platform/addon.ts';
export * from './platform/coupon.ts';
export * from './platform/flag.ts';
export * from './platform/maintenance.ts';
export * from './platform/alert-rule.ts';
export * from './platform/dunning.ts';
export * from './platform/segment.ts';
export * from './platform/reseller.ts';
export * from './platform/security.ts';
export * from './platform/coa-template.ts';
export * from './platform/seed-template.ts';
export * from './platform/tax-master.ts';
export * from './platform/comm-template.ts';
// Phase 40: tenant lifecycle
export * from './platform/tenant.ts';
export * from './platform/subscription.ts';
export * from './platform/usage.ts';
export * from './platform/impersonation.ts';
// Phase 42: growth & support
export * from './platform/lead.ts';
export * from './platform/ticket.ts';
export * from './platform/announcement.ts';
export * from './platform/broadcast.ts';
export * from './platform/comm-log.ts';
// Phase 41: platform billing
export * from './platform/invoice.ts';
export * from './platform/payment.ts';
export * from './platform/dunning-case.ts';
export * from './platform/payout.ts';
// Phase 43: platform operations
export * from './platform/incident.ts';
export * from './platform/change-request.ts';
export * from './platform/privacy-request.ts';
export * from './platform/entitlement-log.ts';
// Phase 24: sales completion (returns, credit notes, receipts, recurring invoices, POS, AR reports)
export * from './sales/receivables.ts';
// Phase 26: distribution (load sheets, route settlements, recovery, targets & commissions, credit control)
export * from './sales/distribution-ops.ts';
