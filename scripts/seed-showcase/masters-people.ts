/**
 * HR, payroll and engagement masters for the showcase company (steps `masters.people.*`).
 *
 * State written: ctx.state.ids.people = {
 *   departments:  { [code]: { id, name } }                       MGT, SAL, DIST, WH, FIN, HRA
 *   grades:       { [code]: { id, levelRank } }                  G-1 … G-6
 *   designations: { [title]: { id, departmentCode, gradeCode } }
 *   shifts:       { [code]: { id } }                             GEN (09–18), WHE (07–16)
 *   employees:    [{ id, code, name, branchId, branchCode, departmentId, departmentCode, designation, gradeCode, managerId,
 *                    userId, joinDate, basic, gender, isSalesman, isBooker, isDeliveryman, isSupervisor }]   (basic = current)
 *   leaveTypes:   [{ id, code, name, isPaid }]
 *   payGroups:    { [code]: id }                                 MANAGEMENT, STAFF
 *   components:   { [code]: id }                                 BAS, HRA, MED, UTL, CNV, COM, OVT, ITX, EOB, PFE, LON, ADV, EOR, PSI, PFR, GRT
 *   salaryStructures: { [gradeCode]: id, ADDON_FIELD: id }
 *   policies:     [{ id, code, title }]                          published
 *   performanceCycles: [{ id, name, status }]
 *   trainingPrograms:  [{ id, code, name }]
 *   onboardingTemplates: [{ id, name }]
 *   announcements: [{ id, title }]; polls: [{ id, question }]
 * }
 * Salaries: first salary effective max(joining, 2025-04-01), increments on 2025-07-01 and 2026-07-01 (about 10% each).
 */
import { pool, soft, type Ctx, type Step } from './ctx.ts';
import { rngFor } from './rng.ts';

const P = (ctx: Ctx) => (ctx.state.ids.people ??= {});
const rows = (r: any): any[] => (Array.isArray(r) ? r : (r?.items ?? []));

// ------------------------------------------------------------------------------------------------ organisation
const DEPARTMENTS = [
  { code: 'MGT', name: 'Management', division: 'SUPPORT', description: 'Board and executive management' },
  { code: 'SAL', name: 'Sales', division: 'COMMERCIAL', description: 'Field sales, order booking and key accounts' },
  { code: 'DIST', name: 'Distribution', division: 'OPERATIONS', description: 'Delivery fleet and route operations' },
  { code: 'WH', name: 'Warehouse', division: 'OPERATIONS', description: 'Receiving, storage and dispatch' },
  { code: 'FIN', name: 'Finance & Accounts', division: 'SUPPORT', description: 'Accounting, treasury, tax and payroll' },
  { code: 'HRA', name: 'HR & Admin', division: 'SUPPORT', description: 'People, administration and IT' },
];
const GRADES = [
  { code: 'G-1', levelRank: 1, levelName: 'Entry', minSalary: 30000, midSalary: 37500, maxSalary: 45000 },
  { code: 'G-2', levelRank: 2, levelName: 'Junior staff', minSalary: 45000, midSalary: 57500, maxSalary: 70000 },
  { code: 'G-3', levelRank: 3, levelName: 'Officer', minSalary: 70000, midSalary: 90000, maxSalary: 110000 },
  { code: 'G-4', levelRank: 4, levelName: 'Manager', minSalary: 110000, midSalary: 140000, maxSalary: 170000 },
  { code: 'G-5', levelRank: 5, levelName: 'Senior manager', minSalary: 170000, midSalary: 225000, maxSalary: 280000 },
  { code: 'G-6', levelRank: 6, levelName: 'Executive', minSalary: 280000, midSalary: 390000, maxSalary: 500000 },
];
/** title, department, grade, approved positions, reports-to title */
const DESIGNATIONS: [string, string, string, number, string | null][] = [
  ['Managing Director', 'MGT', 'G-6', 1, null],
  ['Finance & HR Manager', 'FIN', 'G-5', 1, 'Managing Director'],
  ['GM Sales', 'SAL', 'G-5', 1, 'Managing Director'],
  ['Branch Manager', 'SAL', 'G-5', 2, 'GM Sales'],
  ['Warehouse Manager', 'WH', 'G-4', 1, 'Managing Director'],
  ['Sales Officer', 'SAL', 'G-3', 4, 'Branch Manager'],
  ['Salesman', 'SAL', 'G-2', 8, 'Sales Officer'],
  ['Order Booker', 'SAL', 'G-1', 4, 'Sales Officer'],
  ['Distribution Supervisor', 'DIST', 'G-3', 2, 'Warehouse Manager'],
  ['Delivery Driver', 'DIST', 'G-1', 6, 'Distribution Supervisor'],
  ['Storekeeper', 'WH', 'G-2', 3, 'Warehouse Manager'],
  ['Accountant', 'FIN', 'G-3', 1, 'Finance & HR Manager'],
  ['Accounts Officer', 'FIN', 'G-2', 3, 'Accountant'],
  ['HR Officer', 'HRA', 'G-2', 1, 'Finance & HR Manager'],
  ['IT Officer', 'HRA', 'G-3', 1, 'Finance & HR Manager'],
];

const organisation: Step = {
  name: 'masters.people.organisation',
  async run(ctx) {
    const p = P(ctx);
    let depts = rows(await ctx.admin.get('/hr/departments?pageSize=500'));
    for (const d of DEPARTMENTS) if (!depts.some((x) => x.code === d.code)) await ctx.admin.post('/hr/departments', d);
    depts = rows(await ctx.admin.get('/hr/departments?pageSize=500'));
    p.departments = Object.fromEntries(DEPARTMENTS.map((d) => { const x = depts.find((y) => y.code === d.code); return [d.code, { id: x.id, name: x.name }]; }));

    let grades = rows(await ctx.admin.get('/hr/grades'));
    for (const g of GRADES) if (!grades.some((x) => x.code === g.code)) await ctx.admin.post('/hr/grades', g);
    grades = rows(await ctx.admin.get('/hr/grades'));
    p.grades = Object.fromEntries(GRADES.map((g) => { const x = grades.find((y) => y.code === g.code); return [g.code, { id: x.id, levelRank: x.levelRank }]; }));

    let des = rows(await ctx.admin.get('/hr/designations'));
    for (const [title, dept, grade, positions, reportsTo] of DESIGNATIONS) {
      if (des.some((x) => x.title === title)) continue;
      const parent = reportsTo ? des.find((x) => x.title === reportsTo) : null;
      await ctx.admin.post('/hr/designations', { title, departmentId: p.departments[dept].id, gradeId: p.grades[grade].id, approvedPositions: positions, reportsToDesignationId: parent?.id ?? null });
      des = rows(await ctx.admin.get('/hr/designations'));
    }
    p.designations = Object.fromEntries(DESIGNATIONS.map(([title, dept, grade]) => [title, { id: des.find((x) => x.title === title).id, departmentCode: dept, gradeCode: grade }]));

    let shifts = rows(await ctx.admin.get('/hr/shifts'));
    if (!shifts.some((s) => s.code === 'WHE')) {
      await ctx.admin.post('/hr/shifts', {
        code: 'WHE', name: 'Warehouse Early', description: 'Warehouse and delivery fleet', colour: 'AMBER', startTime: '07:00', endTime: '16:00',
        graceMinutes: 10, breakStart: '12:00', breakEnd: '12:45', fridayExtendedBreak: true, fridayBreakEnd: '13:30', halfDayBelowHours: 4, lateMarksPerHalfDay: 3, overtimeAfterMinutes: 30, weeklyOff: 'SUNDAY',
      });
      shifts = rows(await ctx.admin.get('/hr/shifts'));
    }
    p.shifts = Object.fromEntries(shifts.map((s) => [s.code, { id: s.id }]));
    ctx.save();
    ctx.log(`  ${DEPARTMENTS.length} departments, ${GRADES.length} grades, ${DESIGNATIONS.length} designations, ${shifts.length} shifts`);
  },
};

// ------------------------------------------------------------------------------------------------ holidays
/** name, from, to, moon-dependent */
const HOLIDAYS: [string, string, string, boolean][] = [
  ['Kashmir Solidarity Day', '2025-02-05', '2025-02-05', false],
  ['Pakistan Day', '2025-03-23', '2025-03-23', false],
  ['Eid ul Fitr', '2025-03-31', '2025-04-02', true],
  ['Labour Day', '2025-05-01', '2025-05-01', false],
  ['Youm-e-Takbeer', '2025-05-28', '2025-05-28', false],
  ['Eid ul Adha', '2025-06-07', '2025-06-09', true],
  ['Ashura', '2025-07-05', '2025-07-06', true],
  ['Independence Day', '2025-08-14', '2025-08-14', false],
  ['Eid Milad un Nabi', '2025-09-05', '2025-09-05', true],
  ['Iqbal Day', '2025-11-09', '2025-11-09', false],
  ['Quaid-e-Azam Day and Christmas', '2025-12-25', '2025-12-25', false],
  ['Kashmir Solidarity Day', '2026-02-05', '2026-02-05', false],
  ['Eid ul Fitr', '2026-03-20', '2026-03-22', true],
  ['Pakistan Day', '2026-03-23', '2026-03-23', false],
  ['Labour Day', '2026-05-01', '2026-05-01', false],
  ['Eid ul Adha', '2026-05-27', '2026-05-29', true],
  ['Ashura', '2026-06-25', '2026-06-26', true],
  ['Independence Day', '2026-08-14', '2026-08-14', false],
  ['Eid Milad un Nabi', '2026-08-25', '2026-08-25', true],
  ['Iqbal Day', '2026-11-09', '2026-11-09', false],
  ['Quaid-e-Azam Day and Christmas', '2026-12-25', '2026-12-25', false],
];

const holidays: Step = {
  name: 'masters.people.holidays',
  async run(ctx) {
    const existing = rows(await ctx.admin.get('/hr/holidays?from=2025-01-01&to=2026-12-31'));
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    for (const [name, fromDate, toDate, moon] of HOLIDAYS) {
      if (existing.some((h) => h.name === name && h.fromDate.slice(0, 10) === fromDate)) continue;
      await ctx.admin.post('/hr/holidays', {
        name, fromDate, toDate, holidayType: 'PUBLIC', isMoonDependent: moon, hijriNote: moon ? 'Subject to moon sighting' : null,
        appliesToAllBranches: true, status: toDate < today ? 'OBSERVED' : 'UPCOMING', notifyEss: true,
      });
      n++;
    }
    ctx.log(`  ${n} holidays added`);
  },
};

// ------------------------------------------------------------------------------------------------ employees
type Emp = { first: string; last: string; g: 'M' | 'F'; br: string; des: string; mgr: number | null; join: string; basic: number; user?: 'admin' | 'approver' };
const EMPLOYEES: Emp[] = [
  { first: 'Usman', last: 'Tariq', g: 'M', br: 'HO', des: 'Managing Director', mgr: null, join: '2023-01-02', basic: 350000, user: 'admin' },
  { first: 'Ayesha', last: 'Malik', g: 'F', br: 'HO', des: 'Finance & HR Manager', mgr: 0, join: '2023-02-01', basic: 210000, user: 'approver' },
  { first: 'Bilal', last: 'Ahmed', g: 'M', br: 'HO', des: 'GM Sales', mgr: 0, join: '2023-03-01', basic: 220000 },
  { first: 'Farhan', last: 'Qureshi', g: 'M', br: 'HO', des: 'Warehouse Manager', mgr: 0, join: '2023-04-03', basic: 140000 },
  { first: 'Sana', last: 'Iqbal', g: 'F', br: 'HO', des: 'Accountant', mgr: 1, join: '2023-06-01', basic: 95000 },
  { first: 'Hamza', last: 'Raza', g: 'M', br: 'HO', des: 'Accounts Officer', mgr: 4, join: '2024-01-15', basic: 58000 },
  { first: 'Mehwish', last: 'Anwar', g: 'F', br: 'HO', des: 'HR Officer', mgr: 1, join: '2024-03-01', basic: 60000 },
  { first: 'Ali', last: 'Hassan', g: 'M', br: 'HO', des: 'IT Officer', mgr: 1, join: '2024-07-01', basic: 85000 },
  { first: 'Zeeshan', last: 'Akram', g: 'M', br: 'HO', des: 'Sales Officer', mgr: 2, join: '2023-08-01', basic: 85000 },
  { first: 'Imran', last: 'Shah', g: 'M', br: 'HO', des: 'Salesman', mgr: 8, join: '2023-09-01', basic: 50000 },
  { first: 'Waqas', last: 'Mehmood', g: 'M', br: 'HO', des: 'Salesman', mgr: 8, join: '2024-02-01', basic: 48000 },
  { first: 'Adeel', last: 'Butt', g: 'M', br: 'HO', des: 'Order Booker', mgr: 8, join: '2024-05-02', basic: 38000 },
  { first: 'Naveed', last: 'Iqbal', g: 'M', br: 'HO', des: 'Storekeeper', mgr: 3, join: '2023-10-02', basic: 50000 },
  { first: 'Rizwan', last: 'Ali', g: 'M', br: 'HO', des: 'Distribution Supervisor', mgr: 3, join: '2024-01-02', basic: 80000 },
  { first: 'Asif', last: 'Nawaz', g: 'M', br: 'HO', des: 'Delivery Driver', mgr: 13, join: '2024-04-01', basic: 36000 },
  { first: 'Kashif', last: 'Siddiqui', g: 'M', br: 'KHI', des: 'Branch Manager', mgr: 2, join: '2023-05-02', basic: 180000 },
  { first: 'Hira', last: 'Khan', g: 'F', br: 'KHI', des: 'Accounts Officer', mgr: 15, join: '2024-02-15', basic: 55000 },
  { first: 'Faisal', last: 'Memon', g: 'M', br: 'KHI', des: 'Sales Officer', mgr: 15, join: '2023-11-01', basic: 82000 },
  { first: 'Junaid', last: 'Baloch', g: 'M', br: 'KHI', des: 'Salesman', mgr: 17, join: '2024-01-02', basic: 47000 },
  { first: 'Saad', last: 'Ansari', g: 'M', br: 'KHI', des: 'Salesman', mgr: 17, join: '2025-06-02', basic: 46000 },
  { first: 'Tariq', last: 'Jamil', g: 'M', br: 'KHI', des: 'Storekeeper', mgr: 15, join: '2024-03-01', basic: 49000 },
  { first: 'Yasir', last: 'Shaikh', g: 'M', br: 'KHI', des: 'Delivery Driver', mgr: 15, join: '2024-06-03', basic: 35000 },
  { first: 'Omer', last: 'Farooq', g: 'M', br: 'ISB', des: 'Branch Manager', mgr: 2, join: '2023-07-03', basic: 175000 },
  { first: 'Nida', last: 'Hussain', g: 'F', br: 'ISB', des: 'Accounts Officer', mgr: 22, join: '2024-04-01', basic: 56000 },
  { first: 'Usama', last: 'Rafiq', g: 'M', br: 'ISB', des: 'Sales Officer', mgr: 22, join: '2024-01-15', basic: 80000 },
  { first: 'Ahsan', last: 'Kiani', g: 'M', br: 'ISB', des: 'Salesman', mgr: 24, join: '2024-02-01', basic: 47000 },
  { first: 'Danish', last: 'Abbasi', g: 'M', br: 'ISB', des: 'Salesman', mgr: 24, join: '2026-08-03', basic: 45000 },
  { first: 'Kiran', last: 'Shahzad', g: 'F', br: 'ISB', des: 'Order Booker', mgr: 24, join: '2025-09-01', basic: 37000 },
  { first: 'Jawad', last: 'Haider', g: 'M', br: 'ISB', des: 'Storekeeper', mgr: 22, join: '2024-05-02', basic: 48000 },
  { first: 'Sohail', last: 'Akhtar', g: 'M', br: 'ISB', des: 'Delivery Driver', mgr: 22, join: '2024-08-01', basic: 34000 },
];
const CITY: Record<string, { city: string; cnic: string; ss: string | null; addr: string }> = {
  HO: { city: 'Lahore', cnic: '35202', ss: 'PESSI', addr: 'Johar Town, Lahore' },
  KHI: { city: 'Karachi', cnic: '42101', ss: 'SESSI', addr: 'Gulshan-e-Iqbal, Karachi' },
  ISB: { city: 'Islamabad', cnic: '61101', ss: null, addr: 'G-11, Islamabad' },
};
const FATHERS = ['Muhammad Aslam', 'Abdul Rehman', 'Ghulam Rasool', 'Muhammad Iqbal', 'Khalid Mehmood', 'Nazir Ahmed', 'Rashid Ali', 'Abdul Majeed', 'Muhammad Saleem', 'Zafar Iqbal'];
const BANK_CODES = ['HABB', 'MUCB', 'UNIL', 'MEZN', 'ALFH', 'ABPA', 'BAHL', 'NBPA'];
const flags = (des: string) => ({ isSalesman: des === 'Salesman', isBooker: des === 'Order Booker', isDeliveryman: des === 'Delivery Driver', isSupervisor: des === 'Distribution Supervisor' || des === 'Sales Officer' });
const gradeRank = (des: string) => Number(DESIGNATIONS.find((d) => d[0] === des)![2].slice(2));

const employees: Step = {
  name: 'masters.people.employees',
  async run(ctx) {
    const p = P(ctx);
    const rng = rngFor('people.employees');
    const branchBy = Object.fromEntries((ctx.state.ids.branches as any[]).map((b) => [b.code, b.id]));
    const opts: any = await ctx.admin.get('/hr/employees/options');
    const banks: any[] = opts.banks.filter((b: any) => b.ibanBankCode);
    const list = async () => rows(await ctx.admin.get('/hr/employees?pageSize=500'));
    let existing = await list();
    const ids: string[] = [];
    // Created one by one in order: each manager exists before the people reporting to them.
    for (const [i, e] of EMPLOYEES.entries()) {
      const r = { cnic7: String(rng.int(1000000, 9999999)), dobY: rng.int(1975, 2001), dobM: rng.int(1, 12), dobD: rng.int(1, 28), mob: rng.int(1000000, 9999999), net: rng.pick(['300', '301', '321', '333', '345', '312']), father: rng.pick(FATHERS), acct: String(rng.int(10 ** 15, 10 ** 16 - 1)).slice(0, 16), married: rng.chance(0.6), kids: rng.int(0, 4), blood: rng.pick(['A+', 'B+', 'O+', 'AB+', 'O-', 'B-']), ntn: `${rng.int(1000000, 9999999)}-${rng.int(0, 9)}` };
      const name = `${e.first} ${e.last}`;
      const found = existing.find((x) => x.name === name);
      if (found) { ids.push(found.id); continue; }
      const c = CITY[e.br];
      const cnic = `${c.cnic}-${r.cnic7}-${e.g === 'M' ? rng.pick([1, 3, 5, 7, 9]) : rng.pick([2, 4, 6, 8])}`;
      const rank = gradeRank(e.des);
      const des = p.designations[e.des];
      const warehouse = e.des === 'Storekeeper' || e.des === 'Delivery Driver' || e.des === 'Warehouse Manager' || e.des === 'Distribution Supervisor';
      const bank = banks.find((b) => b.ibanBankCode === BANK_CODES[i % BANK_CODES.length]) ?? banks[i % banks.length];
      const email = `${e.first}.${e.last}`.toLowerCase() + '@showcase.example.com';
      await ctx.admin.post('/hr/employees', {
        firstName: e.first, lastName: e.last, guardianName: r.father, guardianRelation: 'FATHER', cnic,
        cnicIssueDate: '2021-03-15', cnicExpiryDate: '2031-03-15',
        dateOfBirth: `${r.dobY}-${String(r.dobM).padStart(2, '0')}-${String(r.dobD).padStart(2, '0')}`, gender: e.g === 'M' ? 'MALE' : 'FEMALE',
        maritalStatus: r.married ? 'MARRIED' : 'SINGLE', childrenCount: r.married ? r.kids : 0, religion: 'ISLAM', bloodGroup: r.blood, nationality: 'PAKISTANI',
        mobile: `0${r.net}-${r.mob}`, workEmail: email, personalEmail: `${e.first.toLowerCase()}${r.mob % 1000}@gmail.com`,
        currentAddress: `House ${rng.int(1, 400)}, Street ${rng.int(1, 40)}, ${c.addr}`, permanentAddress: `House ${rng.int(1, 400)}, ${c.addr}`, city: c.city,
        emergencyContactName: r.father, emergencyRelation: 'Father', emergencyPhone: `0300-${rng.int(1000000, 9999999)}`,
        shiftId: (warehouse ? p.shifts.WHE : p.shifts.GEN).id, weeklyOff: 'SUNDAY', payGroup: rank >= 5 ? 'MANAGEMENT' : 'STAFF', workPattern: 'FULL_TIME',
        probationMonths: 3, noticeDays: rank >= 4 ? 60 : 30, biometricId: String(1000 + i), ...flags(e.des),
        departmentId: p.departments[des.departmentCode].id, designationId: des.id, gradeId: p.grades[des.gradeCode].id,
        reportingManagerId: e.mgr === null ? null : ids[e.mgr], branchId: branchBy[e.br], employmentType: e.join >= '2026-07-01' ? 'PROBATION' : 'PERMANENT',
        joiningDate: e.join,
        statutory: {
          eobiApplicable: true, eobiNo: `EOBI-${r.cnic7}`, eobiRegisteredOn: e.join, socialSecurityApplicable: !!c.ss && rank <= 3, socialSecurityScheme: c.ss && rank <= 3 ? c.ss : null,
          socialSecurityNo: c.ss && rank <= 3 ? `${c.ss}-${r.mob}` : null, ntn: rank >= 3 ? r.ntn : null, atlStatus: rank >= 3 ? 'FILER' : 'NON_FILER',
          pfApplicable: rank >= 3, pfFromDate: rank >= 3 ? e.join : null, groupInsurance: true, overtimeEligible: rank <= 2,
        },
        bankAccount: { paymentMode: 'BANK', bankId: bank.id, branchName: `${c.city} Main Branch`, accountTitle: name, iban: `PK${String(rng.int(10, 99))}${bank.ibanBankCode}${r.acct}`, isPrimary: true, effectiveFrom: e.join, isActive: true },
      });
      existing = await list();
      ids.push(existing.find((x) => x.name === name).id);
    }

    // Link the two sign-in users to their employee records (self-service, My Team).
    const users: any[] = await ctx.admin.all('/settings/users');
    const userFor = (k: 'admin' | 'approver') => users.find((u) => u.email === (k === 'admin' ? (process.env.SHOWCASE_USER_EMAIL ?? 'admin@showcase.accountex.local') : `approver@${process.env.SHOWCASE_TENANT_CODE ?? 'showcase'}.accountex.local`));
    const linked: Record<number, string> = {};
    for (const [i, e] of EMPLOYEES.entries()) {
      if (!e.user) continue;
      const u = userFor(e.user);
      if (!u) continue;
      const emp: any = await ctx.admin.get(`/hr/employees/${ids[i]}`);
      const current = emp.userId ?? emp.user?.id ?? null;
      if (current !== u.id) await soft(ctx, `link ${e.user} user`, () => ctx.admin.post(`/hr/employees/${ids[i]}/link-user`, { userId: u.id, rowVersion: emp.rowVersion }));
      linked[i] = u.id;
    }

    // Department heads.
    const depts = rows(await ctx.admin.get('/hr/departments?pageSize=500'));
    const heads: Record<string, number> = { MGT: 0, FIN: 1, HRA: 1, SAL: 2, WH: 3, DIST: 13 };
    for (const [code, idx] of Object.entries(heads)) {
      const d = depts.find((x) => x.code === code);
      if (d && d.head?.id !== ids[idx]) await soft(ctx, `head of ${code}`, () => ctx.admin.patch(`/hr/departments/${d.id}`, { headEmployeeId: ids[idx], rowVersion: d.rowVersion }));
    }

    const all = await list();
    p.employees = EMPLOYEES.map((e, i) => {
      const x = all.find((y) => y.id === ids[i]);
      const des = p.designations[e.des];
      return {
        id: ids[i], code: x.code, name: x.name, branchId: branchBy[e.br], branchCode: e.br, departmentId: p.departments[des.departmentCode].id, departmentCode: des.departmentCode,
        designation: e.des, gradeCode: des.gradeCode, managerId: e.mgr === null ? null : ids[e.mgr], userId: linked[i] ?? null, joinDate: e.join, basic: e.basic, gender: e.g, ...flags(e.des),
      };
    });
    ctx.save();
    ctx.log(`  ${p.employees.length} employees (${Object.keys(linked).length} linked to users)`);
  },
};

// ------------------------------------------------------------------------------------------------ payroll setup
/** code, name, type, method, base basis, base code, percent, systemRole, tax, debit, credit, ceiling, formula, description, flags */
type Comp = { code: string; name: string; type: string; method: string; basis?: string; base?: string; pct?: number; role?: string; tax?: string; dr?: string; cr?: string; ceil?: number; formula?: string; desc: string; exPct?: number; exAmt?: number; show?: boolean; grat?: boolean; eobi?: boolean };
const COMPONENTS: Comp[] = [
  { code: 'BAS', name: 'Basic Salary', type: 'EARNING', method: 'FIXED', role: 'BASIC', tax: 'FULLY_TAXABLE', dr: '5210-01', desc: 'Fixed — per grade', grat: true, eobi: true },
  { code: 'HRA', name: 'House Rent Allowance', type: 'EARNING', method: 'PERCENT_OF', basis: 'COMPONENT', base: 'BAS', pct: 45, tax: 'FULLY_TAXABLE', dr: '5210-01', desc: '45% of Basic' },
  { code: 'MED', name: 'Medical Allowance', type: 'EARNING', method: 'PERCENT_OF', basis: 'COMPONENT', base: 'BAS', pct: 10, tax: 'EXEMPT_UPTO_LIMIT', exPct: 10, dr: '5210-01', desc: '10% of Basic' },
  { code: 'UTL', name: 'Utilities Allowance', type: 'EARNING', method: 'FIXED', tax: 'FULLY_TAXABLE', dr: '5210-01', desc: 'Fixed — per grade' },
  { code: 'CNV', name: 'Conveyance Allowance', type: 'EARNING', method: 'FIXED', tax: 'FULLY_TAXABLE', dr: '5210-01', desc: 'Fixed — per grade' },
  { code: 'COM', name: 'Sales Commission', type: 'EARNING', method: 'MONTHLY_INPUT', role: 'COMMISSION', tax: 'FULLY_TAXABLE', dr: '5210-09', desc: 'Variable — monthly input' },
  { code: 'OVT', name: 'Overtime', type: 'EARNING', method: 'FORMULA', role: 'OVERTIME', tax: 'FULLY_TAXABLE', dr: '5210-02', formula: '(BAS / 208) * 2 * OT_HOURS', desc: '(Basic ÷ 208) × 2 × OT hrs' },
  { code: 'ITX', name: 'Income Tax u/s 149', type: 'DEDUCTION', method: 'SYSTEM', role: 'INCOME_TAX', cr: '2140-03', desc: 'FBR slab on projected annual taxable' },
  { code: 'EOB', name: 'EOBI — Employee', type: 'DEDUCTION', method: 'PERCENT_OF', basis: 'EOBI_WAGE', pct: 1, role: 'EOBI_EMPLOYEE', cr: '2150-01', ceil: 37000, desc: '1% of min. wage Rs 37,000' },
  { code: 'PFE', name: 'Provident Fund — Employee', type: 'DEDUCTION', method: 'PERCENT_OF', basis: 'COMPONENT', base: 'BAS', pct: 8, role: 'PF_EMPLOYEE', cr: '2150-03', desc: '8% of Basic' },
  { code: 'LON', name: 'Loan Installment', type: 'DEDUCTION', method: 'SYSTEM', role: 'LOAN', cr: '1140-03', desc: 'From loan schedule' },
  { code: 'ADV', name: 'Salary Advance', type: 'DEDUCTION', method: 'SYSTEM', role: 'ADVANCE', cr: '1140-02', desc: 'From advance schedule' },
  { code: 'EOR', name: 'EOBI — Employer', type: 'EMPLOYER_CONTRIBUTION', method: 'PERCENT_OF', basis: 'EOBI_WAGE', pct: 5, role: 'EOBI_EMPLOYER', dr: '5210-04', cr: '2150-01', ceil: 37000, desc: '5% of Rs 37,000', show: false },
  { code: 'PSI', name: 'PESSI / SESSI — Employer', type: 'EMPLOYER_CONTRIBUTION', method: 'PERCENT_OF', basis: 'GROSS', pct: 6, role: 'PESSI_EMPLOYER', dr: '5210-05', cr: '2150-02', ceil: 37000, desc: '6% of wages up to Rs 37,000', show: false },
  { code: 'PFR', name: 'Provident Fund — Employer', type: 'EMPLOYER_CONTRIBUTION', method: 'PERCENT_OF', basis: 'COMPONENT', base: 'BAS', pct: 8, role: 'PF_EMPLOYER', tax: 'EXEMPT_UPTO_LIMIT', exAmt: 150000, dr: '5210-06', cr: '2150-03', desc: '8% of Basic (matching)' },
  { code: 'GRT', name: 'Gratuity Provision', type: 'EMPLOYER_CONTRIBUTION', method: 'FORMULA', role: 'GRATUITY', dr: '5210-07', cr: '2220-01', formula: 'BAS / 12', desc: '1 month Basic per completed year ÷ 12', show: false },
];
/** Fixed allowances per grade: utilities, conveyance. */
const FIXED_BY_GRADE: Record<string, [number, number]> = { 'G-1': [2000, 3000], 'G-2': [3000, 5000], 'G-3': [5000, 8000], 'G-4': [8000, 12000], 'G-5': [12000, 18000], 'G-6': [20000, 30000] };

const payrollSetup: Step = {
  name: 'masters.people.payroll-setup',
  async run(ctx) {
    const p = P(ctx);
    const opts: any = await ctx.admin.get('/payroll/options');
    let accounts: any[] = opts.accounts;
    const acct = (code?: string) => {
      if (!code) return null;
      const a = accounts.find((x) => x.code === code);
      if (!a) throw new Error(`account ${code} not in payroll options`);
      return a.id;
    };
    let comps = rows(await ctx.admin.get('/payroll/components'));
    for (const [i, c] of COMPONENTS.entries()) {
      if (comps.some((x) => x.code === c.code)) continue;
      await ctx.admin.post('/payroll/components', {
        code: c.code, name: c.name, componentType: c.type, calcMethod: c.method, baseBasis: c.basis ?? null, baseComponentId: c.base ? comps.find((x) => x.code === c.base).id : null,
        percent: c.pct ?? null, wageCeiling: c.ceil ?? null, formula: c.formula ?? null, calcDescription: c.desc, debitAccountId: acct(c.dr), creditAccountId: acct(c.cr),
        taxTreatment: c.tax ?? null, exemptLimitPercentOfBasic: c.exPct ?? null, exemptLimitAnnualAmount: c.exAmt ?? null, prorateOnPaidDays: true, showOnPayslip: c.show ?? true,
        includeInGratuityBase: !!c.grat, includeInEobiWage: !!c.eobi, systemRole: c.role ?? null, sortOrder: (i + 1) * 10,
      });
      comps = rows(await ctx.admin.get('/payroll/components'));
    }
    p.components = Object.fromEntries(comps.map((c) => [c.code, c.id]));

    // Grade structures (G-1 … G-6) and a field-sales add-on with commission tiers.
    let structs = rows(await ctx.admin.get('/payroll/structures'));
    const line = (code: string, extra: Record<string, unknown> = {}) => ({ componentId: p.components[code], ...extra });
    for (const g of GRADES) {
      const code = `S${g.levelRank}`;
      if (structs.some((s) => s.code === code)) continue;
      const [utl, cnv] = FIXED_BY_GRADE[g.code];
      const lines = [
        line('BAS'), line('HRA'), line('MED'), line('UTL', { calcMethod: 'FIXED', fixedAmount: utl }), line('CNV', { calcMethod: 'FIXED', fixedAmount: cnv }),
        ...(g.levelRank <= 2 ? [line('OVT')] : []), line('EOB'), line('EOR'), ...(g.levelRank <= 3 ? [line('PSI')] : []),
        ...(g.levelRank >= 3 ? [line('PFE'), line('PFR')] : []), line('GRT'),
      ];
      await ctx.admin.post('/payroll/structures', { code, name: `${g.levelName} (${g.code})`, structureKind: 'GRADE', gradeId: p.grades[g.code].id, basicMin: g.minSalary, basicMax: g.maxSalary, description: `Standard package for grade ${g.code}`, effectiveFrom: '2025-04-01', lines });
      structs = rows(await ctx.admin.get('/payroll/structures'));
    }
    if (!structs.some((s) => s.code === 'FIELD')) {
      await ctx.admin.post('/payroll/structures', {
        code: 'FIELD', name: 'Field sales commission', structureKind: 'ADDON', commissionCapPercentOfBasic: 60, description: 'Monthly commission on target achievement for field sales',
        effectiveFrom: '2025-04-01', lines: [line('COM')],
        tiers: [{ achievementFromPct: 0, achievementToPct: 80, commissionRatePct: 0 }, { achievementFromPct: 80, achievementToPct: 100, commissionRatePct: 1 }, { achievementFromPct: 100, achievementToPct: null, commissionRatePct: 1.5 }],
      });
      structs = rows(await ctx.admin.get('/payroll/structures'));
    }
    for (const s of structs) if (s.status === 'DRAFT') await ctx.admin.post(`/payroll/structures/${s.id}/activate`, { rowVersion: s.rowVersion });
    structs = rows(await ctx.admin.get('/payroll/structures'));
    p.salaryStructures = Object.fromEntries(structs.map((s) => [s.code === 'FIELD' ? 'ADDON_FIELD' : (s.grade?.code ?? s.code), s.id]));

    const groups = rows(await ctx.admin.get('/payroll/pay-groups'));
    p.payGroups = Object.fromEntries(groups.map((g) => [g.code, g.id]));

    // Tax slabs: the history needs tax years 2024-25 and 2025-26 (only the current year is seeded); same slabs as the current year.
    const years: any[] = await ctx.admin.get('/payroll/tax-slabs');
    const cur = years.find((y) => y.slabs.length);
    for (const year of ['2024-25', '2025-26']) {
      if (years.some((y) => y.taxYear === year && y.slabs.length) || !cur) continue;
      await ctx.admin.put(`/payroll/tax-slabs/${year}`, { slabs: cur.slabs.map((s: any) => ({ incomeFrom: s.incomeFrom, incomeTo: s.incomeTo, fixedTax: s.fixedTax, ratePercent: s.ratePercent })) });
    }
    accounts = [];
    ctx.save();
    ctx.log(`  ${comps.length} components, ${structs.length} structures, pay groups ${Object.keys(p.payGroups).join('/')}`);
  },
};

const r500 = (n: number) => Math.round(n / 500) * 500;

const salaries: Step = {
  name: 'masters.people.salaries',
  async run(ctx) {
    const p = P(ctx);
    let made = 0;
    await pool(p.employees as any[], 4, async (e) => {
      const view: any = await ctx.admin.get(`/payroll/employee-salaries?employee=${e.id}`);
      if (view.history?.length) return;
      const base = {
        structureId: p.salaryStructures[e.gradeCode], addonStructureId: e.isSalesman || e.isBooker || e.designation === 'Sales Officer' ? p.salaryStructures.ADDON_FIELD : null,
        payGroupId: p.payGroups[Number(e.gradeCode.slice(2)) >= 5 ? 'MANAGEMENT' : 'STAFF'] ?? null, payMode: 'BANK_TRANSFER',
      };
      // Steps: first salary, then increments on 1 Jul 2025 and 1 Jul 2026 (current basic is the latest).
      const first = e.joinDate > '2025-04-01' ? e.joinDate : '2025-04-01';
      const steps = ['2025-07-01', '2026-07-01'].filter((d) => d > first);
      let amount = e.basic;
      const amounts = [amount];
      for (let i = 0; i < steps.length; i++) amounts.unshift(amount = r500(amount / 1.1));
      let latest: any = await ctx.admin.post('/payroll/employee-salaries', { ...base, employeeId: e.id, basicAmount: amounts[0], revisionType: 'JOINING', effectiveFrom: first, revisionReason: e.joinDate > '2025-04-01' ? 'Joining salary' : 'Salary on record at system go-live' });
      for (const [i, d] of steps.entries()) {
        const v: any = await ctx.admin.get(`/payroll/employee-salaries?employee=${e.id}`);
        latest = v.history[0];
        await ctx.admin.post(`/payroll/employee-salaries/${e.id}/revise`, { ...base, basicAmount: amounts[i + 1], revisionType: 'INCREMENT', revisionReason: `Annual increment ${d.slice(0, 4)}`, effectiveFrom: d, rowVersion: latest.rowVersion });
      }
      made++;
    });
    ctx.log(`  salaries for ${made} employees`);
  },
};

const leaveTypes: Step = {
  name: 'masters.people.leave-types',
  async run(ctx) {
    const lt = rows(await ctx.admin.get('/hr/leave-types'));
    P(ctx).leaveTypes = lt.map((l) => ({ id: l.id, code: l.code, name: l.name, isPaid: l.isPaid }));
    ctx.save();
    ctx.log(`  ${lt.length} leave types recorded`);
  },
};

// ------------------------------------------------------------------------------------------------ HR content
const POLICIES = [
  { code: 'HR-01', title: 'Code of Conduct', category: 'HR', readMinutes: 12, body: 'All employees are expected to act with integrity, treat colleagues, customers and suppliers with respect, and avoid conflicts of interest. Gifts above Rs 5,000 must be declared to HR. Harassment of any kind is not tolerated and is handled under the Protection against Harassment of Women at the Workplace Act 2010. Breaches may lead to disciplinary action up to termination.' },
  { code: 'HR-02', title: 'Leave Policy', category: 'HR', readMinutes: 8, body: 'Employees earn 18 days of annual leave (1.5 days a month), 10 days of casual leave and 16 days of sick leave each year. Annual leave must be applied for at least 7 days in advance through My Profile. Up to 12 unused annual leave days carry forward for 12 months. Sick leave of more than 2 days needs a medical certificate.' },
  { code: 'FIN-01', title: 'Travel & Expense Policy', category: 'FINANCE', readMinutes: 10, body: 'Business travel must be approved by the line manager in advance. Daily allowance: Rs 3,000 within the province and Rs 5,000 outside it. Fuel is reimbursed at the OGRA rate against the logbook. Claims are submitted within 30 days with original receipts through Expense Claims; claims above Rs 50,000 need Finance Manager approval.' },
  { code: 'IT-01', title: 'IT Acceptable Use', category: 'IT', readMinutes: 6, body: 'Company laptops, phones and accounts are for business use. Never share passwords; use two-factor sign-in where offered. Do not install unlicensed software or move company data to personal storage. Report lost devices and suspicious emails to IT immediately.' },
];

const content: Step = {
  name: 'masters.people.content',
  async run(ctx) {
    const p = P(ctx);
    const owner = p.employees?.[1]?.id ?? null;

    let pols = await ctx.admin.all('/hr/policies');
    for (const pol of POLICIES) {
      let x = pols.find((y) => y.code === pol.code);
      if (!x) { x = await ctx.admin.post('/hr/policies', { ...pol, version: '1', effectiveDate: '2025-04-01', ownerEmployeeId: owner, requiresAcknowledgement: true }); pols = await ctx.admin.all('/hr/policies'); x = pols.find((y) => y.code === pol.code); }
      if (x.status === 'DRAFT') await ctx.admin.post(`/hr/policies/${x.id}/publish`, { rowVersion: x.rowVersion });
    }
    pols = await ctx.admin.all('/hr/policies');
    p.policies = pols.map((x) => ({ id: x.id, code: x.code, title: x.title }));

    const cycles = [
      { name: 'Annual Review FY 2025-26', cycleType: 'ANNUAL', periodStart: '2025-07-01', periodEnd: '2026-06-30', goalSettingDue: '2025-07-31', selfReviewDue: '2026-06-15', managerReviewDue: '2026-06-30', calibrationStart: '2026-07-01', calibrationEnd: '2026-07-10', signOffDue: '2026-07-20', incrementsEffectiveMonth: '2026-07-01', excludeProbation: true, ratingScaleMax: 5 },
      { name: 'Mid-Year Review H1 FY 2026-27', cycleType: 'HALF_YEARLY', periodStart: '2026-07-01', periodEnd: '2026-12-31', goalSettingDue: '2026-07-31', selfReviewDue: '2026-12-15', managerReviewDue: '2026-12-31', calibrationStart: '2027-01-05', calibrationEnd: '2027-01-12', signOffDue: '2027-01-20', excludeProbation: true, ratingScaleMax: 5 },
    ];
    let cyc = await ctx.admin.all('/hr/performance-cycles');
    for (const c of cycles) if (!cyc.some((x) => x.name === c.name)) await ctx.admin.post('/hr/performance-cycles', c);
    cyc = await ctx.admin.all('/hr/performance-cycles');
    const h1 = cyc.find((x) => x.name === cycles[1].name);
    if (h1?.status === 'DRAFT' && !cyc.some((x) => x.status === 'ACTIVE')) await soft(ctx, 'open H1 cycle', () => ctx.admin.post(`/hr/performance-cycles/${h1.id}/open`, { rowVersion: h1.rowVersion }));
    cyc = await ctx.admin.all('/hr/performance-cycles');
    p.performanceCycles = cyc.map((x) => ({ id: x.id, name: x.name, status: x.status }));

    const programs = [
      { code: 'TRN-SALES', name: 'Consultative Selling for Field Sales', audience: 'Salesmen and order bookers', departmentId: p.departments?.SAL?.id ?? null, format: 'WORKSHOP', durationLabel: '2 days', durationHours: 14, provider: 'Lahore School of Sales', isMandatory: true, seats: 20, targetParticipants: 14, budget: 280000, costPerHead: 20000, startDate: '2025-10-06', endDate: '2025-10-07', description: 'Needs discovery, objection handling, merchandising and order upselling at retail outlets.' },
      { code: 'TRN-FIRE', name: 'Fire Safety & Warehouse Handling', audience: 'Warehouse and delivery staff', departmentId: p.departments?.WH?.id ?? null, format: 'WORKSHOP', durationLabel: '1 day', durationHours: 6, provider: 'Rescue 1122 Training Wing', isMandatory: true, seats: 25, targetParticipants: 12, budget: 60000, costPerHead: 5000, grantsCertification: 'Fire Warden', certificationValidityMonths: 24, startDate: '2025-08-20', endDate: '2025-08-20', description: 'Fire drills, safe stacking, forklift awareness and first aid.' },
      { code: 'TRN-TAX', name: 'Sales Tax & FBR Digital Invoicing', audience: 'Finance team', departmentId: p.departments?.FIN?.id ?? null, format: 'ONLINE', durationLabel: '4 sessions', durationHours: 8, provider: 'ICAP CPD', isCpdCertified: true, seats: 10, targetParticipants: 5, budget: 75000, costPerHead: 15000, startDate: '2026-02-02', endDate: '2026-02-23', description: 'Sales Tax Act updates, withholding regimes, annexures and FBR integration.' },
      { code: 'TRN-LEAD', name: 'First-Time Managers', audience: 'Officers and managers', format: 'BLENDED', durationLabel: '6 weeks', durationHours: 18, provider: 'LUMS Executive Education', seats: 12, targetParticipants: 8, budget: 480000, costPerHead: 60000, startDate: '2026-09-07', endDate: '2026-10-16', description: 'Coaching, feedback, delegation and running effective team meetings.' },
    ];
    let progs = await ctx.admin.all('/hr/training-programs');
    for (const t of programs) if (!progs.some((x) => x.code === t.code)) await ctx.admin.post('/hr/training-programs', t);
    progs = await ctx.admin.all('/hr/training-programs');
    p.trainingPrograms = progs.map((x) => ({ id: x.id, code: x.code, name: x.name }));

    const tpls = await ctx.admin.all('/hr/onboarding-templates');
    p.onboardingTemplates = tpls.map((x) => ({ id: x.id, name: x.name }));
    ctx.save();

    // Announcements (published) and polls (open).
    const anns = [
      { title: 'Welcome to the new Accountex workspace', kind: 'GENERAL', summary: 'Payslips, leave and claims are now in My Profile.', body: 'From this month all leave requests, expense claims and payslips move to My Profile. Ask HR for a walkthrough.', isPinned: true },
      { title: 'Annual sales conference 2026', kind: 'EVENT', summary: 'All sales staff meet in Lahore on 14 November.', body: 'Agenda: FY 2026-27 targets, new product launches from our principals, and awards for the top routes.', eventAt: '2026-11-14T10:00:00+05:00', venue: 'Pearl Continental, Lahore', requiresRsvp: true },
      { title: 'Updated Travel & Expense Policy', kind: 'POLICY_UPDATE', summary: 'New daily allowance rates from 1 July 2026.', body: 'Daily allowance is now Rs 3,000 within the province and Rs 5,000 outside it. Please read and acknowledge the policy in My Profile.' },
      { title: 'Group health insurance renewed', kind: 'BENEFIT', summary: 'Cover now includes parents of employees.', body: 'Our group health policy has been renewed for another year with parents now covered up to Rs 300,000 a year.' },
      { title: 'Karachi branch crosses Rs 100 million in sales', kind: 'CELEBRATION', summary: 'Well done, team Karachi!', body: 'The Karachi branch crossed Rs 100 million in sales for FY 2025-26. Thank you to every salesman, driver and storekeeper.', branchId: (ctx.state.ids.branches as any[]).find((b) => b.code === 'KHI')?.id ?? null },
    ];
    let have = await ctx.admin.all('/company/announcements');
    for (const a of anns) {
      let x = have.find((y) => y.title === a.title);
      if (!x) { await ctx.admin.post('/company/announcements', { ...a, authorEmployeeId: owner, authorLabel: 'HR & Admin' }); have = await ctx.admin.all('/company/announcements'); x = have.find((y) => y.title === a.title); }
      if (x.status === 'DRAFT') await soft(ctx, `publish "${a.title}"`, () => ctx.admin.post(`/company/announcements/${x.id}/publish`, { rowVersion: x.rowVersion }));
    }
    have = await ctx.admin.all('/company/announcements');
    p.announcements = have.map((x) => ({ id: x.id, title: x.title }));

    const now = Date.now();
    const polls = [
      { question: 'Which day suits the monthly team lunch best?', options: [{ label: 'First Friday' }, { label: 'Last Friday' }, { label: 'Mid-month Saturday' }] },
      { question: 'Which training would help you most next quarter?', options: [{ label: 'Excel and reporting' }, { label: 'Negotiation skills' }, { label: 'Leadership basics' }, { label: 'Safe driving' }] },
    ];
    let pl = await ctx.admin.all('/company/polls');
    for (const q of polls) {
      let x = pl.find((y) => y.question === q.question);
      if (!x) { await ctx.admin.post('/company/polls', { ...q, opensAt: new Date(now - 60_000).toISOString(), closesAt: new Date(now + 30 * 86400_000).toISOString(), showResultsAfterVote: true }); pl = await ctx.admin.all('/company/polls'); x = pl.find((y) => y.question === q.question); }
      if (x.status === 'DRAFT') await soft(ctx, 'open poll', () => ctx.admin.post(`/company/polls/${x.id}/open`, { rowVersion: x.rowVersion }));
    }
    pl = await ctx.admin.all('/company/polls');
    p.polls = pl.map((x) => ({ id: x.id, question: x.question }));
    ctx.save();
    ctx.log(`  ${p.policies.length} policies, ${p.performanceCycles.length} cycles, ${p.trainingPrograms.length} programs, ${p.announcements.length} announcements, ${p.polls.length} polls`);
  },
};

export const steps: Step[] = [organisation, holidays, employees, payrollSetup, salaries, leaveTypes, content];
