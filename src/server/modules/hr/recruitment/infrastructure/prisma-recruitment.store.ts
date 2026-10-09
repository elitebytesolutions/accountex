import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  RecruitmentActivity, RecruitmentActivityInput, RecruitmentCandidate, RecruitmentCandidateQuery, RecruitmentOpening, RecruitmentOptions, RecruitmentStageCounts,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, employeeOfUser, employeeRefs, ids, tenantTimezone, todayIn, userNames } from '../../attendance/infrastructure/hr-refs.js';
import { RecruitmentStore, type RecruitmentOpeningMove } from '../application/recruitment-store.js';

type Db = Prisma.TransactionClient;
type OpeningRow = Prisma.JobOpeningsGetPayload<object>;
type CandidateRow = Prisma.CandidatesGetPayload<object>;
const n = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : null);
const LIVE = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'];
const MOVES: Record<RecruitmentOpeningMove, string> = {
  submit: 'jobOpeningSubmit', approve: 'jobOpeningApprove', return: 'jobOpeningReturn', open: 'jobOpeningOpen', hold: 'jobOpeningHold', close: 'jobOpeningClose', cancel: 'jobOpeningCancel',
};
const addDays = (d: string, k: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

@Injectable()
export class PrismaRecruitmentStore extends RecruitmentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  private async openingItems(db: Db, tenantId: string, rows: OpeningRow[]): Promise<RecruitmentOpening[]> {
    const [depts, branches, desigs, refs, stages] = await Promise.all([
      db.departments.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.departmentId)) } }, select: { id: true, name: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, name: true } }),
      db.designations.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.designationId)) } }, select: { id: true, title: true } }),
      employeeRefs(db, tenantId, rows.flatMap((r) => [r.hiringManagerEmployeeId, r.replacesEmployeeId])),
      db.candidates.groupBy({ by: ['jobRequisitionId', 'stage'], where: { tenantId, jobRequisitionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    ]);
    const who = (id: string | null) => { const e = id ? refs.get(id) : null; return e ? { id: e.id, name: e.name } : null; };
    return rows.map((r) => {
      const c = (s: string) => stages.find((x) => x.jobRequisitionId === r.id && x.stage === s)?._count._all ?? 0;
      const counts: RecruitmentStageCounts = { applied: c('APPLIED'), screening: c('SCREENING'), interview: c('INTERVIEW'), offer: c('OFFER'), hired: c('HIRED'), rejected: c('REJECTED'), total: 0 };
      counts.total = counts.applied + counts.screening + counts.interview + counts.offer + counts.hired + counts.rejected;
      return {
        id: r.id, docNo: r.docNo, title: r.title, designation: desigs.find((d) => d.id === r.designationId) ?? null,
        department: depts.find((d) => d.id === r.departmentId) ?? { id: r.departmentId, name: '?' }, branch: branches.find((b) => b.id === r.branchId) ?? { id: r.branchId, name: '?' },
        openings: r.openings, requisitionType: r.requisitionType, replaces: who(r.replacesEmployeeId), hiringMode: r.hiringMode, hiringManager: who(r.hiringManagerEmployeeId),
        priority: r.priority, salaryMin: n(r.salaryMin), salaryMax: n(r.salaryMax), jobDescription: r.jobDescription, postedChannels: r.postedChannels, postedOn: day(r.postedOn),
        targetHireDate: day(r.targetHireDate), status: r.status, closedOn: day(r.closedOn), createdAt: r.createdAt.toISOString(), counts, rowVersion: r.rowVersion,
      };
    });
  }

  async overview(tenantId: string, today: string) {
    const db = this.db();
    const tenant = await db.tenants.findFirst({ where: { id: tenantId }, select: { fiscalYearStartMonth: true } });
    const fyMonth = tenant?.fiscalYearStartMonth ?? 7;
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    const fyStart = new Date(Date.UTC(m >= fyMonth ? y : y - 1, fyMonth - 1, 1));
    const [rows, byStatus, active, thisWeek, offers, hires] = await Promise.all([
      db.jobOpenings.findMany({ where: { tenantId }, orderBy: [{ createdAt: 'desc' }] }),
      db.jobOpenings.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      db.candidates.count({ where: { tenantId, stage: { in: LIVE } } }),
      db.candidates.count({ where: { tenantId, appliedOn: { gte: new Date(`${addDays(today, -6)}T00:00:00Z`) } } }),
      db.candidates.findMany({ where: { tenantId, offerSentOn: { gte: fyStart } }, select: { offerStatus: true } }),
      db.candidates.findMany({ where: { tenantId, stage: 'HIRED', updatedAt: { gte: fyStart } }, select: { jobRequisitionId: true, updatedAt: true } }),
    ]);
    const openRows = rows.filter((r) => ['OPEN', 'OFFER_STAGE'].includes(r.status));
    const posted = new Map(rows.map((r) => [r.id, r.postedOn ?? r.createdAt]));
    const ttH = hires.map((h) => (h.updatedAt.getTime() - (posted.get(h.jobRequisitionId)?.getTime() ?? h.updatedAt.getTime())) / 86_400_000).filter((d) => d >= 0);
    return {
      today,
      kpis: {
        openPositions: openRows.length, vacancies: openRows.reduce((s, r) => s + r.openings, 0), branches: new Set(openRows.map((r) => r.branchId)).size,
        activeApplicants: active, appliedThisWeek: thisWeek, avgTimeToHire: ttH.length ? Math.round(ttH.reduce((s, d) => s + d, 0) / ttH.length) : null,
        offersMade: offers.length, offersAccepted: offers.filter((o) => o.offerStatus === 'ACCEPTED').length,
      },
      counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      openings: await this.openingItems(db, tenantId, rows),
    };
  }

  async options(tenantId: string): Promise<RecruitmentOptions> {
    const db = this.db();
    const [depts, branches, desigs, grades, emps, templates] = await Promise.all([
      db.departments.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.designations.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, title: true, departmentId: true }, orderBy: { title: 'asc' } }),
      db.grades.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, levelName: true }, orderBy: { levelRank: 'asc' } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true, status: true }, orderBy: { code: 'asc' } }),
      db.onboardingTemplates.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true, isDefault: true, track: true }, orderBy: { name: 'asc' } }),
    ]);
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return {
      departments: depts, branches, designations: desigs, grades: grades.map((g) => ({ id: g.id, name: `${g.code} · ${g.levelName}` })),
      employees: emps.map((e) => ({ ...refs.get(e.id)!, status: e.status })),
      templates: templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault && t.track === 'NEW_JOINER' })),
    };
  }

  async opening(tenantId: string, id: string) {
    const row = await this.db().jobOpenings.findFirst({ where: { tenantId, id } });
    return row ? { ...(await this.openingItems(this.db(), tenantId, [row]))[0]!, createdBy: row.createdBy } : null;
  }

  private async candidateItems(db: Db, tenantId: string, rows: CandidateRow[]): Promise<RecruitmentCandidate[]> {
    const [openings, refs, onboardings] = await Promise.all([
      db.jobOpenings.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.jobRequisitionId)) } }, select: { id: true, docNo: true, title: true, status: true } }),
      employeeRefs(db, tenantId, rows.flatMap((r) => [r.referredByEmployeeId, r.hiredEmployeeId])),
      db.onboardings.findMany({ where: { tenantId, candidateId: { in: rows.filter((r) => r.stage === 'HIRED').map((r) => r.id) } }, select: { id: true, docNo: true, status: true, candidateId: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return rows.map((r) => {
      const ref = r.referredByEmployeeId ? refs.get(r.referredByEmployeeId) : null;
      const hired = r.hiredEmployeeId ? refs.get(r.hiredEmployeeId) : null;
      const onb = onboardings.find((o) => o.candidateId === r.id);
      return {
        id: r.id, opening: openings.find((o) => o.id === r.jobRequisitionId) ?? { id: r.jobRequisitionId, docNo: '?', title: '?', status: '?' },
        fullName: r.fullName, email: r.email, phone: r.phone, cnic: r.cnic, headline: r.headline, currentEmployer: r.currentEmployer, currentTitle: r.currentTitle,
        experienceYears: n(r.experienceYears), education: r.education, source: r.source, referredBy: ref ? { id: ref.id, name: ref.name } : null,
        appliedOn: day(r.appliedOn)!, stage: r.stage, currentSalary: n(r.currentSalary), expectedSalary: n(r.expectedSalary), noticeDays: r.noticeDays,
        rating: n(r.rating), nextInterviewAt: r.nextInterviewAt?.toISOString() ?? null, offeredSalary: n(r.offeredSalary), offerStatus: r.offerStatus,
        offerSentOn: day(r.offerSentOn), hiredEmployee: hired ? { id: hired.id, code: hired.code, name: hired.name } : null,
        onboarding: onb ? { id: onb.id, docNo: onb.docNo, status: onb.status } : null, rejectionReason: r.rejectionReason, rowVersion: r.rowVersion,
      };
    });
  }

  async candidates(tenantId: string, q: RecruitmentCandidateQuery) {
    const s = q.search?.trim();
    const rows = await this.db().candidates.findMany({
      where: {
        tenantId, ...(q.openingId && { jobRequisitionId: q.openingId }), ...(q.stage && { stage: q.stage }),
        ...(s && { OR: [{ fullName: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }, { phone: { contains: s } }] }),
      },
      orderBy: [{ rating: { sort: 'desc', nulls: 'last' } }, { appliedOn: 'desc' }],
      take: 500,
    });
    return this.candidateItems(this.db(), tenantId, rows);
  }

  async candidate(tenantId: string, id: string) {
    const db = this.db();
    const row = await db.candidates.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const [item] = await this.candidateItems(db, tenantId, [row]);
    const acts = await db.candidateActivities.findMany({ where: { tenantId, candidateId: id }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] });
    const [refs, users] = await Promise.all([employeeRefs(db, tenantId, acts.map((a) => a.byEmployeeId)), userNames(db, tenantId, acts.map((a) => a.createdBy))]);
    const activities: RecruitmentActivity[] = acts.map((a) => {
      const by = a.byEmployeeId ? refs.get(a.byEmployeeId) : null;
      return {
        id: a.id, activityType: a.activityType, occurredAt: a.occurredAt.toISOString(), scheduledAt: a.scheduledAt?.toISOString() ?? null, by: by ? { id: by.id, name: by.name } : null,
        panelNote: a.panelNote, fromStage: a.fromStage, toStage: a.toStage, scorePct: n(a.scorePct), rating: a.rating, summary: a.summary, notes: a.notes,
        createdBy: users.get(a.createdBy ?? '') ?? null,
      };
    });
    const rated = acts.filter((a) => a.rating != null);
    return { ...item!, activities, reviewers: new Set(rated.map((a) => a.byEmployeeId ?? a.createdBy)).size, avgScore: rated.length ? Math.round((rated.reduce((s, a) => s + a.rating!, 0) / rated.length) * 10) / 10 : null };
  }

  async emailTaken(tenantId: string, openingId: string, email: string, exceptId: string | null) {
    return (await this.db().candidates.count({ where: { tenantId, jobRequisitionId: openingId, email: { equals: email, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) } })) > 0;
  }

  async employeeIdOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.db(), tenantId, userId))?.id ?? null;
  }

  saveOpening(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'jobOpeningAddUpdate', data);
  }

  async moveOpening(id: string, move: RecruitmentOpeningMove, args: { approvalRequestId?: string | null; channels?: string[] | null; reason?: string | null }) {
    const db = this.db();
    const fn = MOVES[move];
    if (move === 'submit') await db.$queryRawUnsafe(`select "HumanResources"."${fn}"($1::uuid, $2::uuid)::text`, id, args.approvalRequestId ?? null);
    else if (move === 'open') await db.$queryRawUnsafe(`select "HumanResources"."${fn}"($1::uuid, $2::text[])::text`, id, args.channels ?? null);
    else if (move === 'cancel') await db.$queryRawUnsafe(`select "HumanResources"."${fn}"($1::uuid, $2)::text`, id, args.reason ?? null);
    else await db.$queryRawUnsafe(`select "HumanResources"."${fn}"($1::uuid)::text`, id);
  }

  saveCandidate(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'candidateAddUpdate', data);
  }

  async moveCandidate(id: string, data: Record<string, unknown>) {
    await this.db().$queryRaw`select "HumanResources"."candidateMove"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text`;
  }

  async rejectCandidate(id: string, data: Record<string, unknown>) {
    await this.db().$queryRaw`select "HumanResources"."candidateReject"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text`;
  }

  async hireCandidate(id: string, data: Record<string, unknown>) {
    const rows = await this.db().$queryRaw<{ id: string }[]>`select "HumanResources"."candidateHire"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text as id`;
    return rows[0]!.id;
  }

  async addActivity(tenantId: string, candidateId: string, a: RecruitmentActivityInput) {
    await this.db().candidateActivities.create({
      data: {
        tenantId, candidateId, activityType: a.activityType, occurredAt: a.occurredAt ? new Date(a.occurredAt) : new Date(), scheduledAt: a.scheduledAt ? new Date(a.scheduledAt) : null,
        byEmployeeId: a.byEmployeeId, panelNote: a.panelNote, scorePct: a.scorePct, rating: a.rating, summary: a.summary, notes: a.notes,
      },
    });
    // an interview booked for later shows on the candidate's card
    if (a.scheduledAt && new Date(a.scheduledAt).getTime() > Date.now()) await this.saveCandidate({ id: candidateId, nextInterviewAt: a.scheduledAt });
  }

  async onboardingRef(tenantId: string, id: string) {
    const o = await this.db().onboardings.findFirst({ where: { tenantId, id }, select: { id: true, docNo: true } });
    return o ?? { id, docNo: '?' };
  }
}

