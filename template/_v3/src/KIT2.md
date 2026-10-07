# Finsoft v2 contract (read this fully before writing anything)

Design direction: **"Fundcy × Finsoft"**. Calm, confident, premium fintech. White surfaces with 1px hairline borders, generous whitespace, big numbers with **muted decimals**, small pill chips, forest-green and lime accents, smooth purposeful motion. There are **two themes**, light and dark, so every colour you write MUST be a token (`var(--…)`). Never hard-code `#fff` or other hex colours in markup. In CSS files, hex is allowed only inside token definitions or for chart-series colours that work in both themes.

Build: `powershell -File build.ps1` concatenates `src/*` partials (in the order listed in build.ps1) into `index.html`.
Verify: `node "<scratchpad>/verify.js" "route1,route2@390"` writes screenshots to `<scratchpad>/shots/`. Add `?theme=dark` support: pass the route as `app/dashboard~dark` to shoot in dark mode.
Scratchpad root: `C:\Users\SAIMJA~1\AppData\Local\Temp\claude\C--Users-saim-javed-Documents-finsofthtml\f59c5c00-a8cb-4ddc-94e0-e40d3cfaef30\scratchpad`
**Use ONLY your own scratch subfolder** (`scratchpad/<your-agent-letter>/`) for temp files. Never write generic names in the scratch root. Never edit files you do not own.

## Theme tokens (defined in src/10-styles.css; same names in light & dark)
Surfaces: `--bg` (app background), `--surface` (cards), `--surface-2` (subtle fill / table header / inputs), `--surface-3` (hover / deeper fill), `--line` (hairline border), `--line-2` (stronger border)
Text: `--ink` (primary text), `--ink-2` (secondary), `--muted`, `--muted-2` (placeholder/disabled)
Brand: `--primary` (forest green; in dark it lifts to mint), `--primary-strong` (hover/pressed), `--primary-soft` (tinted bg), `--primary-ink` (text on primary bg = white), `--lime` (#C6E85B accent), `--lime-soft`, `--lime-ink` (dark text on lime), `--mint` (#3DD39B)
Semantic (each has `-soft` bg variant): `--good`, `--warn`, `--danger`, `--info`, `--violet`, `--orange`, `--blue`
Money: `--debit` (green), `--credit` (orange/amber), `--neg` (red)
Fixed dark surfaces (same in both themes, for hero bands, tooltips, report canvas): `--night` (#0F1F18), `--night-2` (#1A2C24), `--night-ink` (#E8EFEA)
Effects: `--shadow-1` (cards on hover), `--shadow-2` (popovers), `--shadow-3` (modals), `--hatch` (diagonal-stripe background-image for "space" tracks), `--ring` (focus ring box-shadow)
Shape: `--r-card:18px`, `--r-md:14px`, `--r-input:12px`, `--r-sm:9px`, `--r-pill:999px`
Fonts: `--font` (Plus Jakarta Sans), `--font-hand` (Caveat, for handwritten taglines), `--font-serif` (Georgia, for Report Studio titles)
Motion: `--ease` (cubic-bezier(.2,.8,.2,1)), `--ease-spring` (cubic-bezier(.34,1.56,.64,1)), `--dur` (.28s)

## Global classes still available (restyled in v2, same names as v1; see src/KIT.md for full markup)
`.screen` `.page-head` (`.eyebrow`, h1, p, `.head-actions`), `.tagline` (Caveat handwritten text, put inside page-head right side), `.kpi-grid`/`.kpi`, `.panel`/`.panel.flush`/`.panel-head`, `.toolbar`, `.search-field`, `.chips`, `.seg`, `table.tbl` (`td.num`, `.dr`, `.cr`, `.neg`, `.zero`, `tr.total`), `.table-foot`/`.pager`, `.badge.good|warn|danger|info|neutral|violet` (+`.dot`), `.btn.primary|secondary|ghost|danger|lime|sm|lg|icon`, `.tabs`+`[data-tabs]`/`[data-tab]`/`[data-pane]`, `.form-grid`, `.switch`, `.overlay`/`.modal`/`.drawer` + `[data-open]`/`[data-close]`, `[data-toast]`, `.wizard`/`[data-wizard]`, `.banner`, `.empty-state`, `.hero-band` (dark forest band), `.list`/`.list-item`, `.dl`, `.progress`, `.timeline`, `.avatar`, `.icon-well` (+ tones `.teal .blue .yellow .red .violet`), `.bars`/`.bar`, `.donut`, `.stackbar`, `svg.chart` (`.area` `.line`), `.spark`, `.card-grid`/`.card`, `.grid-2/3/4`, `.split`, `.split-l`, `.stack`, `.row`, `.spacer`.
New in v2:
- `.num-big` big figure: `<b class="num-big">Rs 74,503<span class="dec">.00</span></b>`. Use muted decimals everywhere you show a hero figure. `FS.money(n)` returns this markup.
- `.pill` small chip: `<span class="pill"><i data-lucide="zap"></i>Earned <b class="up">+Rs 458</b></span>`
- `.hatch` element with the striped "space" background.
- `.tip` dark tooltip pill (used by charts).
- `.icon-tile` 44px rounded tile (`.green .blue .orange .red .violet .lime`).

## Runtime API (window.FS, provided by src/95-ui.js + src/99-app.js)
- `FS.onEnter(match, fn)`: `match` is an exact route string or a function(route)->bool. `fn(sectionEl, route, firstTime)` runs every time that route becomes active (after the section is shown). Use it to mount your engine once (`firstTime`) and re-run entrance animations.
- `FS.icons(root?)`: render `<i data-lucide>` icons. **Call it after you inject HTML.**
- `FS.toast(msg, {tone:'good'|'warn'|'danger'|'info', undo: fn, action:{label, fn}})`
- `FS.money(n, {dec:2, rs:true})` returns HTML with muted decimals. `FS.fmt(n, dec=0)` returns a plain grouped string like `1,234,567`.
- `FS.countUp(el)` animates the number text inside `el` (keeps a prefix like "Rs " and `.dec`). Any element with `[data-count]` is counted up automatically on route enter.
- `FS.enhance(root)`: re-applies table/chart/tab enhancers to dynamically injected HTML (sorting, search, selection, tooltips, animations). Call it after you render large dynamic markup.
- `FS.menu(anchorEl, [{label, icon, onClick, danger, sep}])`: opens a popover menu anchored to the element.
- `FS.openModal(id)`, `FS.closeOverlays()`.
- `FS.drawer({title, subtitle, html, foot})`: opens a generic right-hand drawer and returns its element.
- `FS.theme()` returns `'light'|'dark'`. A `document` event `fs:theme` fires on change; redraw canvas/SVG colours if needed. Prefer CSS vars so you never need to.
- Tables: every `table.tbl` gets auto-enhanced: sortable headers (skip a column with `th[data-nosort]`), live search (nearest `.search-field` in the same `.screen`), chip filtering, checkbox selection with a floating bulk bar, and a ⋮ row menu on `.icon-btn-sm` that has no `data-open`. Opt out per table with `table.tbl[data-plain]`.
- Charts: `.bars .bar` grow-in plus a hover tooltip (tooltip text comes from `data-tip` on `.bar` or the inner `i`), `.donut` sweeps, `.progress>i` fills, `svg.chart .line` draws in. All of this runs automatically on route enter.

## Sections & routing
A screen is `<section class="screen" data-route="app/x/y" data-title="Title">…</section>`. The router shows it and calls the FS.onEnter hooks. Engine-rendered screens can be empty shells: `<section class="screen" data-route="app/reports/pnl" data-title="Profit & Loss"><div data-studio="finance" data-tab="pnl"></div></section>`. Your JS mounts into it on enter.
Every href must be a real route (see src/90-nav.js). `fsCheck()` reports missing or broken ones.

## Domain data (unchanged from v1, src/KIT.md)
Tenant **Al-Noor Enterprises (Pvt) Ltd**, Lahore, NTN 4271839-6, STRN 32-77-8761-234-55. PKR, FY Jul–Jun, current FY 2026-27, today **Thursday 01 Oct 2026**. Users: Sana Javed (Finance Manager, the signed-in user), Ahmed Raza (CEO), Hira Ali (Accountant), Ayesha Noor (HR Manager), Bilal Khan (Sales Exec, EMP-0042). Customers, vendors, banks (Meezan 0123, HBL 8721, UBL 2294, Bank Alfalah 5510), departments and doc-number formats are as in KIT.md.
