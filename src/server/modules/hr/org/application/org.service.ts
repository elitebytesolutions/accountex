import { Injectable } from '@nestjs/common';
import type { BranchHr, BranchHrInput, OrgChart, OrgNode, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { OrgStore } from './org-store.js';

/**
 * The organisation chart: people by reporting line, the department tree, or the positions (designations) nested by their
 * reporting line inside each department. Also each branch's HR settings (manager, default shift, social security).
 */
@Injectable()
export class OrgService {
  constructor(
    private readonly store: OrgStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  branches(user: SessionUser) {
    return this.store.branches(user.tenantId);
  }

  branchHr(user: SessionUser) {
    return this.store.branchHr(user.tenantId);
  }

  async saveBranchHr(user: SessionUser, meta: RequestMeta, branchId: string, input: BranchHrInput): Promise<BranchHr> {
    const all = await this.store.branchHr(user.tenantId);
    const b = all.find((x) => x.id === branchId);
    if (!b) throw new NotFoundError('Branch not found');
    if (b.rowVersion !== null && input.rowVersion !== b.rowVersion) throw new ConcurrencyError('Someone else changed this branch. Reload and try again.');
    if (input.managerEmployeeId && !(await this.store.employees(user.tenantId)).some((e) => e.id === input.managerEmployeeId)) {
      throw new ValidationError('Choose a current employee', { managerEmployeeId: ['Not a current employee'] });
    }
    const { rowVersion, ...fields } = input;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBranchHr(b.settingId ? { ...fields, id: b.settingId, rowVersion } : { ...fields, branchId }));
    return (await this.store.branchHr(user.tenantId)).find((x) => x.id === branchId)!;
  }

  async chart(user: SessionUser, view: 'people' | 'departments' | 'positions'): Promise<OrgChart> {
    const [depts, desigs, branches, people] = await Promise.all([
      this.store.departments(user.tenantId), this.store.designations(user.tenantId), this.store.branches(user.tenantId), this.store.employees(user.tenantId),
    ]);
    const live = depts.filter((d) => d.isActive);
    const ids = new Set(live.map((d) => d.id));
    const activeDesigs = desigs.filter((d) => d.isActive && ids.has(d.departmentId));
    const filledBy = (desigId: string) => people.filter((p) => p.designationId === desigId).length;
    const positions = (deptId: string) => activeDesigs.filter((x) => x.departmentId === deptId).reduce((s, x) => s + x.approvedPositions, 0);
    const staff = (deptId: string) => people.filter((p) => p.departmentId === deptId).length;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

    let roots: OrgNode[];
    if (view === 'people') {
      const title = (id: string) => desigs.find((d) => d.id === id)?.title ?? '';
      const dept = (id: string) => depts.find((d) => d.id === id)?.name ?? '';
      const present = new Set(people.map((p) => p.id));
      const node = (p: (typeof people)[number], seen: Set<string>): OrgNode => {
        const next = new Set(seen).add(p.id);
        const kids = people.filter((c) => c.managerId === p.id && !next.has(c.id));
        return { id: p.id, kind: 'EMPLOYEE', title: p.name, subtitle: `${title(p.designationId)} · ${dept(p.departmentId)}`, badge: kids.length ? plural(kids.length, 'report') : null, positions: 0, filled: 1, children: kids.map((k) => node(k, next)) };
      };
      roots = people.filter((p) => !p.managerId || !present.has(p.managerId)).map((p) => node(p, new Set()));
    } else {
      const designationNodes = (deptId: string): OrgNode[] => {
        const mine = activeDesigs.filter((x) => x.departmentId === deptId);
        const inDept = new Set(mine.map((x) => x.id));
        const node = (x: (typeof mine)[number]): OrgNode => {
          const filled = filledBy(x.id);
          return {
            id: x.id, kind: 'DESIGNATION', title: x.title, subtitle: x.gradeCode ?? 'No grade', badge: `${filled} / ${x.approvedPositions} filled`,
            positions: x.approvedPositions, filled, children: mine.filter((c) => c.reportsToDesignationId === x.id).map(node),
          };
        };
        // Tops inside the department: no boss, or a boss in another department.
        return mine.filter((x) => !x.reportsToDesignationId || !inDept.has(x.reportsToDesignationId)).map(node);
      };
      const deptNode = (d: (typeof live)[number]): OrgNode => {
        const subs = live.filter((c) => c.parentId === d.id).map(deptNode);
        return {
          id: d.id, kind: 'DEPARTMENT', title: d.name, subtitle: `${d.code}${d.division ? ` · ${d.division.charAt(0)}${d.division.slice(1).toLowerCase()}` : ''}`,
          badge: `${plural(staff(d.id), 'person')} · ${plural(positions(d.id), 'position')}`.replace('persons', 'people'), positions: positions(d.id), filled: staff(d.id),
          children: view === 'positions' ? [...designationNodes(d.id), ...subs] : subs,
        };
      };
      roots = live.filter((d) => !d.parentId || !ids.has(d.parentId)).map(deptNode);
    }
    const depth = (n: OrgNode): number => 1 + Math.max(0, ...n.children.map(depth));
    const all: OrgNode[] = [];
    const walk = (n: OrgNode) => { all.push(n); n.children.forEach(walk); };
    roots.forEach(walk);
    const parents = all.filter((n) => n.children.length);
    return {
      view, roots, maxDepth: Math.max(0, ...roots.map(depth)),
      avgSpan: parents.length ? Math.round((parents.reduce((s, n) => s + n.children.length, 0) / parents.length) * 10) / 10 : 0,
      vacant: activeDesigs.reduce((s, x) => s + Math.max(0, x.approvedPositions - filledBy(x.id)), 0),
      branches: { count: branches.length, codes: branches.map((b) => b.code) },
    };
  }
}
