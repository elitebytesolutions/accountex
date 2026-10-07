/**
 * Default permission grants for the tenant system roles, written by prisma/seed.ts.
 * Role keys are SystemKey lookup codes (prisma/sql/002-tenant-role-lookups.sql).
 * Grants are resource -> actions; the seed turns them into Company.Permissions codes
 * ("coa:view") and skips any action a resource does not offer.
 */

type Action = 'view' | 'create' | 'edit' | 'approve' | 'post' | 'delete' | 'export';
type Grants = Record<string, Action[]>;

const WORK: Action[] = ['view', 'create', 'edit', 'approve', 'post', 'export'];
const ENTRY: Action[] = ['view', 'create', 'edit'];
const READ: Action[] = ['view', 'export'];

const grant = (resources: string[], actions: Action[]): Grants =>
  Object.fromEntries(resources.map((r) => [r, actions]));

const FINANCE = ['coa', 'vch', 'cash', 'bank', 'recon', 'fa', 'tax', 'bud', 'close', 'frep'];
const TRADE = ['quo', 'sinv', 'rcpt', 'cust', 'po', 'bill', 'vpay', 'vend'];
const HR = ['emp', 'att', 'lv', 'prun', 'loan', 'fs', 'hrep'];

/** `'*'` grants the actions on every permission resource. */
export const SYSTEM_ROLE_GRANTS: Record<string, Grants | { '*': Action[] }> = {
  ADMIN: { '*': ['view', 'create', 'edit', 'approve', 'post', 'delete', 'export'] },
  FINANCIAL_ACCOUNTANT: {
    ...grant(FINANCE, WORK),
    ...grant(TRADE, WORK),
    ...grant(['item', 'irep'], ['view']),
    rpt: READ,
    ...grant(['settle', 'recov'], ['view', 'approve', 'post', 'export']),
    bulkinv: ['view', 'create', 'approve', 'post', 'export'],
    wsentry: ['view', 'create', 'edit', 'export'],
    crovr: ['view', 'approve', 'export'],
    drep: READ,
  },
  HR_MANAGER: {
    ...grant(HR, ['view', 'create', 'edit', 'approve', 'post', 'delete', 'export']),
    rpt: READ,
  },
  SALESMAN: {
    ...grant(['quo', 'sinv', 'cust'], ENTRY),
    ...grant(['rcpt', 'pos'], ['view', 'create']),
    item: ['view'],
    ...grant(['booking', 'recov'], ENTRY),
    ...grant(['wsentry', 'settle'], ['view', 'create']),
    ...grant(['backord', 'route', 'target', 'drep'], ['view']),
  },
  DELIVERYMAN: {
    sinv: ['view'],
    ...grant(['loadsht', 'van'], ['view']),
    delivery: ['view', 'edit'],
    ...grant(['recov', 'settle'], ['view', 'create']),
  },
  STOREKEEPER: {
    ...grant(['item', 'wh'], ENTRY),
    ...grant(['grn', 'adj', 'xfer', 'cnt'], ['view', 'create', 'edit', 'post']),
    ...grant(['po', 'vend'], ['view']),
    irep: READ,
    loadsht: ['view', 'create', 'edit', 'post'],
    backord: ['view', 'edit'],
    van: ['view'],
  },
  CASHIER: {
    cash: ['view', 'create', 'edit', 'post'],
    ...grant(['rcpt', 'pos'], ['view', 'create']),
    ...grant(['settle', 'recov'], ['view', 'edit']),
  },
  ORDER_BOOKER: {
    booking: ENTRY,
    ...grant(['backord', 'route', 'target'], ['view']),
    ...grant(['cust', 'item'], ['view']),
  },
  AUDITOR: { '*': READ },
  /** Every user holds this (DB trigger); self-service screens under My Profile, own data only. */
  EMPLOYEE: {
    ...grant(['myday', 'dir'], ['view']),
    ...grant(['myprof', 'mygoal', 'myonb'], ['view', 'edit']),
    ...grant(['myatt', 'mylv', 'myshift', 'myloan', 'myreq', 'myhelp', 'mykudos'], ['view', 'create']),
    ...grant(['mytax', 'myexp'], ENTRY),
    mypay: READ,
    myteam: ['view', 'approve'],
  },
};
