import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  DECLARATION_TYPES, PROOF_MAX_BYTES, PROOF_TYPES, payrollAnnualTax, payrollTaxYearOf,
  type MyTaxView, type SessionUser, type TaxDeclarationInput, type TaxProjection,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { AttachmentsService, type UploadedFileData } from '../../../attachments/application/attachments.service.js';
import { ComponentStore } from '../../components/application/component-store.js';
import { TaxSlabStore } from '../../pay-groups/application/pay-group-store.js';
import { calculatePay } from '../../runs/domain/payroll-calculator.js';
import { StructureStore } from '../../structures/application/structure-store.js';
import { TaxDeclarationStore, type DeclarationQuery, type DeclarationRow } from './tax-declaration-store.js';

const ENTITY = 'TaxDeclarations';
type Decl = { ZAKAT: number; VPS_PENSION: number; DONATION: number; HEALTH_INSURANCE: number };
const empty = (): Decl => ({ ZAKAT: 0, VPS_PENSION: 0, DONATION: 0, HEALTH_INSURANCE: 0 });
const notActionable = (m: string) => new ConflictError(m, undefined, { code: 'TAX_DECLARATION_NOT_ACTIONABLE' });

/**
 * Tax declarations u/s 60–63: the employee declares in My Profile and uploads a proof (PDF / JPG / PNG, 5 MB);
 * payroll staff approve or reject (never their own); approved declarations reduce the withholding from their month on.
 */
@Injectable()
export class TaxDeclarationsService implements OnModuleInit {
  constructor(
    private readonly store: TaxDeclarationStore,
    private readonly attachments: AttachmentsService,
    private readonly structures: StructureStore,
    private readonly components: ComponentStore,
    private readonly slabs: TaxSlabStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    // proofs: payroll staff, or the employee the declaration belongs to
    this.attachments.registerAccess(ENTITY, async (user, file) => {
      const d = await this.store.byProof(user.tenantId, file.id);
      if (!d) return false;
      if (user.permissions.includes('prun:view')) return true;
      const me = await this.store.employeeOf(user.tenantId, user.id);
      return !!me && d.employee.id === me.id;
    });
  }

  list(user: SessionUser, q: DeclarationQuery) {
    return this.store.list(user.tenantId, q);
  }

  private async me(user: SessionUser) {
    const e = await this.store.employeeOf(user.tenantId, user.id);
    if (!e) throw new ConflictError('Your user is not linked to an employee record.', undefined, { code: 'NO_EMPLOYEE_RECORD' });
    return e.id;
  }

  /** The current tax year's projection: monthly taxable salary × months left + taxable so far, less declarations. */
  async projection(user: SessionUser, employeeId: string, rows: DeclarationRow[]): Promise<TaxProjection | null> {
    const ty = payrollTaxYearOf(new Date().toISOString().slice(0, 10));
    const [facts, structures, comps, years] = await Promise.all([
      this.store.projectionFacts(user.tenantId, employeeId, ty), this.structures.list(user.tenantId), this.components.list(user.tenantId), this.slabs.years(user.tenantId),
    ]);
    const slabs = years.find((y) => y.taxYear === ty.taxYear)?.slabs;
    if (!slabs?.length || !comps.some((c) => c.systemRole === 'INCOME_TAX')) return null;
    let monthlyTaxable = 0;
    let monthlyExempt = 0;
    if (facts.salary) {
      const s = structures.find((x) => x.id === facts.salary!.structureId);
      const a = facts.salary.addonStructureId ? structures.find((x) => x.id === facts.salary!.addonStructureId) : undefined;
      const res = calculatePay({
        basicAmount: facts.salary.basicAmount, structureLines: [...(s?.lines ?? []), ...(a?.lines ?? [])].map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText })),
        daysInMonth: 30, unpaidDays: 0, outsideDays: 0, paidLeaveDays: 0, missingPunches: 0, statutory: { eobi: true, pessi: true, pf: true }, adjustments: [], loans: [],
        tax: { slabs, monthsLeft: ty.monthsLeft, ytdGross: facts.ytdGross, ytdTaxable: facts.ytdTaxable, ytdTax: facts.ytdTax, declarations: empty() },
        prevNet: null, payMode: 'CASH', hasIban: true, onNotice: false, exitInPeriod: false, isNewJoiner: false,
      }, comps.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null })));
      for (const c of res.components) if (c.componentType === 'EARNING') { monthlyTaxable += c.amount - c.exemptAmount; monthlyExempt += c.exemptAmount; }
    }
    const projected = facts.ytdTaxable + monthlyTaxable * ty.monthsLeft;
    const sum = (pred: (d: DeclarationRow) => boolean) => rows.filter(pred).reduce((acc, d) => { acc[d.declarationType as keyof Decl] += d.amount; return acc; }, empty());
    const approved = sum((d) => d.status === 'APPROVED');
    const declared = sum((d) => ['APPROVED', 'IN_REVIEW', 'PENDING'].includes(d.status));
    const withApproved = payrollAnnualTax(projected, slabs, approved);
    const withDeclared = payrollAnnualTax(projected, slabs, declared);
    const months = Math.max(1, ty.monthsLeft);
    return {
      taxYear: ty.taxYear, monthsLeft: ty.monthsLeft, monthlyTaxable, ytdTaxable: facts.ytdTaxable, ytdTax: facts.ytdTax, projectedTaxable: projected, exemptAnnual: monthlyExempt * months,
      slabs: slabs.map((x) => ({ incomeFrom: x.incomeFrom, incomeTo: x.incomeTo, fixedTax: x.fixedTax, ratePercent: x.ratePercent })),
      withoutDeclarations: payrollAnnualTax(projected, slabs, empty()), withApproved, withDeclared,
      monthlyTax: Math.max(0, Math.round((withApproved.liability - facts.ytdTax) / months)),
      monthlyTaxIfApproved: Math.max(0, Math.round((withDeclared.liability - facts.ytdTax) / months)), hasSalary: !!facts.salary,
    };
  }

  async myView(user: SessionUser): Promise<MyTaxView> {
    const employeeId = await this.me(user);
    const ty = payrollTaxYearOf(new Date().toISOString().slice(0, 10));
    const rows = await this.store.forEmployee(user.tenantId, employeeId, ty.taxYear);
    const projection = await this.projection(user, employeeId, rows);
    const strip = (d: DeclarationRow) => { const { createdBy, ...rest } = d; void createdBy; return rest; };
    const employee = await this.store.employeeRef(user.tenantId, employeeId);
    return { projection, declarations: rows.map(strip), employee: employee ?? { id: employeeId, code: '', name: user.name, department: null, designation: null, branch: null } };
  }

  /** Declare (or change) one type for the current tax year. Approved declarations can't change. */
  async myDeclare(user: SessionUser, meta: RequestMeta, input: TaxDeclarationInput) {
    const employeeId = await this.me(user);
    const taxYear = input.taxYear ?? payrollTaxYearOf(new Date().toISOString().slice(0, 10)).taxYear;
    const rows = await this.store.forEmployee(user.tenantId, employeeId, taxYear);
    const existing = rows.find((d) => d.declarationType === input.declarationType);
    if (existing?.status === 'APPROVED') throw notActionable('This declaration is already approved. Ask payroll to change it.');
    const t = DECLARATION_TYPES[input.declarationType];
    const others = rows.filter((d) => d.id !== existing?.id && d.status === 'APPROVED');
    const proj = await this.projection(user, employeeId, others);
    const saving = proj ? Math.max(0, proj.withApproved.liability - payrollAnnualTax(proj.projectedTaxable, proj.slabs, { ...others.reduce((a, d) => ({ ...a, [d.declarationType]: (a[d.declarationType as keyof Decl] ?? 0) + d.amount }), empty()), [input.declarationType]: input.amount }).liability) : null;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({
        ...(existing ? { id: existing.id, rowVersion: existing.rowVersion } : { employeeId, taxYear, declarationType: input.declarationType, itoSection: t.section, reliefKind: t.reliefKind }),
        amount: input.amount, paidTo: input.paidTo, estimatedTaxSaving: saving,
      });
      await this.store.call('submit', newId);
      return newId;
    });
    return (await this.store.get(user.tenantId, id))!;
  }

  async myProof(user: SessionUser, meta: RequestMeta, id: string, file: UploadedFileData) {
    const employeeId = await this.me(user);
    const d = await this.store.get(user.tenantId, id);
    if (!d) throw new NotFoundError('Declaration not found');
    if (d.employee.id !== employeeId) throw new ForbiddenError('You can only change your own declarations.', undefined, { code: 'PAYSLIP_NOT_YOURS' });
    if (d.status === 'APPROVED') throw notActionable('This declaration is already approved.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const a = await this.attachments.save(user, file, { purpose: 'DOCUMENT' }, { types: [...PROOF_TYPES], maxBytes: PROOF_MAX_BYTES });
      await this.store.save({ id, rowVersion: d.rowVersion, proofAttachmentId: a.id });
      await this.store.call('submit', id);
    });
    return (await this.store.get(user.tenantId, id))!;
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string) {
    const d = await this.store.get(user.tenantId, id);
    if (!d) throw new NotFoundError('Declaration not found');
    if (d.createdBy === user.id) throw new ForbiddenError('You made this declaration, so someone else must approve it.', undefined, { code: 'PAYROLL_PREPARER_APPROVAL' });
    if (!d.proof) throw new ConflictError('Upload the proof before this declaration is approved.', { proof: ['Required'] }, { code: 'TAX_PROOF_REQUIRED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.call('approve', id, null));
    return (await this.store.get(user.tenantId, id))!;
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const d = await this.store.get(user.tenantId, id);
    if (!d) throw new NotFoundError('Declaration not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.call('reject', id, reason));
    return (await this.store.get(user.tenantId, id))!;
  }
}
