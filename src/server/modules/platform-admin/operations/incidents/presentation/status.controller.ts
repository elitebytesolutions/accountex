import { Controller, Get } from '@nestjs/common';
import type { ActiveIncident, StatusPage } from '../../../../../../shared/index.js';
import { Public } from '../../../../../common/decorators/public.decorator.js';
import { IncidentsService } from '../application/incidents.service.js';

/**
 * /api/status (Phase 43): what tenants see. `components` is the public status page (no sign-in); `active-incidents`
 * feeds the workspace banner (Phase 42 owns the banner component) and needs any signed-in workspace session,
 * no permission.
 */
@Controller('status')
export class StatusController {
  constructor(private readonly incidents: IncidentsService) {}

  @Public()
  @Get('components')
  components(): Promise<StatusPage> {
    return this.incidents.statusPage();
  }

  /** Open public incidents: [{ id, docNo, title, impact, stage, components, startedAt }], newest first. */
  @Get('active-incidents')
  active(): Promise<ActiveIncident[]> {
    return this.incidents.activeIncidents();
  }
}
