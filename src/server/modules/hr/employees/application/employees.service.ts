import { Injectable } from '@nestjs/common';
import {
  employeeErrors, wouldCycle,
  type EmployeeBankInput, type DocumentInput, type Employee, type EmployeeCreate, type EmployeeListQuery, type EmployeeUpdate, type PositionChange, type SessionUser, type StatutoryInput,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { EmployeeStore, type PositionRow } from './employee-store.js';

const POSITION_KEYS = ['departmentId', 'designationId', 'gradeId', 'reportingManagerId', 'branchId', 'employmentType'] as const;
const invalid = (e: Record<string, string>) => {
  if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
};
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const exited = () => new ConflictError('This employee has exited. Rejoin them first.', undefined, { code: 'EMPLOYEE_EXITED' });

/**
 * The employee master. Position (department, designation, grade, branch, manager, employment type) is set on joining and
 * then changed only through a position change, so every change is a row in EmployeePositionHistory; so are joining,
 * confirmation, status changes, exit and rejoining. Codes come from the company's EMP numbering series.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly store: EmployeeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  page(user: SessionUser, q: EmployeeListQuery) {
    return this.store.page(user.tenantId, q);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<Employee> {
    const e = await this.store.get(user.tenantId, id);
    if (!e) throw new NotFoundError('Employee not found');
    return e;
  }

  async create(user: SessionUser, meta: RequestMeta, input: EmployeeCreate): Promise<Employee> {
    await this.checkUnique(user, input.cnic, input.biometricId);
    const opts = await this.store.options(user.tenantId);
    this.checkPosition(opts, input);
    const { statutory, bankAccount, documents, ...fields } = input;
    const probation = input.probationMonths > 0 || input.employmentType === 'PROBATION';
    const status = probation ? 'PROBATION' : 'ACTIVE';
    const data = {
      ...fields,
      shiftId: fields.shiftId ?? opts.shifts.find((s) => s.isDefault)?.id ?? null,
      confirmationDueOn: fields.confirmationDueOn ?? (probation && input.probationMonths > 0 ? addMonths(input.joiningDate, input.probationMonths) : null),
      status,
      statutoryDetails: [statutory],
      bankAccounts: bankAccount ? [{ ...bankAccount, effectiveFrom: bankAccount.effectiveFrom ?? input.joiningDate }] : [],
      documents,
    };
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save(data);
      await this.store.addHistory(user.tenantId, {
        employeeId: newId, effectiveDate: input.joiningDate, eventType: 'JOINED', reason: null, toDepartmentId: input.departmentId, toDesignationId: input.designationId,
        toGradeId: input.gradeId, toBranchId: input.branchId, toManagerId: input.reportingManagerId, toEmploymentType: input.employmentType, toStatus: status,
      });
      return newId;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: EmployeeUpdate): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    const current = { departmentId: e.department.id, designationId: e.designation.id, gradeId: e.grade?.id ?? null, reportingManagerId: e.manager?.id ?? null, branchId: e.branch.id, employmentType: e.employmentType };
    if (POSITION_KEYS.some((k) => input[k] !== undefined && (input[k] || null) !== current[k])) {
      throw new ValidationError('Department, designation, grade, branch, manager and type change through Transfer or Promote, so the change is kept in position history.', undefined, { code: 'EMPLOYEE_USE_POSITION_CHANGE' });
    }
    const fields = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && !(POSITION_KEYS as readonly string[]).includes(k)));
    await this.checkUnique(user, input.cnic && input.cnic !== e.cnic ? input.cnic : undefined, input.biometricId && input.biometricId !== e.biometricId ? input.biometricId : undefined, id);
    invalid(employeeErrors({ ...e, ...fields }));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...fields, id }));
    return this.get(user, id);
  }

  async changePosition(user: SessionUser, meta: RequestMeta, id: string, input: PositionChange): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    if (e.status === 'EXITED') throw exited();
    const from = { departmentId: e.department.id, designationId: e.designation.id, gradeId: e.grade?.id ?? null, branchId: e.branch.id, reportingManagerId: e.manager?.id ?? null, employmentType: e.employmentType };
    const to = { ...from, ...Object.fromEntries(POSITION_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k] || null])) } as typeof from;
    const changed = POSITION_KEYS.filter((k) => to[k] !== from[k]);
    if (!changed.length) throw new ValidationError('Nothing changes: pick the new department, designation, grade, branch, manager or type.', { eventType: ['No change'] });
    if (!to.departmentId || !to.designationId || !to.branchId || !to.employmentType) throw new ValidationError('Department, designation, branch and type are required', { departmentId: ['Required'] });
    this.checkPosition(await this.store.options(user.tenantId), to);
    if (to.reportingManagerId && (to.reportingManagerId === id || wouldCycle(await this.store.managers(user.tenantId), id, to.reportingManagerId))) {
      throw new ValidationError('An employee can’t report, directly or indirectly, to themselves.', { reportingManagerId: ['Reporting loop'] }, { code: 'EMPLOYEE_MANAGER_CYCLE' });
    }
    const row: PositionRow = {
      employeeId: id, effectiveDate: input.effectiveDate, eventType: input.eventType, reason: input.reason,
      ...(to.departmentId !== from.departmentId && { fromDepartmentId: from.departmentId, toDepartmentId: to.departmentId }),
      ...(to.designationId !== from.designationId && { fromDesignationId: from.designationId, toDesignationId: to.designationId }),
      ...(to.gradeId !== from.gradeId && { fromGradeId: from.gradeId, toGradeId: to.gradeId }),
      ...(to.branchId !== from.branchId && { fromBranchId: from.branchId, toBranchId: to.branchId }),
      ...(to.reportingManagerId !== from.reportingManagerId && { fromManagerId: from.reportingManagerId, toManagerId: to.reportingManagerId }),
      ...(to.employmentType !== from.employmentType && { fromEmploymentType: from.employmentType, toEmploymentType: to.employmentType }),
    };
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id, rowVersion: input.rowVersion, ...Object.fromEntries(changed.map((k) => [k, to[k]])) });
      await this.store.addHistory(user.tenantId, row);
    });
    return this.get(user, id);
  }

  async confirm(user: SessionUser, meta: RequestMeta, id: string, input: { confirmedOn: string; reason: string | null; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    if (e.status !== 'PROBATION') throw new ValidationError('Only an employee on probation can be confirmed', { status: ['Not on probation'] });
    if (input.confirmedOn < e.joiningDate) throw new ValidationError('Confirmation can’t be before joining', { confirmedOn: ['Before joining'] });
    return this.statusEvent(user, meta, e, 'CONFIRMED', 'ACTIVE', input.confirmedOn, input.reason, { confirmedOn: input.confirmedOn });
  }

  async setStatus(user: SessionUser, meta: RequestMeta, id: string, input: { status: string; effectiveDate: string; reason: string | null; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    if (e.status === 'EXITED') throw exited();
    if (e.status === input.status) throw new ValidationError('The employee already has this status', { status: ['No change'] });
    return this.statusEvent(user, meta, e, 'STATUS_CHANGE', input.status, input.effectiveDate, input.reason, {});
  }

  async exit(user: SessionUser, meta: RequestMeta, id: string, input: { exitDate: string; exitType: string; reason: string | null; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    if (e.status === 'EXITED') throw exited();
    if (input.exitDate < e.joiningDate) throw new ValidationError('The exit date can’t be before joining', { exitDate: ['Before joining'] });
    return this.statusEvent(user, meta, e, 'EXITED', 'EXITED', input.exitDate, input.reason, { exitDate: input.exitDate, exitType: input.exitType });
  }

  async rejoin(user: SessionUser, meta: RequestMeta, id: string, input: { effectiveDate: string; reason: string | null; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    if (e.status !== 'EXITED') throw new ValidationError('Only an exited employee can rejoin', { status: ['Not exited'] });
    return this.statusEvent(user, meta, e, 'REHIRED', 'ACTIVE', input.effectiveDate, input.reason, { exitDate: null, exitType: null });
  }

  async linkUser(user: SessionUser, meta: RequestMeta, id: string, input: { userId: string | null; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    const old = e.appUser?.id ?? null;
    if (input.userId === old) return e;
    if (input.userId) {
      const free = await this.store.userFree(user.tenantId, input.userId, id);
      if (free === 'missing') throw new ValidationError('Choose an active user', { userId: ['Not an active user'] });
      if (free === 'linked') throw new ConflictError('This user is already linked to another employee.', { userId: ['Already linked'] }, { code: 'EMPLOYEE_USER_LINKED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (old) await this.store.setUserLink(user.tenantId, old, null);
      await this.store.save({ id, rowVersion: input.rowVersion, appUserId: input.userId });
      if (input.userId) await this.store.setUserLink(user.tenantId, input.userId, id);
    });
    return this.get(user, id);
  }

  /** Bank accounts as a set (rows keep their ids). The primary account is written last so "one primary" holds throughout. */
  async setBankAccounts(user: SessionUser, meta: RequestMeta, id: string, input: { accounts: EmployeeBankInput[]; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    const known = new Set(e.bankAccounts.map((b) => b.id));
    if (input.accounts.some((a) => a.id && !known.has(a.id))) throw new ValidationError('Unknown bank account', { accounts: ['Reload and try again'] });
    const ordered = [...input.accounts].sort((a, b) => Number(a.isPrimary && a.isActive) - Number(b.isPrimary && b.isActive))
      .map((a) => ({ ...a, effectiveFrom: a.effectiveFrom ?? new Date().toISOString().slice(0, 10) }));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion: input.rowVersion, bankAccounts: ordered }));
    return this.get(user, id);
  }

  async setDocuments(user: SessionUser, meta: RequestMeta, id: string, input: { documents: DocumentInput[]; rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    const known = new Set(e.documents.map((d) => d.id));
    if (input.documents.some((d) => d.id && !known.has(d.id))) throw new ValidationError('Unknown document', { documents: ['Reload and try again'] });
    // Documents uploaded later (Phase 35) keep their status; only checklist fields change here.
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion: input.rowVersion, documents: input.documents }));
    return this.get(user, id);
  }

  async setStatutory(user: SessionUser, meta: RequestMeta, id: string, input: StatutoryInput & { rowVersion: number }): Promise<Employee> {
    const e = await this.current(user, id, input.rowVersion);
    const { rowVersion, ...fields } = input;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, statutoryDetails: [{ ...(e.statutory.id && { id: e.statutory.id }), ...fields }] }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(user.tenantId, id)) {
      throw new ConflictError('Other records use this employee (reports, a login, a branch or department head). Exit the employee instead.', undefined, { code: 'EMPLOYEE_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async statusEvent(user: SessionUser, meta: RequestMeta, e: Employee, eventType: string, status: string, date: string, reason: string | null, extra: Record<string, unknown>) {
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id: e.id, rowVersion: e.rowVersion, status, ...extra });
      await this.store.addHistory(user.tenantId, { employeeId: e.id, effectiveDate: date, eventType, reason, fromStatus: e.status, toStatus: status });
    });
    return this.get(user, e.id);
  }

  private checkPosition(opts: { designations: { id: string; departmentId: string }[]; departments: { id: string }[]; branches: { id: string }[]; managers: { id: string }[] }, p: { departmentId: string; designationId: string; branchId: string; reportingManagerId?: string | null }) {
    if (!opts.departments.some((d) => d.id === p.departmentId)) throw new ValidationError('Choose an active department', { departmentId: ['Not an active department'] });
    const d = opts.designations.find((x) => x.id === p.designationId);
    if (!d) throw new ValidationError('Choose an active designation', { designationId: ['Not an active designation'] });
    if (d.departmentId !== p.departmentId) throw new ValidationError('This designation belongs to another department', { designationId: ['Not in this department'] });
    if (!opts.branches.some((b) => b.id === p.branchId)) throw new ValidationError('Choose an active branch', { branchId: ['Not an active branch'] });
    if (p.reportingManagerId && !opts.managers.some((m) => m.id === p.reportingManagerId)) throw new ValidationError('Choose a current employee as manager', { reportingManagerId: ['Not a current employee'] });
  }

  private async checkUnique(user: SessionUser, cnic?: string, biometricId?: string | null, exceptId?: string) {
    const c = await this.store.clashes(user.tenantId, { cnic, biometricId }, exceptId);
    if (c.cnic) throw new ConflictError(`CNIC ${cnic} belongs to another employee.`, { cnic: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    if (c.biometricId) throw new ConflictError(`Biometric ID ${biometricId} belongs to another employee.`, { biometricId: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const e = await this.get(user, id);
    if (e.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this employee. Reload and try again.');
    return e;
  }
}
