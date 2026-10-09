import type { Ctx, Step } from './ctx.ts';

/** Fiscal years for the history (FY 2024-25 covers Apr–Jun 2025, FY 2025-26 in full; the current year exists already). */
const fiscalYears: Step = {
  name: 'setup.fiscal-years',
  async run(ctx) {
    const years: any[] = await ctx.admin.get('/accounting/fiscal-years');
    const starts = new Set(years.map((y) => String(y.startDate).slice(0, 10)));
    for (const startDate of ['2024-07-01', '2025-07-01']) {
      if (starts.has(startDate)) continue;
      await ctx.admin.post('/accounting/fiscal-years', { startDate, hasAdjustmentPeriod: false });
      ctx.log(`  fiscal year from ${startDate}`);
    }
  },
};

/** The approver: a second user holding Finance Manager + HR Manager, for steps that refuse self-approval. */
const approverUser: Step = {
  name: 'setup.approver-user',
  async run(ctx) {
    const email = approverEmail();
    const users: any[] = await ctx.admin.all('/settings/users');
    if (!users.some((u) => u.email === email)) {
      const roles: any[] = await ctx.admin.all('/settings/roles');
      const pick = (keys: string[]) => roles.filter((r) => keys.includes(r.systemKey ?? r.code ?? r.key)).map((r) => r.id);
      let roleIds = pick(['FINANCE_MANAGER', 'FIN_MANAGER', 'HR_MANAGER', 'ADMIN']);
      if (!roleIds.length) roleIds = roles.filter((r) => /admin/i.test(r.name)).map((r) => r.id);
      const branches: any[] = await ctx.admin.get('/settings/branches/options');
      await ctx.admin.post('/settings/users', {
        fullName: 'Ayesha Malik', email, jobTitle: 'Finance & HR Manager', department: 'Finance',
        roleIds, branchIds: (Array.isArray(branches) ? branches : (branches as any).items).map((b: any) => b.id),
        approvalLimit: 100_000_000, dataScope: 'ALL', temporaryPassword: process.env.SHOWCASE_USER_PASSWORD, mustChangePassword: false,
      });
      ctx.log(`  approver ${email}`);
    }
  },
};

/** Branches: Head Office (Lahore, exists) + Karachi + Islamabad. State: ids.branches = [{ id, code, name }] (HO first). */
const branches: Step = {
  name: 'setup.branches',
  async run(ctx) {
    const want = [
      { code: 'KHI', name: 'Karachi', address: 'Plot 14, SITE Area, Karachi', city: 'Karachi', province: 'SINDH', phone: '021-32561234', openingDate: '2025-04-01' },
      { code: 'ISB', name: 'Islamabad', address: 'Office 7, I-9 Markaz, Islamabad', city: 'Islamabad', province: 'ICT', phone: '051-4431234', openingDate: '2025-04-01' },
    ];
    let list: any[] = await ctx.admin.all('/settings/branches');
    for (const b of want) if (!list.some((x) => x.code === b.code)) await ctx.admin.post('/settings/branches', b);
    list = await ctx.admin.all('/settings/branches');
    const ho = list.find((b) => b.isHeadOffice) ?? list[0];
    if (ho.name !== 'Lahore Head Office') await ctx.admin.patch(`/settings/branches/${ho.id}`, { name: 'Lahore Head Office', city: 'Lahore', province: 'PUNJAB', address: '42 Main Boulevard, Gulberg III, Lahore', rowVersion: ho.rowVersion });
    list = await ctx.admin.all('/settings/branches');
    ctx.state.ids.branches = [ho, ...list.filter((b) => b.id !== ho.id)].map((b) => ({ id: b.id, code: b.code, name: b.name }));
    ctx.log(`  branches: ${ctx.state.ids.branches.map((b: any) => b.code).join(', ')}`);
  },
};

export const approverEmail = () => `approver@${process.env.SHOWCASE_TENANT_CODE ?? 'showcase'}.accountex.local`;

export const steps: Step[] = [fiscalYears, approverUser, branches];
export type { Ctx };
