/**
 * COA template lifecycle (pure rules). DRAFT → PUBLISHED (tenants can apply it) → RETIRED (hidden from tenants, can be
 * published again). Exactly one DEFAULT: making a template the default turns the previous default into PUBLISHED.
 * A retired template is read-only; only a draft can be renamed (its code) or deleted.
 */
export type CoaStatusAction = 'publish' | 'retire' | 'default';

/** The status an action leads to, or the reason it is not allowed. */
export function nextCoaStatus(status: string, action: CoaStatusAction): { status: string } | { error: string } {
  switch (action) {
    case 'publish':
      return status === 'DRAFT' || status === 'RETIRED' ? { status: 'PUBLISHED' } : { error: 'Only a draft or retired template can be published.' };
    case 'retire':
      if (status === 'DEFAULT') return { error: 'The default template can\'t be retired. Make another template the default first.' };
      return status === 'PUBLISHED' || status === 'DRAFT' ? { status: 'RETIRED' } : { error: 'This template is already retired.' };
    case 'default':
      return status === 'DRAFT' || status === 'PUBLISHED' ? { status: 'DEFAULT' } : { error: status === 'DEFAULT' ? 'This template is already the default.' : 'Publish the template before making it the default.' };
  }
}

export const coaEditable = (status: string) => status !== 'RETIRED';
