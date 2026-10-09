/**
 * Showcase company seeder: creates "Showcase Traders (Pvt) Ltd" (code `showcase`), an FMCG distributor with 18 months of
 * history (Apr 2025 → today), and fills every module through the real API, so posting, row history and reports work as
 * in the app. Run with the app server up: `npm run seed:showcase` (API_BASE defaults to http://localhost:3000/api).
 * Options: --only=<step-prefix>  --from=<step-name>  --redo=<step-name> (forget that step and run it again).
 * Progress is kept in scripts/seed-showcase/.state.json, so a re-run continues where it stopped and is otherwise a no-op.
 * Credentials: SHOWCASE_USER_EMAIL / SHOWCASE_USER_PASSWORD in .env (generated on the first run).
 */
import { appendFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Api } from './client.ts';
import { loadState, saveState, type Ctx, type Step } from './ctx.ts';
import { approverEmail, steps as setupSteps } from './setup.ts';
import { steps as companySteps } from './masters-company.ts';
import { steps as tradeMasterSteps } from './masters-trade.ts';
import { steps as peopleSteps } from './masters-people.ts';
import { steps as tradeSteps } from './tx-trade.ts';
import { steps as ledgerSteps } from './tx-ledger.ts';
import { steps as hrSteps } from './tx-hr.ts';
import { steps as payrollSteps } from './tx-payroll.ts';
import { steps as closeSteps } from './tx-close.ts';

/** Order matters: masters, then trade (stock in before stock out), then everything that reads posted books, close last. */
const STEPS: Step[] = [...setupSteps, ...companySteps, ...tradeMasterSteps, ...peopleSteps, ...tradeSteps, ...ledgerSteps, ...hrSteps, ...payrollSteps, ...closeSteps];

if (existsSync('.env')) process.loadEnvFile('.env');
const base = process.env.API_BASE ?? 'http://localhost:3000/api';
const code = process.env.SHOWCASE_TENANT_CODE ?? 'showcase';
const email = process.env.SHOWCASE_USER_EMAIL ?? `admin@${code}.accountex.local`;
let password = process.env.SHOWCASE_USER_PASSWORD;
if (!password) {
  password = `Show${randomBytes(6).toString('hex')}9`;
  appendFileSync('.env', `\nSHOWCASE_TENANT_CODE="${code}"\nSHOWCASE_USER_EMAIL="${email}"\nSHOWCASE_USER_PASSWORD="${password}"\n`);
  process.env.SHOWCASE_USER_PASSWORD = password;
}

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(5)}s] ${msg}`);

async function main() {
  const state = loadState();
  const sa = new Api(base, 'superadmin');
  await sa.login('/admin/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });

  // 1. Company (Super Admin › Onboard Tenant: provisioning, chart of accounts, modules, subscription, seed lists).
  const found: any = await sa.get(`/admin/tenants?search=${code}`);
  let tenant = found.items.find((t: any) => t.code === code);
  if (!tenant) {
    const plans: any = await sa.get('/admin/plans');
    const plan = (plans.items ?? plans).find((p: any) => p.code === 'ENTERPRISE') ?? (plans.items ?? plans)[0];
    const r: any = await sa.post('/admin/tenants', {
      displayName: 'Showcase Traders', legalName: 'Showcase Traders (Pvt) Ltd', ntn: '4512398-6', strn: '3277876154321',
      industry: 'FMCG', city: 'Lahore', province: 'PUNJAB', address: '42 Main Boulevard, Gulberg III, Lahore',
      phone: '042-35761234', email: 'accounts@showcase.example.com', code, planId: plan.id, billingCycle: 'ANNUAL', startTrial: false,
      modules: ['ACC', 'SAL', 'PUR', 'INV', 'FA', 'PAY', 'ATT', 'REC', 'ESS', 'FBR', 'DIST', 'POS'],
      adminName: 'Usman Tariq', adminEmail: email, adminPassword: password, adminPasswordConfirm: password, adminDesignation: 'Managing Director',
      fiscalYearStartMonth: 7, seedTaxCodes: true, seedHrLists: true,
    });
    tenant = r.tenant;
    log(`company created: ${tenant.code} (${tenant.id})`);
  }
  if (state.tenantId && state.tenantId !== tenant.id) throw new Error('State file belongs to another company; delete scripts/seed-showcase/.state.json');
  state.tenantId = tenant.id;
  saveState(state);

  const admin = new Api(base, 'admin');
  await admin.login('/auth/login', { email, password, companyCode: code });
  const approver = new Api(base, 'approver');
  const ctx: Ctx = { sa, admin, approver, tenantId: tenant.id, state, save: () => saveState(state), log };

  const redo = arg('redo');
  if (redo) state.done = state.done.filter((d) => d !== redo);
  const only = arg('only');
  const from = arg('from');
  let reached = !from;
  for (const step of STEPS) {
    if (step.name === from) reached = true;
    if (!reached || (only && !step.name.startsWith(only)) || state.done.includes(step.name)) continue;
    if (step.name !== 'setup.fiscal-years' && step.name !== 'setup.approver-user' && !approverReady) {
      await approver.login('/auth/login', { email: approverEmail(), password, companyCode: code });
      approverReady = true;
    }
    log(`> ${step.name}`);
    await step.run(ctx);
    state.done.push(step.name);
    ctx.save();
  }
  log(`done: ${admin.calls + approver.calls} API calls`);
  console.log(`\nSign in at ${base.replace(/\/api$/, '')}/login\n  Company code: ${code}\n  Admin:    ${email}\n  Approver: ${approverEmail()}\n  Password: (SHOWCASE_USER_PASSWORD in .env)`);
}
let approverReady = false;

main().catch((e) => { console.error(e); process.exit(1); });
