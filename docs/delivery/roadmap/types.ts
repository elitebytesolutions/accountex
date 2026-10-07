/**
 * Roadmap data types. Template routes: "app/settings#set-branches" means the `set-branches` tab inside
 * `app/settings`. Standard CRUD endpoints and page states are implied for every entity (STANDARDS in render.ts);
 * `x` lists only the extra, entity-specific actions.
 */

export type EntityKind = "MASTER" | "TRANSACTIONAL";

export type Entity = {
  key: string;
  name: string;
  tables: string[];
  /** Template routes (with optional #tab). Empty = no template exists. */
  tpl: string[];
  /** API resource path under /api. */
  api: string;
  /** Permission resources (Company.Permissions `resource:action`). */
  perm: string[];
  x?: string[];
  rules?: string[];
  deps?: string[];
  open?: string[];
};

export type Phase = {
  no: number;
  title: string;
  portal: "workspace" | "admin" | "foundation";
  kind: EntityKind | "FOUNDATION";
  objective: string;
  entities: Entity[];
  /** Read-only reports/dashboards delivered with this phase. */
  reports?: string[];
  /** Progress; omitted = "planned". Set to "done" when the user accepts the phase. */
  status?: "planned" | "in-progress" | "done";
};

export const E = (
  key: string,
  name: string,
  tables: string[],
  o: Omit<Entity, "key" | "name" | "tables">,
): Entity => ({ key, name, tables, ...o });

/** Rules shared by every posting document. */
export const POST_RULES = [
  "Draft → submitted → approved → posted; posted documents are immutable",
  "Corrections only by reversal (reverse/void), never edit or delete",
  "Posting is one transaction: document + GL/stock effects + audit",
];
