import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../guards/admin-jwt.guard.js';

export const IS_ADMIN_ROUTE_KEY = 'isAdminRoute';

/**
 * Marks a Super Admin controller: the tenant JwtAuthGuard steps aside and AdminJwtGuard
 * requires the admin cookie instead. @Public() still skips authentication.
 */
export const AdminRoute = () => applyDecorators(SetMetadata(IS_ADMIN_ROUTE_KEY, true), UseGuards(AdminJwtGuard));
