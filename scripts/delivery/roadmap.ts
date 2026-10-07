/**
 * Validates docs/delivery/roadmap against the live database and the HTML template, then renders
 * docs/delivery/ROADMAP.md. Read-only against the database. Usage: npm run delivery:roadmap   (exit code 1 when a check fails)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/server/generated/prisma/client.js";
import { FOUNDATION_TASKS, NOT_ENTITIES, phases, type Entity, type Phase } from "../../docs/delivery/roadmap/index.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const SCHEMAS = ["Accounting", "BankCash", "Company", "Distribution", "EmployeeSelfService", "FixedAssets", "HumanResources", "Inventory", "Payroll", "Platform", "Purchases", "Reports", "Sales", "Tax"];
const TEMPLATE_SRC = "template/src";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// ---------------------------------------------------------------------------
// Facts from the database and the template
// ---------------------------------------------------------------------------
const dbTables = new Set(
  (await prisma.$queryRawUnsafe<{ t: string }[]>(
    `select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r','p') and not c.relispartition and n.nspname = any($1)`, SCHEMAS,
  )).map((r) => r.t),
);
const permRows = await prisma.$queryRawUnsafe<{ resource: string; actions: string }[]>(
  `select resource, string_agg(lower(action), ',' order by "sortOrder") as actions from "Company"."Permissions" group by resource`,
);
const permActions = new Map(permRows.map((r) => [r.resource, r.actions.split(",")]));
const auditedTables = new Set(
  (await prisma.$queryRawUnsafe<{ t: string }[]>(
    `select distinct n.nspname || '.' || c.relname as t from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
     join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where p.proname = 'triggerAudit' and not tg.tgisinternal`,
  )).map((r) => r.t),
);
await prisma.$disconnect();

/** route -> template file, and file -> its data-tab ids */
const routeFile = new Map<string, string>();
const fileTabs = new Map<string, Set<string>>();
for (const f of readdirSync(TEMPLATE_SRC).filter((x) => x.endsWith(".html"))) {
  const html = readFileSync(join(TEMPLATE_SRC, f), "utf8");
  for (const m of html.matchAll(/data-route="([^"$'{}]+)"/g)) routeFile.set(m[1]!, f);
  fileTabs.set(f, new Set([...html.matchAll(/data-tab="([^"$'{}]+)"/g)].map((m) => m[1]!)));
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
const owner = new Map<string, string>();
const phaseOf = new Map<string, number>();
for (const p of phases) for (const e of p.entities) {
  if (phaseOf.has(e.key)) fail(`Duplicate entity key "${e.key}"`);
  phaseOf.set(e.key, p.no);
}

let lastKindRank = 0;
const kindRank = { FOUNDATION: 0, MASTER: 1, TRANSACTIONAL: 2 } as const;
for (const p of phases) {
  if (p.kind !== "FOUNDATION" && (p.entities.length < 3 || p.entities.length > 5)) fail(`Phase ${p.no} has ${p.entities.length} entities (must be 3-5)`);
  if (p.portal === "workspace" && kindRank[p.kind] < lastKindRank) fail(`Phase ${p.no}: workspace masters must come before transactions`);
  if (p.portal === "workspace") lastKindRank = kindRank[p.kind];
  for (const e of p.entities) {
    for (const t of e.tables) {
      if (!dbTables.has(t)) fail(`${e.key}: table ${t} does not exist`);
      if (owner.has(t)) fail(`${t} is in both ${owner.get(t)} and ${e.key}`);
      owner.set(t, e.key);
      if (NOT_ENTITIES[t]) fail(`${t} is both an entity table and in NOT_ENTITIES`);
    }
    for (const r of e.tpl) {
      const [route, tab] = r.split("#");
      const file = routeFile.get(route!);
      if (!file) fail(`${e.key}: template route ${route} not found in ${TEMPLATE_SRC}`);
      else if (tab && !fileTabs.get(file)?.has(tab)) fail(`${e.key}: tab ${tab} not found in ${file}`);
    }
    if (e.tpl.length === 0 && !(e.open ?? []).some((o) => /template/i.test(o))) fail(`${e.key}: no template and no open question about it`);
    for (const r of e.perm) if (!permActions.has(r)) fail(`${e.key}: permission resource "${r}" not in Company.Permissions`);
    for (const d of e.deps ?? []) {
      const dp = phaseOf.get(d);
      if (dp === undefined) fail(`${e.key}: unknown dependency "${d}"`);
      else if (dp > p.no) fail(`${e.key} (phase ${p.no}) depends on ${d} from later phase ${dp}`);
    }
  }
}
for (const t of dbTables) if (!owner.has(t) && !NOT_ENTITIES[t]) fail(`Table ${t} is not assigned to any entity or listed in NOT_ENTITIES`);
for (const t of Object.keys(NOT_ENTITIES)) if (!dbTables.has(t)) fail(`NOT_ENTITIES lists missing table ${t}`);

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
const nextRoute = (tplRoute: string) => {
  const [route, tab] = tplRoute.split("#");
  let r = "/" + route!.replace(/^app\//, "");
  r = r.replace(/\/view$/, "/[id]");
  if (route === "app/profile") r = "/profile";
  return tab ? `${r} › tab \`${tab}\`` : r;
};
const pageKind = (route: string) => (route.endsWith("/view") ? "detail" : route.endsWith("/new") ? "create" : route.includes("#") ? "tab" : "list/screen");
const tplLine = (r: string) => {
  const [route, tab] = r.split("#");
  return `\`${route}\`${tab ? ` (tab \`${tab}\`)` : ""} — \`template/src/${routeFile.get(route!) ?? "?"}\``;
};
const permLine = (e: Entity) =>
  e.perm.length === 0
    ? "none: own data or Super Admin (portal-wide)"
    : e.perm.map((r) => `\`${r}\`: ${(permActions.get(r) ?? []).join(", ")}`).join("; ");
const isMaster = (p: Phase) => p.kind === "MASTER";
/** "POST /sales/x, GET /me/y" -> "POST /api/sales/x, GET /api/me/y" (every path that starts after a space, comma or bracket). */
const withApiPrefix = (s: string) => s.replace(/(^|[\s,(])\/(?=[a-z])/g, "$1/api/");

function standardEndpoints(p: Phase, e: Entity): string[] {
  const base = `/api/${e.api}`;
  const list = [
    `GET ${base}?search&status&page&pageSize&sort: list → { items, total }`,
    `GET ${base}/:id: detail`,
    `POST ${base}: create${isMaster(p) ? "" : " (draft)"}`,
    `PATCH ${base}/:id: update with rowVersion (409 when stale)${isMaster(p) ? "" : "; drafts only"}`,
  ];
  if (isMaster(p)) list.push(`POST ${base}/:id/deactivate | /activate`, `DELETE ${base}/:id: only when unreferenced (409 *_IN_USE)`);
  else list.push(`DELETE ${base}/:id: drafts only; posted documents are reversed, never deleted`);
  list.push(`GET ${base}/:id/history: audit trail (Company.AuditTrailEntries)`);
  return list;
}

// ---------------------------------------------------------------------------
// ROADMAP.md
// ---------------------------------------------------------------------------
const entities = phases.flatMap((p) => p.entities.map((e) => ({ p, e })));
const md: string[] = [];
const kindLabel = (p: Phase) => (p.kind === "FOUNDATION" ? "Foundation" : p.kind === "MASTER" ? "Masters" : "Transactions");
md.push(
  "# Accountex delivery roadmap",
  "",
  "> Generated from `docs/delivery/roadmap/*.ts` by `npm run delivery:roadmap`. Edit the data files, not this document.",
  "> Phase progress is the `status` of each phase in the data files (planned / in-progress / done), updated when a phase is accepted.",
  "",
  `**${phases.length} phases** · **${entities.length} entities** (${entities.filter((x) => x.p.kind === "MASTER").length} masters, ${entities.filter((x) => x.p.kind === "TRANSACTIONAL").length} transactional) · ` +
    `${owner.size} tables assigned · ${Object.keys(NOT_ENTITIES).length} tables deliberately not entities · checked against the live DB and \`template/src\`.`,
  "",
  "Say **\"next phase\"** to plan the next pending phase (skill `next-phase`). Nothing is implemented without approval of that phase's plan.",
  "",
  "## Standards for every entity",
  "",
  "**Pages:** Next.js + Tailwind, faithful to the listed template (typography, spacing, colours, icons, tables, forms, drawers, responsive).",
  "- List page with search, filters, pagination and loading / empty / error states.",
  "- Create and edit as the template shows them: drawer, modal or page.",
  "- Detail view with a **History** tab (audit trail).",
  "- Actions are hidden or disabled without permission.",
  "- Validation, success and error toasts.",
  "",
  "Next routes mirror the template without `app/` (`#/app/accounting/coa` → `/accounting/coa`; `.../view` → `.../[id]`). The Super Admin portal is under `/admin/*`.",
  "",
  "**Backend (Clean Architecture):** UI → server adapter (Nest controller) → application use case → domain rules + repository port → Prisma repository → response DTO.",
  "- Contracts are Zod schemas in `src/shared/<module>`.",
  "- Each module lives at `src/server/modules/<module>/<entity>/{domain,application,infrastructure,presentation}`.",
  "",
  "**Every insert, update and delete from the application:**",
  "- Runs inside `PrismaService.withContext` (Phase 0), which tells the database who the user is, in the same transaction as the change.",
  "- The DB audit trigger then keeps that row's history: one `Company.AuditTrailEntries` row per change with who (user id + name/email snapshot), what (action, table, record), the changed fields (before/after), the full row at that version, IP, user agent, session, correlation ID and time.",
  "- Each entity's detail page shows this as a **History** tab (`GET …/:id/history` → `Company.getRecordHistory`).",
  "- Returns catalogue error codes with HTTP status and `correlationId` (Phase 0).",
  "- Never trusts a client-supplied actor.",
  "",
  "**Masters:** deactivate rather than delete. Delete is allowed only when unreferenced.",
  "",
  "**Transactions:**",
  "- Lifecycle: draft → submit → approve → post. Posting is one transaction: document, GL/stock effects and audit together.",
  "- Posted documents are immutable; corrections are reversal or void only.",
  "",
  "**Audit:** every table listed for an entity must carry `Company.triggerAudit` before that phase is done (each entity below shows which tables still lack it).",
  "",
  "**Acceptance:** working CRUD per entity (persisted after reload), validation, permissions, relationships, audit rows, error codes, and a visual comparison against the template.",
  "",
  "## Phase summary",
  "",
  "| Phase | Title | Kind | Portal | Status | Entities |",
  "|---:|---|---|---|---|---|",
  ...phases.map((p) => `| ${p.no} | ${p.title} | ${kindLabel(p)} | ${p.portal} | ${p.status ?? "planned"} | ${p.entities.length ? p.entities.map((e) => e.name).join(" · ") : "—"} |`),
  "",
  "## Phase 0: Foundation",
  "",
  `_${phases[0]!.objective}_ This is an approved exception: Phase 0 has no business entities.`,
  "",
  ...FOUNDATION_TASKS.map((t, i) => `${i + 1}. ${t}`),
  "",
);

for (const p of phases.filter((x) => x.no > 0)) {
  md.push(`## Phase ${p.no}: ${p.title}`, "", `**${kindLabel(p)}** · ${p.portal} · ${p.entities.length} entities. ${p.objective}`, "");
  if (p.reports?.length) md.push(`Read-only reports delivered with this phase: ${p.reports.join(", ")}.`, "");
  p.entities.forEach((e, i) => {
    const unaudited = e.tables.filter((t) => !auditedTables.has(t));
    md.push(
      `### ${p.no}.${i + 1} ${e.name} \`${e.key}\``,
      "",
      `- **Tables:** ${e.tables.map((t) => `\`${t}\``).join(", ")}`,
      `- **Audit trigger:** ${unaudited.length ? `missing on ${unaudited.map((t) => `\`${t}\``).join(", ")}; add it in this phase` : "present on all tables"}`,
      `- **Template:** ${e.tpl.length ? e.tpl.map(tplLine).join("; ") : "**none**, design needed (see open questions)"}`,
      `- **Pages:** ${e.tpl.length ? e.tpl.map((r) => `\`${nextRoute(r)}\` (${pageKind(r)})`).join(", ") : "to be designed"}`,
      `- **Permissions:** ${permLine(e)}`,
      "- **API:**",
      ...standardEndpoints(p, e).map((s) => `  - \`${s.split(": ")[0]}\`${s.includes(": ") ? ": " + s.split(": ").slice(1).join(": ") : ""}`),
      ...(e.x ?? []).map((s) => `  - ${withApiPrefix(s)}`),
    );
    if (e.rules?.length) md.push(`- **Business rules:** ${e.rules.join("; ")}.`);
    if (e.deps?.length) md.push(`- **Depends on:** ${e.deps.map((d) => `\`${d}\` (phase ${phaseOf.get(d)})`).join(", ")}`);
    if (e.open?.length) md.push(`- **Open questions:** ${e.open.join("; ")}`);
    md.push("");
  });
}

md.push(
  "## Tables that are not entities",
  "",
  "| Table | Why |",
  "|---|---|",
  ...Object.entries(NOT_ENTITIES).map(([t, why]) => `| \`${t}\` | ${why} |`),
  "",
);

// ---------------------------------------------------------------------------
console.log(`Phases ${phases.length}, entities ${entities.length}, tables assigned ${owner.size}/${dbTables.size} (+${Object.keys(NOT_ENTITIES).length} not entities)`);
console.log(`Entity tables without audit trigger: ${[...owner.keys()].filter((t) => !auditedTables.has(t)).length}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ` + problems.join("\n- "));
  process.exit(1);
}
// Write only when every check passed, so a broken edit never replaces the last good document.
writeFileSync("docs/delivery/ROADMAP.md", md.join("\n"), "utf8");
console.log("All checks passed. Wrote docs/delivery/ROADMAP.md");
