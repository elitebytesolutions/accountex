# Finsoft ERP — Full edition

the complete product: every one of the 195 screens of the Finsoft HTML prototype, designed from the prototype in `../src`.

| What | Where |
|---|---|
| Product scope (portals, personas, module features & rules, phases, decisions) | [SCOPE.md](SCOPE.md) |
| Posting rules (Dr/Cr + stock effect for every event) | [POSTING_RULES.md](POSTING_RULES.md) |
| Page → entity map (one section per screen) | [entities/README.md](entities/README.md) |
| Interactive ERD (open in a browser) | [erd/index.html](erd/index.html) — rebuild with `powershell -File erd/build-erd.ps1` |
| PostgreSQL 16 schema | [database/](database/) — conventions in [database/CONTRACT.md](database/CONTRACT.md), names in [database/NAMING.md](database/NAMING.md) |

## Database layout
```
database/
  install.sql            runs everything in order:  psql -d finsoft -f install.sql
  CONTRACT.md            the conventions (names, lookups, API, tenancy)
  NAMING.md              every table per module: old name → screen-based name, its functions and lookup lists
  naming/rename-map.csv  machine-readable old → new map (schemas, tables, columns, views, functions)
  schema/00-foundation   extensions, 15 schemas, roles, helpers (numbering, audit, standard triggers)
  schema/01a-lookups     the single "Lookups"."Lookups" table + column registry + validation trigger
  schema/NN-<module>     tables, intra-module FKs, indexes, module triggers & functions
  fk/NN-<module>-fks     cross-module foreign keys
  views/90-<module>-*    get… report / dashboard views and date-range functions
  api/00-*               shared helpers: lookups, permissions, journal / stock posting helpers
  api/NN-<Module>-api    <entity>AddUpdate · get<Entity>Info · <entity>Post/Approve/Void/… (generated)
  api/NN-<Module>-posting  posting hooks: the journal entries and stock movements of each action
  schema/91-rls          row-level security + grants (app role: SELECT + EXECUTE only)
  schema/92-lookups      every enumeration value + which column uses which list (generated)
  schema/95-seed-*       global reference data (currencies, document types, permissions, plans)
```

## Sister edition
../erp-basic/ — the core ERP (a strict subset of this edition)
