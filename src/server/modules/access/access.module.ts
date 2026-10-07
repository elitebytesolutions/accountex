import { Module } from '@nestjs/common';
import { ApprovalsService } from './approval-workflows/application/approvals.service.js';
import { WorkflowStore } from './approval-workflows/application/workflow-store.js';
import { PrismaWorkflowStore } from './approval-workflows/infrastructure/prisma-workflow.store.js';
import { ApprovalsController } from './approval-workflows/presentation/approvals.controller.js';
import { RoleStore } from './roles/application/role-store.js';
import { RolesService } from './roles/application/roles.service.js';
import { PrismaRoleStore } from './roles/infrastructure/prisma-role.store.js';
import { RolesController } from './roles/presentation/roles.controller.js';
import { SodRuleStore } from './sod-rules/application/sod-rule-store.js';
import { SodRulesService } from './sod-rules/application/sod-rules.service.js';
import { PrismaSodRuleStore } from './sod-rules/infrastructure/prisma-sod-rule.store.js';
import { SodRulesController } from './sod-rules/presentation/sod-rules.controller.js';
import { UserAdminStore } from './users/application/user-admin-store.js';
import { UsersService } from './users/application/users.service.js';
import { PrismaUserAdminStore } from './users/infrastructure/prisma-user-admin.store.js';
import { UsersController } from './users/presentation/users.controller.js';

/** Access administration: users, roles & permissions, approval workflows (Phase 2); segregation-of-duties rules (Phase 5). */
@Module({
  controllers: [UsersController, RolesController, ApprovalsController, SodRulesController],
  providers: [
    UsersService,
    RolesService,
    ApprovalsService,
    SodRulesService,
    { provide: SodRuleStore, useClass: PrismaSodRuleStore },
    { provide: UserAdminStore, useClass: PrismaUserAdminStore },
    { provide: RoleStore, useClass: PrismaRoleStore },
    { provide: WorkflowStore, useClass: PrismaWorkflowStore },
  ],
})
export class AccessModule {}
