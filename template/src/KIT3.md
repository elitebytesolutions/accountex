# Finsoft v3 contract (read KIT2.md first; everything there still applies)

v3 adds: trade vouchers, cash ledger, users & roles, company completion, admin expansion, the ESS portal, a mobile app showcase, and more motion. The design language is unchanged: "Fundcy × Finsoft" (forest + lime, hairlines, light **and** dark, tokens only). Push for **more delight**: purposeful micro-animations, live feedback, keyboard support, and empty/loading/success states.

## Ownership & safety
- Each agent owns ONLY the files named in its brief. Never edit other files (especially 10-styles.css, 95-ui.js, 99-app.js, 90-nav.js and build.ps1, which belong to the lead).
- Scratch: use ONLY `<scratchpad>\<your-letter>\` for temp files (scratchpad path in KIT2.md).
- `build.ps1` already lists every v3 file (missing ones are skipped silently). Build: `powershell -NoProfile -File "C:\Users\saim javed\Documents\finsofthtml\build.ps1"`.
- Verify: `node "<scratchpad>\verify.js" "route,route~dark,route@390" --quick --out=<scratchpad>\<letter>\shots`, then view the PNGs. For interaction testing, write Playwright scripts: `require('C:/Users/saim javed/Documents/finsoft/node_modules/playwright')`, `chromium.launch({channel:'msedge'})`, URL `file:///C:/Users/saim%20javed/Documents/finsofthtml/index.html#/<route>`. To force dark mode before load: `ctx.addInitScript(()=>localStorage.setItem('fs-theme','dark'))`.
- Every route you create already exists in `src/90-nav.js`. Read it. Your sections must use exactly those `data-route` values. All hrefs must be real routes.
- IDs must be globally unique: prefix every id with your file key (e.g. `sd-`, `pd-`, `cu-`, `cp-`, `ap-`, `es-`, `mo-`).
- JS: wrap everything in an IIFE. Register with `FS.onEnter(route or fn, (sec, route, first) => {...})`. On `first`, render dynamic markup, then call `FS.enhance(sec)` and `FS.icons(sec)`. Your JS file loads AFTER 95-ui.js, so `FS` exists at load time.
- CSS: prefix every class with your key (e.g. `.sd-`), use tokens only, and add dark tweaks only through tokens. Make it responsive (1536 / 1280 / 1100 / 390). No horizontal page overflow.

## Shared data: `window.FS_DATA` (src/91-data.js)
`company, branches, warehouses, items[] {sku, upc, name, cat, unit, pack, cost, price, stock, gst, brand}, customers[] {code, name, city, ntn, limit, balance, phone, group}, vendors[], employees[] {id, name, role, dept, branch, email, phone}, salesTeam {bookers, deliverymen, salesmen, supervisors}, banks[], cashAccounts[]`. Use these for consistency, and extend them locally in your own file if you need more.

## FS API (95-ui.js / 99-app.js); v3 additions are marked NEW
- `FS.onEnter`, `FS.icons`, `FS.enhance`, `FS.toast(msg, {tone, undo, action})`, `FS.money(n)`, `FS.fmt(n, dec)`, `FS.countUp(el)`, `FS.menu(anchor, items)`, `FS.drawer({title, subtitle, html, foot, wide})`, `FS.openModal(id)`, `FS.closeOverlays()`, `FS.go(route)`, `FS.theme()`.
- NEW `FS.tick(el, toNumber, {dec:2, prefix:'Rs '})`: animates a number change from the current value (use it for live totals).
- NEW `FS.celebrate(el?)`: a success burst (check + confetti-lite) anchored at an element or the screen centre. Use it on Post / Approve / Save & Post.
- NEW `FS.sheet({title, html, foot})`: bottom-sheet modal (slides up; on desktop a centred sheet). Returns the element.
- NEW `FS.skeleton(el, ms=500)`: overlays a shimmer on an element, then fades it out (use it when "loading" data such as invoice lookups).
- NEW `FS.quickView`: clicking any row of an auto-enhanced `table.tbl` (not data-plain) opens a generic preview drawer automatically. Add `data-qv-route="app/..."` on the `<tr>` to give the drawer an "Open full page" link.
- NEW `FS.confirm({title, text, okLabel, danger}) → Promise<boolean>`: confirm modal.
- NEW live activity: the shell occasionally pushes a notification toast. You don't need to do anything.
- Global classes from KIT2 still apply (`.panel .kpi .btn .badge .pill .tbl .chips .seg .tabs .form-grid .switch .wizard .num-big .dec .hatch …`).

## Motion expectations (apply them in your screens)
- Entrance: the shell staggers top-level children automatically. For dynamic lists, stagger with `animation: fadeUp .4s var(--ease) both; animation-delay: calc(var(--i)*40ms)`.
- Live maths: totals tick with FS.tick; rows flash (`.row-flash`) when added; rows animate out on delete.
- Feedback: buttons show a progress state for async-looking actions (~0.8–1.2s), then toast or celebrate.
- Respect `prefers-reduced-motion`.
