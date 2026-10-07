## Fixed assets (fa)

**Screens.** Fixed Asset Register · Asset Detail · Run Depreciation · Asset Disposals.

**Features.**
- **Asset categories** with default method (WDV / SLM / none), rate and GL accounts (cost, accumulated depreciation, expense); land is not depreciated.
- **Asset register**: code `FA-0012`, name, category, location (branch), custodian (employee), cost centre, tag (`ALN-VH-0012`, printable), serial, acquisition date, cost, source document (vendor bill) and supplier, method, rate, residual value, "charge full month in month of purchase", per-asset GL accounts, vehicle registration / engine / chassis, insurer, policy, premium and expiry, tax WDV (ITO 2001), last physical verification; NBV = cost − accumulated depreciation. Search by code, name, serial or tag; category and branch filters; cost-by-category panel; alerts for assets under repair, insurance expiring and verification due.
- **Transfers** between branches and custodians, with approval; history on the asset.
- **Depreciation runs**: per period, optionally per branch or category; recompute while draft; review computed charges by category; journal preview; post one JV; run history; email summary. Monthly proration, WDV on opening NBV, SLM on cost, capped at NBV − residual.
- **Depreciation schedule**: per asset per fiscal year (opening NBV, months posted / months, depreciation, accumulated, closing NBV) as Locked / Pending / Projected, feeding the NBV chart.
- **Disposals** `DSP-2026-0009`: sale, scrap, write-off or trade-in; buyer, proceeds, GST on sale, receive-into bank/cash; automatic NBV and gain/loss; draft → approval → posted derecognition journal.

**Key business rules.**
- An asset is depreciated at most once per period; fully depreciated, method-none and disposed assets are skipped.
- Accumulated depreciation only moves through posted runs (and is written back on disposal).
- A disposal snapshot must match the asset's current cost and accumulated depreciation when posted.
- One live disposal and one open transfer per asset; disposed assets cannot be transferred.
- Posted runs and disposals are frozen; corrections are reversals of their journals.

**Statuses.** Asset NEW / IN_USE / UNDER_REPAIR / FULLY_DEPRECIATED / DISPOSED · Run DRAFT / POSTED / CANCELLED · Schedule LOCKED / PENDING / PROJECTED · Disposal DRAFT / PENDING_APPROVAL / POSTED / CANCELLED · Transfer PENDING_APPROVAL / APPROVED / REJECTED / COMPLETED / CANCELLED.
