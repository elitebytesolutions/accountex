import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/** The route needs every listed Company.Permissions code (e.g. "coa:view") among the user's role grants. */
export const RequirePermission = (...codes: string[]) => SetMetadata(REQUIRED_PERMISSIONS_KEY, codes);
