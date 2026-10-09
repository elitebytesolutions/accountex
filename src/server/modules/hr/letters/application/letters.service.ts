import { Injectable, type OnModuleInit } from '@nestjs/common';
import { amountInWords, EMPLOYEE_LETTER_KIND, type EmployeeLetterCreate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { PdfRenderer } from '../../../../core/application/ports/pdf-renderer.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { AttachmentsService } from '../../../attachments/application/attachments.service.js';
import { letterDate, letterMoney, mergeLetter } from '../domain/letter-merge.js';
import { EmployeeLetterStore, type EmployeeLetterFacts } from './letter-store.js';

/** What issueLetter returns: the letter, its number, verification code and the PDF attachment. */
export type EmployeeLetterIssued = { id: string; letterNo: string; verificationCode: string; attachmentId: string };

const ENTITY = 'LTR';
const MAX_BYTES = 5 * 1024 * 1024;
const TITLES: Record<string, string> = {
  SALARY_CERTIFICATE: 'Salary certificate', EXPERIENCE: 'Experience letter', EMPLOYMENT_VERIFICATION: 'Employment verification', NOC_TRAVEL: 'No objection certificate',
  INCREMENT: 'Increment letter', PROMOTION: 'Promotion letter', CONFIRMATION: 'Confirmation letter', APPOINTMENT: 'Appointment letter', OFFER: 'Offer letter',
  RELIEVING: 'Relieving letter', WARNING: 'Warning letter',
};

/**
 * Employee letters (Phase 33): generated in English from the company's HR letter templates, rendered to PDF on the
 * server (PdfRenderer), stored as an attachment of the LTR document and issued in one transaction; void keeps the
 * record. Each letter carries a verification code a third party can check without signing in.
 */
@Injectable()
export class EmployeeLettersService implements OnModuleInit {
  constructor(
    private readonly store: EmployeeLetterStore,
    private readonly pdf: PdfRenderer,
    private readonly attachments: AttachmentsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    // letter PDFs: HR staff, or the employee the letter is for
    this.attachments.registerAccess(ENTITY, async (user, file) => {
      if (file.entityType !== ENTITY) return false;
      const l = await this.store.byAttachment(user.tenantId, file.id);
      if (!l) return false;
      if (user.permissions.includes('emp:view')) return true;
      return (await this.store.employeeOfUser(user.tenantId, user.id)) === l.employeeId;
    });
  }

  async list(user: SessionUser, employeeId: string) {
    if (!(await this.store.employeeExists(user.tenantId, employeeId))) throw new NotFoundError('Employee not found');
    return this.store.list(user.tenantId, employeeId);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  /** HR generates a letter from the employee view: issued in its own transaction, returned as a list item. */
  async generate(user: SessionUser, meta: RequestMeta, employeeId: string, input: EmployeeLetterCreate) {
    const r = await this.issueLetter(user, meta, employeeId, input);
    return this.one(user, r.id);
  }

  /**
   * For other modules (e.g. self-service letter requests): generates and issues an English letter for an employee in
   * its own unit of work — draft (numbered, with its verification code) → PDF → attachment (LTR) → ISSUED.
   * 404 unknown employee, 409 EMPLOYEE_LETTER_NO_TEMPLATE without an active template.
   */
  async issueLetter(user: SessionUser, meta: RequestMeta, employeeId: string, input: EmployeeLetterCreate): Promise<EmployeeLetterIssued> {
    const f = await this.prepare(user, employeeId, input);
    return this.unitOfWork.run(actorContext(user, meta), () => this.write(user, employeeId, input, f));
  }

  /** As issueLetter, but inside the caller's unit of work (call within `unitOfWork.run`), so the caller's own writes commit with it. */
  async issueLetterInTransaction(user: SessionUser, employeeId: string, input: EmployeeLetterCreate): Promise<EmployeeLetterIssued> {
    return this.write(user, employeeId, input, await this.prepare(user, employeeId, input));
  }

  private async prepare(user: SessionUser, employeeId: string, input: EmployeeLetterCreate) {
    if (!(await this.store.employeeExists(user.tenantId, employeeId))) throw new NotFoundError('Employee not found');
    const f = await this.store.facts(user.tenantId, employeeId, {
      docTemplateId: input.docTemplateId, letterKind: EMPLOYEE_LETTER_KIND[input.letterType] ?? 'OTHER', signatoryEmployeeId: input.signatoryEmployeeId, asOf: input.letterDate,
    });
    if (!f.template?.bodyHtml) throw new ConflictError('There is no active HR letter template for this letter. Add one under Settings › Document templates.', undefined, { code: 'EMPLOYEE_LETTER_NO_TEMPLATE' });
    return f;
  }

  private async write(user: SessionUser, employeeId: string, input: EmployeeLetterCreate, f: EmployeeLetterFacts): Promise<EmployeeLetterIssued> {
    const d = await this.store.createDraft({ employeeId, letterType: input.letterType, docTemplateId: f.template!.id, addressedTo: input.addressedTo, letterDate: input.letterDate,
      signatoryEmployeeId: input.signatoryEmployeeId, includeSalary: input.includeSalary, remarks: input.remarks });
    const buffer = await this.render(f, input, d.letterNo, d.verificationCode);
    const a = await this.attachments.save(user, { originalName: `${d.letterNo.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`, mimeType: 'application/pdf', size: buffer.length, buffer },
      { entityType: ENTITY, entityId: d.id, purpose: 'DOCUMENT' }, { types: ['application/pdf'], maxBytes: MAX_BYTES });
    await this.store.issue(d.id, a.id);
    return { id: d.id, letterNo: d.letterNo, verificationCode: d.verificationCode, attachmentId: a.id };
  }

  async void(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const l = await this.one(user, id);
    if (l.status === 'VOID') throw new ConflictError('This letter is already void.', undefined, { code: 'EMPLOYEE_LETTER_NOT_ACTIONABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.void(id, reason));
    return this.one(user, id);
  }

  async verify(code: string) {
    const v = await this.store.verify(code);
    if (!v) throw new NotFoundError('No letter has this verification code');
    return v;
  }

  private async one(user: SessionUser, id: string) {
    const l = await this.store.get(user.tenantId, id);
    if (!l) throw new NotFoundError('Letter not found');
    return l;
  }

  private render(f: EmployeeLetterFacts, input: EmployeeLetterCreate, letterNo: string, code: string) {
    const salaryWanted = input.includeSalary || input.letterType === 'SALARY_CERTIFICATE';
    const statement = f.salary && salaryWanted
      ? `${input.letterType === 'OFFER' ? 'Your' : input.letterType === 'APPOINTMENT' ? 'Your' : 'The'} gross monthly salary ${input.letterType === 'OFFER' || input.letterType === 'APPOINTMENT' ? 'will be' : 'is'} ${letterMoney(f.salary.gross)} (${amountInWords(f.salary.gross)})${input.includeSalary ? ', made up as follows:' : '.'}`
      : null;
    const data: Record<string, string | null> = {
      'letter.date': letterDate(input.letterDate), 'letter.number': letterNo, 'letter.addressedTo': input.addressedTo,
      'company.name': f.company.name, 'company.address': f.company.address,
      'employee.name': f.employee.name, 'employee.code': f.employee.code, 'employee.cnic': f.employee.cnic, 'employee.designation': f.employee.designation,
      'employee.department': f.employee.department, 'employee.joiningDate': letterDate(f.employee.joiningDate), 'employee.exitDate': letterDate(f.employee.exitDate),
      'employee.noticeDays': String(f.employee.noticeDays),
      'salary.gross': f.salary ? letterMoney(f.salary.gross) : null, 'salary.basic': f.salary ? letterMoney(f.salary.basic) : null, 'salary.statement': statement,
      'signatory.name': f.signatory?.name ?? null, 'signatory.designation': f.signatory?.designation ?? null,
    };
    const paragraphs = mergeLetter(f.template!.bodyHtml, data);
    const at = paragraphs.findIndex((p) => p.field === 'salary.statement');
    const table = input.includeSalary && f.salary && at >= 0
      ? { afterParagraph: at, rows: [['Basic salary', letterMoney(f.salary.basic)], ['Allowances', letterMoney(Math.max(0, f.salary.gross - f.salary.basic))]] as [string, string][], totalRow: ['Gross monthly salary', letterMoney(f.salary.gross)] as [string, string] }
      : null;
    return this.pdf.letter({
      title: `${TITLES[input.letterType] ?? 'Letter'} — ${f.employee.name}`,
      letterhead: { company: f.company.name, lines: [f.company.address ?? '', [f.company.phone, f.company.email].filter(Boolean).join(' · '), f.company.ntn ? `NTN ${f.company.ntn}` : ''], accent: f.company.accent },
      reference: [`Ref: ${letterNo}`],
      paragraphs: paragraphs.map((p) => ({ text: p.text, bold: p.bold })),
      table,
      signature: { closing: 'Yours sincerely,', name: f.signatory?.name ?? null, designation: f.signatory?.designation ?? null, company: `For ${f.company.name}` },
      footer: [`Verification code ${code} · ${letterNo}`, `Verify this letter online: /api/letters/verify/${code} on the company's Accountex site, or with ${f.company.name} HR.`],
    });
  }
}
