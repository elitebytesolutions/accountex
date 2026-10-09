import { pool, soft, type Ctx, type Step } from './ctx.ts';
import { addDays, rngFor, today } from './rng.ts';
import { as, empByCode, employees, ensureLogin, EXIT, walkApproval } from './tx-hr-common.ts';

/**
 * HR extras that make the HR and My Profile screens full: onboarding of the three joiners, letters and company assets
 * issued to employees, the FY 2025-26 performance cycle (goals → reviews → sign-off) and the running H1 FY 2026-27 one,
 * feedback and 1:1s, training sessions and enrolments, recruitment (3 openings, 15 candidates, 1 hire), and
 * self-service activity (kudos, poll votes, policy acknowledgements, announcement reads, helpdesk tickets, letter and
 * profile-change requests, attendance regularisations). Every step is idempotent (it checks for its own rows first).
 */

const id = (ctx: Ctx, code: string) => empByCode(ctx, code).id;
const items = (r: any): any[] => (Array.isArray(r) ? r : (r?.items ?? []));

// ---------------------------------------------------------------------------------------------------- onboarding
const onboarding: Step = {
  name: 'tx.hr.x.onboarding',
  async run(ctx) {
    const joiners = [
      { code: 'EMP-0020', buddy: 'EMP-0019', all: true },
      { code: 'EMP-0028', buddy: 'EMP-0026', all: true },
      { code: 'EMP-0027', buddy: 'EMP-0025', all: false },
    ];
    // The company has no onboarding template yet: create the standard new-joiner checklist and make it the default.
    let tpl = items(await ctx.admin.get('/hr/onboarding-templates')).find((t) => t.name === 'New joiner (standard)');
    if (!tpl) {
      const t = (taskGroup: string, title: string, ownerFunction: string, dueOffsetDays: number, actionKind = 'NONE') => ({ taskGroup, title, ownerFunction, dueOffsetDays, actionKind });
      tpl = await ctx.admin.post('/hr/onboarding-templates', { name: 'New joiner (standard)', track: 'NEW_JOINER', tasks: [
        t('DOCUMENTS', 'Collect CNIC copy, degrees and two photos', 'HR', -3, 'UPLOAD'),
        t('STATUTORY_FINANCE', 'Register with EOBI and social security', 'HR', 7),
        t('STATUTORY_FINANCE', 'Open the salary account and add the IBAN', 'FINANCE', 5),
        t('IT_ADMIN', 'Issue laptop or phone, email and order-app login', 'IT', 0),
        t('IT_ADMIN', 'Access card and biometric enrolment', 'ADMIN', 0),
        t('BUDDY', 'Meet your buddy and shadow a route day', 'BUDDY', 2, 'BOOK_BUDDY'),
        t('POLICIES', 'Read and sign the Code of Conduct', 'EMPLOYEE', 3, 'POLICY_ACK'),
        t('ORIENTATION', 'Branch tour and warehouse safety walk', 'MANAGER', 1),
        t('TRAINING', 'Order-booking app training', 'MANAGER', 5, 'TRAINING'),
      ] });
      const cur: any = await ctx.admin.get(`/hr/onboarding-templates/${tpl.id}`);
      if (cur.status !== 'ACTIVE') await soft(ctx, 'activate template', () => ctx.admin.post(`/hr/onboarding-templates/${tpl.id}/activate`, { rowVersion: cur.rowVersion }));
      const cur2: any = await ctx.admin.get(`/hr/onboarding-templates/${tpl.id}`);
      await soft(ctx, 'default template', () => ctx.admin.post(`/hr/onboarding-templates/${tpl.id}/default`, { rowVersion: cur2.rowVersion }));
    }
    const list = items(await ctx.admin.get('/hr/onboardings?status=ALL'));
    for (const j of joiners) {
      const e = empByCode(ctx, j.code);
      let ob = list.find((o) => (o.employee?.id ?? o.employeeId) === e.id);
      if (!ob) ob = await ctx.admin.post('/hr/onboardings', { employeeId: e.id, templateId: tpl.id, joiningDate: e.joinDate, startDate: addDays(e.joinDate, -7), targetDate: addDays(e.joinDate, 30), buddyEmployeeId: id(ctx, j.buddy) });
      const full: any = await ctx.admin.get(`/hr/onboardings/${ob.id}`);
      const tasks: any[] = full.tasks ?? [];
      const todo = j.all ? tasks : tasks.slice(0, Math.ceil(tasks.length * 0.6));
      for (const t of todo) {
        if (t.status === 'COMPLETED') continue;
        await soft(ctx, `onboarding task ${t.title ?? t.id}`, () => ctx.admin.patch(`/hr/onboardings/${ob.id}/tasks/${t.id}`, { status: 'COMPLETED', progressPct: 100, completionNote: 'Done', rowVersion: t.rowVersion }));
      }
      ctx.log(`  onboarding ${e.name}: ${todo.length}/${tasks.length} tasks done`);
    }
  },
};

// ---------------------------------------------------------------------------------------------------- leave year end
/** Closes the leave years that have ended (Jul–Jun): unused balances carry forward, are encashed or lapse. */
const leaveYearEnd: Step = {
  name: 'tx.hr.x.leave-year-end',
  async run(ctx) {
    for (const year of ['2024-07-01', '2025-07-01']) {
      const v: any = await ctx.admin.get(`/hr/leave-year-end?year=${year}`);
      if (v.closed) continue;
      await soft(ctx, `leave year ${year}`, () => ctx.admin.post(`/hr/leave-year-end/${year}/close`, { encashmentTarget: 'NEXT_PAYROLL', emailStatements: false }));
      ctx.log(`  leave year from ${year} closed`);
    }
  },
};

// ---------------------------------------------------------------------------------------------------- letters & assets
const lettersAndAssets: Step = {
  name: 'tx.hr.x.letters-assets',
  async run(ctx) {
    const letters = [
      { code: 'EMP-0028', letterType: 'CONFIRMATION', letterDate: '2025-12-01', addressedTo: null, includeSalary: false },
      { code: 'EMP-0003', letterType: 'SALARY_CERTIFICATE', letterDate: '2026-02-10', addressedTo: 'The Manager, Meezan Bank, Gulberg Branch', includeSalary: true },
      { code: 'EMP-0016', letterType: 'INCREMENT', letterDate: '2026-07-01', addressedTo: null, includeSalary: true },
      { code: EXIT.code, letterType: 'EXPERIENCE', letterDate: EXIT.exitDate, addressedTo: 'To whom it may concern', includeSalary: false },
    ];
    let n = 0;
    for (const l of letters) {
      const e = empByCode(ctx, l.code);
      const have = items(await ctx.admin.get(`/hr/employees/${e.id}/letters`));
      if (have.some((x) => x.letterType === l.letterType)) continue;
      const r = await soft(ctx, `letter ${l.letterType}`, () => ctx.admin.post(`/hr/employees/${e.id}/letters`, { letterType: l.letterType, letterDate: l.letterDate, addressedTo: l.addressedTo, includeSalary: l.includeSalary, signatoryEmployeeId: id(ctx, 'EMP-0002') }));
      if (r) n++;
    }
    const rng = rngFor('hr-assets');
    const issues: { code: string; category: string; assetName: string; spec: string; value: number; on?: string }[] = [];
    for (const e of employees(ctx)) {
      const on = e.joinDate > '2025-04-01' ? e.joinDate : '2025-04-01';
      if (['FIN', 'HRA', 'MGT'].includes(e.departmentCode) || e.designation.includes('Manager') || e.designation === 'Sales Officer')
        issues.push({ code: e.code, category: 'LAPTOP', assetName: rng.pick(['Dell Latitude 5440', 'HP ProBook 450 G10', 'Lenovo ThinkPad E14']), spec: 'Core i5, 16 GB RAM, 512 GB SSD', value: rng.money(185_000, 240_000, 1000), on });
      if (e.departmentCode === 'SAL') issues.push({ code: e.code, category: 'MOBILE', assetName: rng.pick(['Samsung Galaxy A35', 'Infinix Note 40', 'Tecno Camon 30']), spec: 'Order-booking app installed', value: rng.money(55_000, 95_000, 1000), on });
      if (e.departmentCode === 'SAL') issues.push({ code: e.code, category: 'SIM', assetName: 'Jazz corporate SIM', spec: 'Rs 1,500 monthly package', value: 0, on });
      if (e.designation === 'Delivery Driver') issues.push({ code: e.code, category: 'FUEL_CARD', assetName: 'PSO fuel card', spec: 'Limit Rs 60,000 a month', value: 0, on });
      issues.push({ code: e.code, category: 'ACCESS_CARD', assetName: 'Office access card', spec: 'Biometric + RFID', value: 0, on });
    }
    let a = 0;
    await pool(issues, 5, async (x) => {
      const e = empByCode(ctx, x.code);
      const have = items(await ctx.admin.get(`/hr/employees/${e.id}/assets`));
      if (have.some((h) => h.category === x.category)) return;
      const r: any = await soft(ctx, `asset ${x.category} ${x.code}`, () => ctx.admin.post(`/hr/employees/${e.id}/assets`, {
        category: x.category, assetName: x.assetName, specification: x.spec, tag: `${x.category.slice(0, 3)}-${x.code.slice(4)}`, issuedOn: x.on!, condition: 'NEW', valueAmount: x.value || null,
      }));
      if (!r) return;
      a++;
      if (x.code === EXIT.code) await soft(ctx, 'asset return', async () => {
        const list = items(await ctx.admin.get(`/hr/employees/${e.id}/assets`));
        for (const h of list.filter((h) => !h.returnedOn)) await ctx.admin.post(`/hr/assets/${h.id}/return`, { returnedOn: EXIT.exitDate, condition: 'GOOD', remarks: 'Returned at exit clearance', rowVersion: h.rowVersion });
      });
    });
    ctx.log(`  ${n} letters, ${a} assets issued`);
  },
};

// ---------------------------------------------------------------------------------------------------- performance
const GOALS: Record<string, { title: string; unit: string; target: number; krs: string[] }[]> = {
  SAL: [
    { title: 'Grow territory sales', unit: 'PKR', target: 60_000_000, krs: ['Hit monthly secondary sales target', 'Open 15 new outlets', 'Keep returns under 2%'] },
    { title: 'Improve recoveries', unit: 'PERCENT', target: 95, krs: ['Collect 95% of dues within credit days', 'Zero balances above 90 days'] },
  ],
  FIN: [
    { title: 'Close the books faster', unit: 'DAYS', target: 5, krs: ['Month-end close within 5 working days', 'Bank reconciliations by the 3rd'] },
    { title: 'Tax compliance', unit: 'PERCENT', target: 100, krs: ['File sales tax returns on time', 'Issue WHT certificates within 15 days'] },
  ],
  WH: [
    { title: 'Stock accuracy', unit: 'PERCENT', target: 99, krs: ['Quarterly count variance under 1%', 'FEFO picking for dated items'] },
    { title: 'Dispatch on time', unit: 'PERCENT', target: 97, krs: ['Load vans by 8 am', 'Zero mis-shipments'] },
  ],
  DIST: [{ title: 'Delivery reliability', unit: 'PERCENT', target: 98, krs: ['Deliver within route day', 'Proof of delivery for every invoice'] }],
  HRA: [{ title: 'People operations', unit: 'PERCENT', target: 100, krs: ['Payroll inputs by the 25th', 'Onboard joiners within a week'] }],
  MGT: [{ title: 'Profitable growth', unit: 'PKR', target: 900_000_000, krs: ['Grow revenue 18% year on year', 'Hold gross margin above 9%'] }],
};

async function goalsFor(ctx: Ctx, cycleId: string, done: number) {
  const have = items(await ctx.admin.get(`/hr/performance/goals?cycleId=${cycleId}`));
  const rng = rngFor(`goals:${cycleId}`);
  let n = 0;
  await pool(employees(ctx).filter((e) => e.code !== EXIT.code), 5, async (e) => {
    if (have.some((g) => (g.employee?.id ?? g.employeeId) === e.id)) return;
    const set = GOALS[e.departmentCode] ?? GOALS.HRA!;
    for (const [i, g] of set.entries()) {
      const pct = Math.min(100, Math.round(done * rng.int(70, 115) / 100));
      await ctx.admin.post('/hr/performance/goals', {
        employeeId: e.id, cycleId, goalKind: 'KRA', title: g.title, weightPct: Math.round(100 / set.length) + (i === 0 ? 100 % set.length : 0), unit: g.unit, targetValue: g.target,
        actualValue: Math.round(g.target * pct) / 100, progressPct: pct,
        keyResults: g.krs.map((t) => ({ title: t, progressPct: Math.min(100, Math.round(pct * rng.int(85, 110) / 100)) })),
      });
      n++;
    }
  });
  return n;
}

const performance: Step = {
  name: 'tx.hr.x.performance',
  async run(ctx) {
    // Only one cycle can be active. The masters opened the mid-year cycle first; while it has no goals yet, swap the
    // two cycles' definitions so FY 2025-26 runs (open → sign-off → close) before H1 FY 2026-27 is opened.
    const FIELDS = ['cycleType', 'periodStart', 'periodEnd', 'goalSettingDue', 'selfReviewDue', 'managerReviewDue', 'calibrationStart', 'calibrationEnd', 'signOffDue', 'incrementsEffectiveMonth', 'excludeProbation', 'ratingScaleMax'];
    const pick = (c: any) => Object.fromEntries(FIELDS.map((k) => [k, c[k]]));
    let list = items(await ctx.admin.get('/hr/performance-cycles'));
    let annual = list.find((c) => c.name.startsWith('Annual'))!;
    let mid = list.find((c) => c.name.startsWith('Mid'))!;
    if (annual.status === 'DRAFT' && mid.status === 'ACTIVE' && !items(await ctx.admin.get(`/hr/performance/goals?cycleId=${mid.id}`)).length) {
      const a = { name: annual.name, ...pick(annual) };
      const m = { name: mid.name, ...pick(mid) };
      await ctx.admin.patch(`/hr/performance-cycles/${mid.id}`, { ...a, name: 'Swap in progress', rowVersion: mid.rowVersion });
      await ctx.admin.patch(`/hr/performance-cycles/${annual.id}`, { ...m, rowVersion: annual.rowVersion });
      const cur: any = await ctx.admin.get(`/hr/performance-cycles/${mid.id}`);
      await ctx.admin.patch(`/hr/performance-cycles/${mid.id}`, { name: a.name, rowVersion: cur.rowVersion });
      list = items(await ctx.admin.get('/hr/performance-cycles'));
      annual = list.find((c) => c.name.startsWith('Annual'))!;
      mid = list.find((c) => c.name.startsWith('Mid'))!;
      ctx.state.ids.people.performanceCycles = list.map((c) => ({ id: c.id, name: c.name, status: c.status }));
      ctx.save();
    }
    const cyc = async () => ctx.admin.get(`/hr/performance-cycles/${annual.id}`) as Promise<any>;
    let c = await cyc();
    if (c.status === 'DRAFT') { await ctx.admin.post(`/hr/performance-cycles/${annual.id}/open`, { rowVersion: c.rowVersion }); c = await cyc(); }
    const g1 = await goalsFor(ctx, annual.id, 100);
    const advanceTo = async (stage: string) => {
      for (let i = 0; i < 5 && c.stage !== stage && c.status !== 'CLOSED'; i++) { await ctx.admin.post(`/hr/performance-cycles/${annual.id}/advance`, { rowVersion: c.rowVersion }); c = await cyc(); }
    };
    await soft(ctx, 'performance reviews', async () => {
      await advanceTo('SELF_REVIEW');
      await ctx.admin.post('/hr/performance/reviews/generate', { cycleId: annual.id }).catch(() => null);
      const reviews: any[] = (await ctx.admin.get(`/hr/performance/reviews?cycle=${annual.id}&pageSize=100`)).reviews ?? [];
      const rng = rngFor('reviews');
      const rated = new Map<string, number>();
      for (const r of reviews) rated.set(r.id, rng.pick([3, 3, 4, 4, 4, 5, 2, 3, 4, 5]));
      const band = (n: number) => (n >= 4 ? 'HIGH' : n === 3 ? 'MODERATE' : 'LOW');
      // Self reviews: every employee signs in to their own (employees without a login get one).
      for (const r of reviews.filter((x) => x.stage === 'SELF_PENDING')) await soft(ctx, `self review ${r.employee.code}`, async () => {
        const api = await ensureLogin(ctx, r.employee.code);
        const cur: any = await api.get(`/me/reviews/${r.id}`);
        await api.post(`/me/reviews/${r.id}/self`, { selfRating: Math.min(5, rated.get(r.id)! + 1), selfComment: rng.pick(['Met most targets despite a tough market; want to grow into a bigger role.', 'Good year for my territory; recoveries can improve.', 'Learned the new system quickly and helped colleagues.']), competencies: [], rowVersion: cur.rowVersion });
      });
      await advanceTo('MANAGER_REVIEW');
      for (const r of reviews) await soft(ctx, 'manager review', async () => {
        const cur: any = await ctx.admin.get(`/hr/performance/reviews/${r.id}`);
        if (cur.stage !== 'AWAITING_MANAGER') return;
        const rating = rated.get(r.id)!;
        await ctx.admin.post(`/hr/performance/reviews/${r.id}/manager`, {
          managerRating: rating, managerComment: rating >= 4 ? 'Consistently strong delivery; ready for more responsibility.' : rating === 3 ? 'Solid year; needs sharper follow-up on recoveries.' : 'Below expectations; agreed an improvement plan.',
          goalAchievementPct: 60 + rating * 10, performanceBand: band(rating), potentialBand: rating >= 4 ? 'HIGH' : 'MODERATE', pipSuggested: rating <= 2, competencies: [], rowVersion: cur.rowVersion,
        });
      });
      await advanceTo('CALIBRATION');
      for (const r of reviews) await soft(ctx, 'calibration', async () => {
        const cur: any = await ctx.admin.get(`/hr/performance/reviews/${r.id}`);
        if (cur.stage !== 'REVIEWED') return;
        const rating = rated.get(r.id)!;
        await ctx.admin.post(`/hr/performance/reviews/${r.id}/calibrate`, { finalRating: rating, performanceBand: band(rating), potentialBand: rating >= 4 ? 'HIGH' : 'MODERATE', pipSuggested: rating <= 2, incrementPctRecommended: [0, 0, 5, 8, 12, 15][rating], rowVersion: cur.rowVersion });
      });
      await advanceTo('SIGN_OFF');
      for (const r of reviews) await soft(ctx, 'sign-off', async () => {
        const cur: any = await ctx.admin.get(`/hr/performance/reviews/${r.id}`);
        if (cur.stage !== 'CALIBRATED') return;
        await ctx.admin.post(`/hr/performance/reviews/${r.id}/sign-off`, { rowVersion: cur.rowVersion });
      });
      c = await cyc();
      if (c.status !== 'CLOSED') await soft(ctx, 'close cycle', () => ctx.admin.post(`/hr/performance-cycles/${annual.id}/close`, { rowVersion: c.rowVersion }));
      ctx.log(`  annual cycle: ${reviews.length} reviews`);
    });
    // The running mid-year cycle: open, goals about 40% achieved.
    const m: any = await ctx.admin.get(`/hr/performance-cycles/${mid.id}`);
    if (m.status === 'DRAFT') await soft(ctx, 'open mid-year cycle', () => ctx.admin.post(`/hr/performance-cycles/${mid.id}/open`, { rowVersion: m.rowVersion }));
    const g2 = await goalsFor(ctx, mid.id, 40);
    // Feedback and 1:1s (HR records them on behalf; managers' notes).
    const fb = items(await ctx.admin.get('/hr/performance/feedback'));
    if (!fb.length) {
      const pairs = [['EMP-0009', 'EMP-0010', 'Imran handled the Liberty market recoveries with real patience.'], ['EMP-0004', 'EMP-0013', 'Naveed kept the stock count variance under half a percent.'], ['EMP-0002', 'EMP-0005', 'Sana closed the June books two days early.'], ['EMP-0016', 'EMP-0018', 'Faisal opened 12 new outlets in Korangi this quarter.'], ['EMP-0023', 'EMP-0025', 'Usama needs to plan routes better to cut fuel cost.']];
      for (const [i, [from, to, body]] of pairs.entries()) await soft(ctx, 'feedback', () => ctx.admin.post('/hr/performance/feedback', { toEmployeeId: id(ctx, to!), fromEmployeeId: id(ctx, from!), relationship: 'MANAGER', tag: i === 4 ? 'GROWTH' : 'STRENGTH', body, cycleId: mid.id }));
    }
    const ones = items(await ctx.admin.get('/hr/performance/one-on-ones'));
    if (!ones.length) {
      const meet = [['EMP-0010', 'EMP-0009'], ['EMP-0011', 'EMP-0009'], ['EMP-0018', 'EMP-0016'], ['EMP-0025', 'EMP-0023'], ['EMP-0005', 'EMP-0002'], ['EMP-0003', 'EMP-0001']];
      for (const [i, [emp, mgr]] of meet.entries()) for (const d of ['2026-07-15', '2026-08-14', '2026-09-15'])
        await soft(ctx, '1:1', () => ctx.admin.post('/hr/performance/one-on-ones', {
          employeeId: id(ctx, emp!), managerEmployeeId: id(ctx, mgr!), meetingDate: addDays(d, i), topic: 'Monthly check-in: targets and recoveries', notes: 'Reviewed the month’s numbers and blockers.',
          actionItems: [{ text: 'Share the outlet visit plan', done: d < '2026-09-01' }, { text: 'Follow up on overdue balances', done: d < '2026-08-01' }], cycleId: mid.id,
        }));
    }
    ctx.log(`  goals: ${g1} annual + ${g2} mid-year`);
  },
};

// ---------------------------------------------------------------------------------------------------- training
const training: Step = {
  name: 'tx.hr.x.training',
  async run(ctx) {
    const programs: any[] = ctx.state.ids.people.trainingPrograms;
    const plan: Record<string, { start: string; who: (e: any) => boolean; venue: string; trainer: string; hours: number }[]> = {
      'TRN-SALES': [{ start: '2025-08-12', who: (e) => e.departmentCode === 'SAL', venue: 'Head Office training room', trainer: 'Bilal Ahmed', hours: 12 }, { start: '2026-03-10', who: (e) => e.departmentCode === 'SAL' && e.branchCode !== 'HO', venue: 'Karachi branch', trainer: 'Kashif Siddiqui', hours: 8 }],
      'TRN-TAX': [{ start: '2025-11-05', who: (e) => e.departmentCode === 'FIN', venue: 'Online (Teams)', trainer: 'External: Tax Advisors LLP', hours: 6 }],
      'TRN-FIRE': [{ start: '2025-06-18', who: (e) => ['WH', 'DIST'].includes(e.departmentCode), venue: 'Lahore warehouse', trainer: 'Rescue 1122 instructor', hours: 4 }],
      'TRN-LEAD': [{ start: '2026-09-22', who: (e) => e.designation.includes('Manager') || e.designation === 'Sales Officer', venue: 'Pearl Continental, Lahore', trainer: 'LUMS Executive Education', hours: 16 }],
    };
    // The training board lists only upcoming sessions, so the sessions created here are kept in state (hrTx.sessions).
    const hrTx = (ctx.state.ids.hrTx ??= {}) as { sessions?: Record<string, string[]> };
    const known = (hrTx.sessions ??= {});
    let enrolled = 0;
    for (const p of programs) {
      const sessions = plan[p.code] ?? [];
      if (known[p.id]?.length) continue;
      known[p.id] = [];
      for (const s of sessions) {
        const startsAt = `${s.start}T10:00:00+05:00`;
        const endsAt = `${addDays(s.start, Math.max(0, Math.ceil(s.hours / 6) - 1))}T16:00:00+05:00`;
        const created: any = await soft(ctx, `session ${p.code}`, () => ctx.admin.post(`/hr/training-programs/${p.id}/sessions`, { title: `${p.name} (${s.start.slice(0, 7)})`, startsAt, endsAt, deliveryMode: s.venue.startsWith('Online') ? 'ONLINE' : 'IN_PERSON', venue: s.venue, trainer: s.trainer, seats: 25, isMandatory: p.code === 'TRN-FIRE' }));
        if (created?.id) {
          known[p.id]!.push(created.id);
          ctx.save();
          // There is no GET for a single session, so a past session is marked held right away.
          if (endsAt < new Date().toISOString()) await soft(ctx, 'session held', () => ctx.admin.patch(`/hr/training/sessions/${created.id}`, { status: 'COMPLETED', rowVersion: created.rowVersion }));
        }
        const who = employees(ctx).filter((e) => s.who(e) && e.joinDate <= s.start && e.code !== EXIT.code).map((e) => e.id);
        if (who.length) {
          const r: any = await soft(ctx, `enrol ${p.code}`, () => ctx.admin.post('/hr/training/enrol', { programId: p.id, employeeIds: who, enrolledOn: addDays(s.start, -10) }));
          enrolled += r?.enrolled ?? 0;
        }
      }
    }
    // All sessions are in the past: complete the enrolments (about 1 in 10 still in progress).
    const after: any = await ctx.admin.get('/hr/training?pageSize=100');
    const rng = rngFor('training');
    let completed = 0;
    for (const en of items(after.enrolments)) {
      if (en.status !== 'ENROLLED' && en.status !== 'IN_PROGRESS') continue;
      if (rng.chance(0.1)) { await soft(ctx, 'progress', () => ctx.admin.patch(`/hr/training/enrolments/${en.id}`, { progressPct: 60, hoursCompleted: 4, rowVersion: en.rowVersion })); continue; }
      const r = await soft(ctx, 'complete enrolment', () => ctx.admin.post(`/hr/training/enrolments/${en.id}/complete`, { scorePct: rng.int(68, 98), completedOn: addDays(en.enrolledOn, 12) < today() ? addDays(en.enrolledOn, 12) : today(), rowVersion: en.rowVersion }));
      if (r) completed++;
    }
    ctx.log(`  training: ${enrolled} enrolled, ${completed} completed`);
  },
};

// ---------------------------------------------------------------------------------------------------- recruitment
const recruitment: Step = {
  name: 'tx.hr.x.recruitment',
  async run(ctx) {
    const opts: any = await ctx.admin.get('/hr/recruitment/options');
    const desig = (t: string) => (opts.designations as any[]).find((d) => d.title === t)?.id ?? null;
    const dept = (c: string) => ctx.state.ids.people.departments[c]?.id ?? ctx.state.ids.people.departments[c];
    const br = (c: string) => (ctx.state.ids.branches as any[]).find((b) => b.code === c).id;
    const openings = [
      { title: 'Accounts Officer', designationId: desig('Accounts Officer'), departmentId: dept('FIN'), branchId: br('HO'), requisitionType: 'REPLACEMENT', replacesEmployeeId: id(ctx, EXIT.code), hiringManagerEmployeeId: id(ctx, 'EMP-0002'), salaryMin: 55_000, salaryMax: 70_000, postedChannels: ['ROZEE', 'LINKEDIN'], targetHireDate: '2026-07-15', hire: true },
      { title: 'Salesman, Karachi East', designationId: desig('Salesman'), departmentId: dept('SAL'), branchId: br('KHI'), requisitionType: 'NEW', replacesEmployeeId: null, hiringManagerEmployeeId: id(ctx, 'EMP-0016'), salaryMin: 42_000, salaryMax: 50_000, postedChannels: ['ROZEE', 'REFERRAL', 'WALK_IN'], targetHireDate: '2026-11-01', hire: false },
      { title: 'Storekeeper, Islamabad', designationId: desig('Storekeeper'), departmentId: dept('WH'), branchId: br('ISB'), requisitionType: 'NEW', replacesEmployeeId: null, hiringManagerEmployeeId: id(ctx, 'EMP-0023'), salaryMin: 45_000, salaryMax: 52_000, postedChannels: ['ROZEE', 'CAREERS'], targetHireDate: '2026-12-01', hire: false },
    ];
    const existing: any[] = (await ctx.admin.get('/hr/recruitment')).openings ?? [];
    const NAMES = ['Ahmed Raza', 'Fatima Noor', 'Hassan Javed', 'Maryam Aslam', 'Umair Khalid', 'Zainab Tariq', 'Shoaib Akhtar', 'Rabia Sultan', 'Talha Mirza', 'Amna Riaz', 'Kamran Yousaf', 'Sadia Pervez', 'Fahad Rasheed', 'Iqra Mehmood', 'Noman Ali'];
    let ni = 0;
    const rng = rngFor('recruitment');
    for (const o of openings) {
      const { hire, ...body } = o;
      let op = existing.find((x) => x.title === o.title && x.status !== 'CANCELLED') ?? null;
      if (!op) op = await ctx.admin.post('/hr/job-openings', { ...body, openings: 1, priority: o.hire ? 'URGENT' : 'NORMAL', jobDescription: `${o.title}: we are hiring for our growing FMCG distribution business.` });
      // Requisition approval, then open it for applications.
      const get = async () => ctx.admin.get(`/hr/job-openings/${op.id}`) as Promise<any>;
      let cur = await get();
      if (cur.status === 'DRAFT') { await soft(ctx, 'submit opening', () => ctx.admin.post(`/hr/job-openings/${op.id}/submit`, { rowVersion: cur.rowVersion })); cur = await get(); }
      if (['PENDING_APPROVAL', 'SUBMITTED', 'PENDING'].includes(cur.status)) {
        await walkApproval(ctx, `/hr/job-openings/${op.id}`, async (api) => { const c: any = await api.get(`/hr/job-openings/${op.id}`); return api.post(`/hr/job-openings/${op.id}/approve`, { rowVersion: c.rowVersion }); }, (d) => ['PENDING_APPROVAL', 'SUBMITTED', 'PENDING'].includes(d.status));
        cur = await get();
      }
      if (cur.status === 'APPROVED') { await soft(ctx, 'open opening', () => ctx.admin.post(`/hr/job-openings/${op.id}/open`, { rowVersion: cur.rowVersion, channels: o.postedChannels })); cur = await get(); }
      const cands = items(await ctx.admin.get(`/hr/candidates?openingId=${op.id}`));
      for (let k = cands.length; k < 5; k++) {
        const name = NAMES[ni++ % NAMES.length]!;
        const c: any = await soft(ctx, 'candidate', () => ctx.admin.post('/hr/candidates', {
          jobRequisitionId: op.id, fullName: name, email: `${name.toLowerCase().replace(' ', '.')}@gmail.com`, phone: `+92 3${rng.int(0, 4)}${rng.int(0, 9)} ${rng.int(1000000, 9999999)}`,
          currentEmployer: rng.pick(['Unilever distributor', 'Nestlé distributor', 'Metro Cash & Carry', 'Fresh graduate']), experienceYears: rng.int(0, 8), education: rng.pick(['B.Com', 'BBA', 'ACCA (part)', 'Intermediate', 'MBA']),
          source: rng.pick(['ROZEE', 'LINKEDIN', 'WALK_IN', 'CAREERS']), appliedOn: addDays(o.targetHireDate, -rng.int(30, 60) ) < today() ? addDays(o.targetHireDate, -rng.int(30, 60)) : addDays(today(), -rng.int(3, 20)),
          expectedSalary: rng.money(o.salaryMin, o.salaryMax, 1000), noticeDays: rng.pick([0, 15, 30]), rating: rng.int(2, 5),
        }));
        if (!c) continue;
        const stages = ['SCREENING', 'INTERVIEW', 'OFFER'].slice(0, k === 0 && o.hire ? 3 : rng.int(0, 2));
        for (const st of stages) {
          const cur2: any = await ctx.admin.get(`/hr/candidates/${c.id}`);
          await soft(ctx, `move ${st}`, () => ctx.admin.post(`/hr/candidates/${c.id}/move`, { toStage: st, note: st === 'INTERVIEW' ? 'Panel interview scheduled' : null, offeredSalary: st === 'OFFER' ? o.salaryMax - 5000 : null, rowVersion: cur2.rowVersion }));
          if (st === 'INTERVIEW') await soft(ctx, 'interview note', () => ctx.admin.post(`/hr/candidates/${c.id}/activities`, { activityType: 'PANEL_INTERVIEW', summary: 'Panel interview with the hiring manager and HR', panelNote: 'Good communication, knows the market', scorePct: rng.int(55, 90), rating: rng.int(3, 5) }));
        }
        if (k === 4 && !o.hire) {
          const cur2: any = await ctx.admin.get(`/hr/candidates/${c.id}`);
          await soft(ctx, 'reject candidate', () => ctx.admin.post(`/hr/candidates/${c.id}/reject`, { reason: 'Salary expectation above the band', declined: false, rowVersion: cur2.rowVersion }));
        }
      }
      // The replacement opening is filled: hire its best candidate (once).
      const all = items(await ctx.admin.get(`/hr/candidates?openingId=${op.id}`));
      const best = all.find((x) => x.stage === 'OFFER') ?? all[0];
      if (o.hire && best && !all.some((x) => x.stage === 'HIRED')) {
        const c = best;
        const name = best.fullName as string;
        const cur2: any = await ctx.admin.get(`/hr/candidates/${c.id}`);
        if (cur2.stage !== 'OFFER') for (const st of ['SCREENING', 'INTERVIEW', 'OFFER'].slice(['APPLIED', 'SCREENING', 'INTERVIEW'].indexOf(cur2.stage))) {
          const cv: any = await ctx.admin.get(`/hr/candidates/${c.id}`);
          await soft(ctx, `move ${st}`, () => ctx.admin.post(`/hr/candidates/${c.id}/move`, { toStage: st, note: null, offeredSalary: st === 'OFFER' ? o.salaryMax - 5000 : null, rowVersion: cv.rowVersion }));
        }
        const cur3: any = await ctx.admin.get(`/hr/candidates/${c.id}`);
        const [first, last] = name.split(' ');
        await soft(ctx, 'hire', () => ctx.admin.post(`/hr/candidates/${c.id}/hire`, {
          firstName: first, lastName: last, guardianName: `Muhammad ${last}`, cnic: `35202-${rng.int(1000000, 9999999)}-${rng.int(1, 9)}`, dateOfBirth: '1997-03-14', gender: ['Fatima', 'Maryam', 'Zainab', 'Rabia', 'Amna', 'Sadia', 'Iqra'].includes(first!) ? 'FEMALE' : 'MALE',
          mobile: '+92 321 4567890', joiningDate: addDays(today(), 24), designationId: o.designationId, reportingManagerId: id(ctx, 'EMP-0002'), offeredSalary: o.salaryMax - 5000, probationMonths: 3, rowVersion: cur3.rowVersion,
        }));
      }
    }
    ctx.log('  recruitment: 3 openings with candidates');
  },
};

// ---------------------------------------------------------------------------------------------------- self-service
const engagement: Step = {
  name: 'tx.hr.x.engagement',
  async run(ctx) {
    const codes = ['EMP-0001', 'EMP-0002', ...(ctx.state.ids.hrUsers as any[]).map((u) => u.code)];
    const rng = rngFor('engagement');
    const people = employees(ctx).filter((e) => e.code !== EXIT.code);
    const policies = (await ctx.admin.get('/me/policies')).policies as any[];
    const eng: any = await ctx.admin.get('/me/engagement');
    const anns: any[] = await ctx.admin.get('/me/announcements');
    const KUDOS = ['Stayed late to load the Karachi shipment.', 'Closed the month-end reconciliations a day early.', 'Calmed an angry customer and saved the account.', 'Covered two routes while a colleague was sick.', 'Trained the new joiners on the order app.', 'Found the stock variance in the cold store.'];
    let kudos = 0;
    for (const code of codes) {
      const api = await as(ctx, code);
      const me = empByCode(ctx, code);
      // Policies, poll votes and announcement reads.
      for (const p of policies) await soft(ctx, 'policy ack', () => api.post(`/me/policies/${p.id}/acknowledge`, { readToEnd: true, signatureText: me.name }));
      const state: any = await api.get('/me/engagement-state');
      for (const poll of eng.polls ?? []) if (!(state.votes ?? []).some((v: any) => v.pollId === poll.id)) await soft(ctx, 'poll vote', () => api.post(`/me/polls/${poll.id}/vote`, { optionId: rng.pick(poll.options as any[]).id }));
      for (const a of anns) await soft(ctx, 'announcement read', () => api.post(`/company/announcements/${a.id}/read`, a.requiresRsvp ? { rsvp: rng.pick(['YES', 'YES', 'MAYBE']) } : {}));
      await soft(ctx, 'presence', () => api.put('/me/presence', { status: rng.pick(['AVAILABLE', 'AVAILABLE', 'BUSY', 'IN_FIELD']) }));
      // Kudos to two colleagues.
      const mine: any = await api.get('/me/kudos');
      if (!((mine.wall ?? []) as any[]).some((k) => k.from?.id === me.id)) {
        for (const to of rng.sample(people.filter((p) => p.id !== me.id), 2)) {
          const r = await soft(ctx, 'kudos', () => api.post('/me/kudos', { toEmployeeId: to.id, badge: rng.pick(['CUSTOMER_HERO', 'TEAM_PLAYER', 'GO_GETTER', 'PROBLEM_SOLVER', 'MENTOR']), message: rng.pick(KUDOS), shareOnWall: true }));
          if (r) kudos++;
        }
      }
    }
    // Reactions on the wall.
    const wall: any = await ctx.admin.get('/me/kudos');
    for (const k of ((wall.wall ?? []) as any[]).slice(0, 8)) for (const code of rng.sample(codes, 3)) await soft(ctx, 'reaction', async () => (await as(ctx, code)).post(`/me/kudos/${k.id}/react`, { reaction: rng.pick(['CLAP', 'HEART', 'FIRE', 'PARTY']) }));
    ctx.log(`  engagement: ${kudos} kudos, policies/polls/announcements for ${codes.length} employees`);
  },
};

const requests: Step = {
  name: 'tx.hr.x.requests',
  async run(ctx) {
    const help: any = await ctx.admin.get('/me/helpdesk');
    const cat = (c: string) => (help.categories as any[]).find((x) => x.code === c)!.id;
    const tickets = [
      { code: 'EMP-0005', cat: 'PAYROLL', subject: 'Tax deducted twice in August payslip', description: 'My August payslip shows income tax of Rs 9,850 but my monthly projection is Rs 4,900. Please check.', priority: 'HIGH', close: 5 },
      { code: 'EMP-0016', cat: 'IT', subject: 'Order-booking app not syncing', description: 'The order app on my phone has not synced since yesterday evening; salesmen cannot see the Korangi route.', priority: 'HIGH', close: 4 },
      { code: 'EMP-0004', cat: 'ADMIN', subject: 'Warehouse AC repair', description: 'The split AC in the warehouse office leaks water onto the stock files. Please arrange repair.', priority: 'NORMAL', close: 3 },
      { code: 'EMP-0023', cat: 'HR', subject: 'Parents in health insurance', description: 'How do I add my parents to the renewed group health insurance? Which documents are needed?', priority: 'LOW', close: 5 },
      { code: 'EMP-0017', cat: 'PAYROLL', subject: 'Salary account change', description: 'I have moved my salary account to Meezan Bank. Please update it from next month.', priority: 'NORMAL', close: 0 },
      { code: 'EMP-0003', cat: 'IT', subject: 'Laptop battery drains fast', description: 'My laptop battery lasts under an hour now. Can it be replaced?', priority: 'NORMAL', close: 0 },
    ];
    const mineAll = items(await ctx.admin.get('/helpdesk/tickets?scope=all&status=ALL'));
    for (const t of tickets) {
      if (mineAll.some((x) => x.subject === t.subject)) continue;
      const api = await as(ctx, t.code);
      const tk: any = await soft(ctx, 'ticket', () => api.post('/helpdesk/tickets', { categoryId: cat(t.cat), subject: t.subject, description: t.description, priority: t.priority, contactChannel: 'WHATSAPP' }));
      if (!tk) continue;
      const agent = t.cat === 'IT' ? 'EMP-0008' : 'EMP-0007';
      await soft(ctx, 'ticket flow', async () => {
        let cur: any = await ctx.admin.get(`/helpdesk/tickets/${tk.id}`);
        await ctx.admin.post(`/helpdesk/tickets/${tk.id}/assign`, { agentEmployeeId: id(ctx, agent), rowVersion: cur.rowVersion });
        const ag = await as(ctx, agent);
        await ag.post(`/helpdesk/tickets/${tk.id}/messages`, { body: 'Looking into this now; will update you shortly.' });
        if (!t.close) return;
        cur = await ag.get(`/helpdesk/tickets/${tk.id}`);
        await ag.post(`/helpdesk/tickets/${tk.id}/resolve`, { note: 'Fixed and confirmed with you on WhatsApp.', rowVersion: cur.rowVersion });
        cur = await api.get(`/helpdesk/tickets/${tk.id}`);
        await api.post(`/helpdesk/tickets/${tk.id}/rate`, { csatRating: t.close, comment: t.close >= 4 ? 'Quick help, thanks!' : 'Took a while.', rowVersion: cur.rowVersion });
      });
    }
    // Letter requests: one issued, one rejected, one open; a profile change approved and one pending.
    const letters = [
      { code: 'EMP-0016', body: { letterType: 'NOC_VISA', addressedTo: 'Embassy of the United Arab Emirates, Islamabad', purpose: 'Family visit to Dubai', travelCountry: 'United Arab Emirates', travelFrom: addDays(today(), 40), travelTill: addDays(today(), 50), includeSalary: true }, act: 'issue' },
      { code: 'EMP-0005', body: { letterType: 'BANK_LETTER', addressedTo: 'Car Finance Department, Meezan Bank', purpose: 'Car financing application', includeSalary: true }, act: 'reject' },
      { code: 'EMP-0023', body: { letterType: 'SALARY_CERTIFICATE', addressedTo: 'To whom it may concern', purpose: 'House rent agreement', includeSalary: true }, act: 'open' },
    ];
    for (const l of letters) {
      const api = await as(ctx, l.code);
      if (items(await api.get('/me/letter-requests')).length) continue;
      const r: any = await soft(ctx, 'letter request', () => api.post('/me/letter-requests', { ...l.body, outputFormat: 'DIGITAL_PDF_QR', language: 'EN' }));
      if (!r || l.act === 'open') continue;
      const cur: any = await ctx.admin.get(`/hr/letter-requests/${r.id}`);
      if (l.act === 'issue') await soft(ctx, 'issue letter', () => ctx.admin.post(`/hr/letter-requests/${r.id}/issue`, { rowVersion: cur.rowVersion }));
      else await soft(ctx, 'reject letter', () => ctx.admin.post(`/hr/letter-requests/${r.id}/reject`, { reason: 'Bank letters are issued only after confirmation of the loan amount; please share the bank’s form.', rowVersion: cur.rowVersion }));
    }
    const changes = [
      { code: 'EMP-0017', fieldKey: 'MOBILE', requestedValue: '0333-4567812', reason: 'New number', approve: true },
      { code: 'EMP-0008', fieldKey: 'HOME_ADDRESS', requestedValue: 'House 22, Street 4, Johar Town, Lahore', reason: 'Moved house', approve: false },
    ];
    for (const c of changes) {
      const api = await as(ctx, c.code);
      const r: any = await soft(ctx, 'profile change', () => api.post('/me/profile-change-requests', { fieldKey: c.fieldKey, requestedValue: c.requestedValue, reason: c.reason }));
      if (r && c.approve) await soft(ctx, 'approve profile change', async () => { const cur: any = await ctx.approver.get(`/hr/profile-change-requests/${r.id}`); await ctx.approver.post(`/hr/profile-change-requests/${r.id}/approve`, { comment: 'Verified by phone', rowVersion: cur.rowVersion }); });
    }
    // Attendance regularisations for recent late days (self-service, line manager approves).
    let regs = 0;
    for (const u of (ctx.state.ids.hrUsers as any[]).slice(0, 5)) {
      const api = await as(ctx, u.code);
      const mine: any = await api.get(`/me/attendance?month=${today().slice(0, 7)}`).catch(() => null);
      const days = Object.values<any>(mine?.days ?? {}).concat(mine?.items ?? []).filter((d: any) => d?.status === 'LATE');
      const day = days[0];
      if (!day) continue;
      const r: any = await soft(ctx, 'regularisation', () => api.post('/me/regularisation-requests', { requestType: 'LATE_ARRIVAL', attDate: day.date, requestedIn: '09:00', reason: 'Was at the bank depositing collections before office (deposit slip attached).' }));
      if (!r) continue;
      regs++;
      if (regs % 3 !== 0) await walkApproval(ctx, `/hr/regularisation-requests/${r.id}`, (a) => a.post(`/hr/regularisation-requests/${r.id}/approve`, { comment: 'Deposit slip verified' }), (d) => d.status === 'PENDING');
    }
    ctx.log(`  helpdesk tickets, letter + profile-change requests, ${regs} regularisations`);
  },
};

export const steps: Step[] = [leaveYearEnd, onboarding, lettersAndAssets, performance, training, recruitment, engagement, requests];
