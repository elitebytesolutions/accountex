import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Api } from './client.ts';

/** Seeder progress and the IDs of everything created, kept between runs (git-ignored). */
export type State = {
  tenantId?: string;
  /** Names of finished steps; a finished step is skipped on the next run. */
  done: string[];
  /** IDs per area, written by the master steps and read by the transaction steps (shape documented in each module). */
  ids: Record<string, any>;
};

export type Ctx = {
  /** Super Admin session. */
  sa: Api;
  /** The company's default user (every role). Creates and posts almost everything. */
  admin: Api;
  /** Second user (Finance + HR manager) for steps that refuse self-approval (payroll, vouchers, leave). */
  approver: Api;
  tenantId: string;
  state: State;
  save(): void;
  log(msg: string): void;
};

export type Step = {
  /** Unique, stable name (recorded in State.done). */
  name: string;
  run(ctx: Ctx): Promise<void>;
};

export const STATE_FILE = 'scripts/seed-showcase/.state.json';

export function loadState(): State {
  const s: State = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { done: [], ids: {} };
  seen.set(s, Object.fromEntries(Object.entries(s.ids).map(([k, v]) => [k, JSON.stringify(v)])));
  return s;
}

/** ids as last read from / written to disk by this process (JSON per key), to tell which keys this process changed. */
const seen = new WeakMap<State, Record<string, string>>();

/**
 * Merges with what is on disk, so several seeder processes (one per area) can run side by side: only the ids keys this
 * process changed since it last loaded / saved are written; every other key keeps the (possibly newer) disk value.
 */
export function saveState(s: State): void {
  const disk = loadState();
  const before = seen.get(s) ?? {};
  const ids = { ...disk.ids };
  for (const [k, v] of Object.entries(s.ids)) if (!(k in disk.ids) || JSON.stringify(v) !== before[k]) ids[k] = v;
  const merged: State = { tenantId: s.tenantId ?? disk.tenantId, done: [...new Set([...disk.done, ...s.done])], ids };
  writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
  s.done = merged.done;
  s.ids = merged.ids;
  seen.set(s, Object.fromEntries(Object.entries(merged.ids).map(([k, v]) => [k, JSON.stringify(v)])));
}

/** Runs `fn` over items with limited concurrency (keeps the API busy without flooding it). */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Tries a non-essential call; logs and continues on failure so one broken endpoint doesn't stop the run. */
export async function soft<T>(ctx: Ctx, what: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) { ctx.log(`  ! skipped ${what}: ${(e as Error).message.slice(0, 300)}`); return null; }
}
