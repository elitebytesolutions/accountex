import { Injectable } from '@nestjs/common';
import type { CompanySettings, SessionUser, SettingsSection } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ValidationError } from '../../../../core/domain/errors.js';
import { CompanySettingsStore } from './company-settings-store.js';

/** Company settings, saved one tab (section) at a time. The profile section creates the row. */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly store: CompanySettingsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(user: SessionUser): Promise<CompanySettings> {
    return (await this.store.get(user.tenantId)) ?? this.store.defaults();
  }

  async saveSection(
    user: SessionUser,
    meta: RequestMeta,
    section: SettingsSection,
    input: Record<string, unknown> & { rowVersion?: number },
  ): Promise<CompanySettings> {
    const current = await this.store.get(user.tenantId);
    const { rowVersion, ...fields } = input;
    if (!current && section !== 'profile') {
      throw new ConflictError('Save the company profile first.', undefined, { code: 'COMPANY_PROFILE_REQUIRED' });
    }
    if (current && rowVersion !== undefined && rowVersion !== current.rowVersion) {
      throw new ConcurrencyError('Someone else changed the settings. Reload and try again.');
    }
    this.requireStrnWhenGst(section, fields, current ?? this.store.defaults());
    // The first profile save inserts the row; the database then marks setup step PROFILE done.
    const data = current ? { ...fields, id: current.id, rowVersion: rowVersion ?? current.rowVersion } : fields;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(data));
    return this.get(user);
  }

  /** A GST-registered company must have an STRN (database check companyProfileStrnWhenGstChk), reported on the field being saved. */
  private requireStrnWhenGst(section: SettingsSection, fields: Record<string, unknown>, current: CompanySettings) {
    const gst = (section === 'tax' ? fields.gstRegistered : current.gstRegistered) as boolean;
    const strn = section === 'profile' ? fields.strn : current.strn;
    if (!gst || strn) return;
    throw section === 'tax'
      ? new ValidationError('Add the STRN on the Profile tab first.', { gstRegistered: ['GST registration needs an STRN on the Profile tab'] })
      : new ValidationError('STRN is required while the company is GST-registered.', { strn: ['Required while GST-registered (Tax tab)'] });
  }
}
