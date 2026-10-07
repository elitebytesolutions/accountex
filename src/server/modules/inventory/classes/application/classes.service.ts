import { Injectable } from '@nestjs/common';
import type {
  ProductClass,
  ProductClassCreate,
  ProductClassUpdate,
  ProductSubclassCreate,
  ProductSubclassUpdate,
  SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ClassStore } from './class-store.js';

/** The next free code like MC-001 / ST-001 (codes ever used, deleted ones included, are skipped). */
function nextCode(prefix: string, used: string[]): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

/** Product classes and their sub types. IDs are generated; sub type names are unique within their class. */
@Injectable()
export class ClassesService {
  constructor(
    private readonly store: ClassStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: ProductClassCreate): Promise<ProductClass> {
    const [codes, classes] = await Promise.all([this.store.allCodes(user.tenantId), this.store.list(user.tenantId)]);
    const sortOrder = Math.max(0, ...classes.map((c) => c.sortOrder)) + 10;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveClass({ ...input, code: nextCode('MC', codes.classes), sortOrder }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ProductClassUpdate): Promise<ProductClass> {
    await this.current(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveClass({ ...input, id }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.classInUse(id)) {
      throw new ConflictError('This class still has sub types or products. Hide it instead.', undefined, { code: 'PRODUCT_CLASS_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteClass(user.tenantId, id, rowVersion));
  }

  async addSubclass(user: SessionUser, meta: RequestMeta, classId: string, input: ProductSubclassCreate): Promise<ProductClass> {
    const c = await this.get(user, classId);
    this.checkName(c, input.name);
    const codes = await this.store.allCodes(user.tenantId);
    const sortOrder = Math.max(0, ...c.subclasses.map((s) => s.sortOrder)) + 10;
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.saveSubclass({ ...input, productClassId: classId, code: nextCode('ST', codes.subclasses), sortOrder }),
    );
    return this.get(user, classId);
  }

  async updateSubclass(user: SessionUser, meta: RequestMeta, id: string, input: ProductSubclassUpdate): Promise<ProductClass> {
    const { c } = await this.currentSub(user, id, input.rowVersion);
    if (input.name !== undefined) this.checkName(c, input.name, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSubclass({ ...input, id }));
    return this.get(user, c.id);
  }

  async deleteSubclass(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.currentSub(user, id, rowVersion);
    if (await this.store.subclassInUse(id)) throw new ConflictError('Products use this sub type. Hide it instead.', undefined, { code: 'PRODUCT_CLASS_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteSubclass(user.tenantId, id, rowVersion));
  }

  /** Drag-to-reorder: sortOrder 10, 20, … in the given order; sub types left out keep their place after them. */
  async reorderSubclasses(user: SessionUser, meta: RequestMeta, classId: string, ids: string[]): Promise<ProductClass> {
    const c = await this.get(user, classId);
    if (ids.some((id) => !c.subclasses.some((s) => s.id === id))) throw new ValidationError('Unknown sub type in the order', { ids: ['Reload and try again'] });
    const order = [...ids, ...c.subclasses.map((s) => s.id).filter((id) => !ids.includes(id))];
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const [i, id] of order.entries()) {
        const s = c.subclasses.find((x) => x.id === id)!;
        if (s.sortOrder !== (i + 1) * 10) await this.store.saveSubclass({ id, sortOrder: (i + 1) * 10 });
      }
    });
    return this.get(user, classId);
  }

  private checkName(c: ProductClass, name: string, exceptId?: string) {
    if (c.subclasses.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.trim().toLowerCase())) {
      throw new ConflictError(`${c.name} already has a sub type called ${name}.`, { name: ['Already used in this class'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const c = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Product class not found');
    return c;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this class. Reload and try again.');
    return c;
  }

  private async currentSub(user: SessionUser, id: string, rowVersion: number) {
    const c = (await this.store.list(user.tenantId)).find((x) => x.subclasses.some((s) => s.id === id));
    const s = c?.subclasses.find((x) => x.id === id);
    if (!c || !s) throw new NotFoundError('Sub type not found');
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this sub type. Reload and try again.');
    return { c, s };
  }
}
