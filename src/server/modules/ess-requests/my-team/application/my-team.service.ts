import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { MyTeam } from '../../../../../shared/self-service/my-team.js';
import { MyTeamStore } from './my-team-store.js';

const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** My Team (template app/profile/team): who is in today and the month's leave / training of my direct reports. */
@Injectable()
export class MyTeamService {
  constructor(private readonly store: MyTeamStore) {}

  async overview(user: SessionUser, month?: string): Promise<MyTeam> {
    const today = await this.store.today(user.tenantId);
    const m = month ?? today.slice(0, 7);
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!me) return { me: null, today, month: m, members: [], calendar: { people: [], entries: [] } };
    const [members, people] = await Promise.all([this.store.members(user.tenantId, me.id), this.store.people(user.tenantId, me.id)]);
    const entries = await this.store.calendar(user.tenantId, people.map((p) => p.employeeId), `${m}-01`, monthEnd(m));
    return { me, today, month: m, members, calendar: { people, entries } };
  }
}
