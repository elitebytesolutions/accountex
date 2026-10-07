# Finsoft HTML Kit — contract for screen partials

Every screen partial is a plain HTML fragment (no <html>/<head>/<body>, no <style>, no <script>).
`build.ps1` concatenates partials into the single `index.html`. Styles live ONLY in `src/10-styles.css`.
If a screen truly needs a one-off layout, use inline `style=""` sparingly — never add <style> blocks.

## Screen wrapper
```html
<section class="screen" data-route="app/accounting/vouchers" data-title="Voucher Register">
  <div class="page-head">
    <div>
      <div class="eyebrow">Accounting / Vouchers</div>
      <h1>Voucher Register</h1>
      <p>One-line description of the page.</p>
    </div>
    <div class="head-actions">
      <button class="btn secondary"><i data-lucide="download"></i>Export</button>
      <a class="btn primary" href="#/app/accounting/vouchers/new"><i data-lucide="plus"></i>New Voucher</a>
    </div>
  </div>
  ... content ...
</section>
```
- Routes: `admin/...` (Platform Admin portal), `app/...` (Tenant app), `ess/...` (Employee Self-Service), and entry routes `login`, `chooser`, etc. (no prefix => full-screen, no shell).
- The route string MUST exactly match the route given in your assignment (they are wired into the sidebar).
- Links between screens: `<a href="#/app/sales/invoices/view">`. Every href must be a real route from the route list.
- Icons: Lucide, `<i data-lucide="icon-name"></i>` (kebab-case lucide names, e.g. `landmark`, `book-open`, `receipt-text`, `users`, `calendar-days`, `wallet`, `file-text`, `building-2`, `trending-up`, `circle-check`, `clock`, `alert-triangle`, `more-horizontal`, `filter`, `download`, `printer`, `plus`, `search`, `eye`, `pencil`, `trash-2`, `send`, `upload`, `check`, `x`).

## Layout helpers
- `.grid-2`, `.grid-3`, `.grid-4` — equal column grids (gap 14px, collapse on mobile).
- `.split` — `1fr 380px` (main + inspector). `.split-l` — `300px 1fr` (rail + main). `.split-doc` — `1.4fr 1fr`.
- `.stack` — vertical flex gap 14px. `.row` — horizontal flex gap 9px, align center. `.spacer` — flex:1.
- `.mb` adds margin-bottom 14px. `.mt` margin-top 14px. `.muted` grey text. `.small` 11.5px. `.right` text-align right.

## KPI tiles
```html
<div class="kpi-grid">            <!-- 4 cols; .kpi-grid.c3 / .c5 / .c6 variants -->
  <div class="kpi teal">          <!-- tone: (default green) teal blue yellow red violet -->
    <div class="kpi-top"><span>Cash & Bank</span><span class="icon-well"><i data-lucide="wallet"></i></span></div>
    <strong>Rs 4,82,15,300</strong>
    <small class="up">▲ 8.2% vs last month</small>   <!-- .up green, .down red, none = muted -->
  </div>
</div>
```

## Panels
```html
<div class="panel">                 <!-- .panel.flush => no inner padding (use for tables) -->
  <div class="panel-head">
    <div><h3>Recent Vouchers</h3><p>Last 7 days</p></div>
    <div class="panel-actions"><button class="btn ghost sm">View all</button></div>
  </div>
  ...
</div>
```

## Toolbar / filters
```html
<div class="toolbar">
  <label class="search-field"><i data-lucide="search"></i><input placeholder="Search vouchers…"></label>
  <select><option>All types</option></select>
  <div class="chips"><button class="active">All <i>124</i></button><button>Draft <i>6</i></button></div>
  <span class="spacer"></span>
  <button class="btn secondary sm"><i data-lucide="filter"></i>Filters</button>
</div>
```

## Tables
```html
<div class="panel flush">
  <div class="table-wrap"><table class="tbl">
    <thead><tr><th><input type="checkbox"></th><th>Voucher #</th><th>Date</th><th class="num">Debit</th><th></th></tr></thead>
    <tbody>
      <tr><td><input type="checkbox"></td>
          <td><a class="link" href="#/app/accounting/vouchers/view">JV-2026-000045</a><small>Accrual</small></td>
          <td>12 Sep 2026</td>
          <td class="num dr">1,25,000.00</td>     <!-- .dr debit green, .cr credit amber, .neg red, .zero shows grey -->
          <td class="actions"><button class="icon-btn-sm"><i data-lucide="more-horizontal"></i></button></td></tr>
      <tr class="total"><td colspan="3">Total</td><td class="num">…</td><td></td></tr>
    </tbody>
  </table></div>
  <div class="table-foot"><span>Showing 1–25 of 412</span><div class="pager"><button>‹</button><button class="active">1</button><button>2</button><button>›</button></div></div>
</div>
```
- Cell with avatar: `<td><div class="cell-user"><span class="avatar sm">AR</span><div><b>Ahmed Raza</b><small>EMP-0012</small></div></div></td>`
- Zero amounts render as `<td class="num zero">—</td>`.
- Amounts: Pakistani grouping, e.g. `Rs 12,45,000` or `12,45,000.00` in tables.

## Badges
`<span class="badge good">Posted</span>` tones: good, warn, danger, info, neutral, violet. Add `.dot` for a leading dot.

## Buttons
`.btn.primary`, `.btn.secondary`, `.btn.ghost`, `.btn.danger`, size `.sm`, `.lg`, icon-only `.btn.icon`. Small square icon button in tables: `.icon-btn-sm`.

## Tabs (JS-wired)
```html
<div data-tabs>
  <div class="tabs"><button class="active" data-tab="overview">Overview</button><button data-tab="ledger">Ledger</button></div>
  <div class="tab-pane active" data-pane="overview">…</div>
  <div class="tab-pane" data-pane="ledger">…</div>
</div>
```
Chip groups `.chips` and `.seg` (segmented control) toggle `.active` automatically on click.

## Forms
```html
<div class="form-grid">          <!-- 2 cols; .form-grid.c3 / .c4 -->
  <label><span>Customer *</span><select><option>Shifa Medical Centre</option></select></label>
  <label><span>Date</span><input type="date" value="2026-10-01"></label>
  <label class="full"><span>Narration</span><textarea rows="3"></textarea></label>
  <label class="check"><input type="checkbox" checked> Send email to customer</label>
</div>
<label class="switch"><input type="checkbox" checked><i></i><span>Enable MFA</span></label>
<div class="form-section"><h4>Section title</h4><p>helper</p></div>
<div class="form-actions"><button class="btn secondary">Cancel</button><button class="btn primary">Save</button></div>
```
Line-item grid (vouchers/invoices): use a `.table-wrap` with `table.tbl.lines` — inputs inside cells (`<input class="cell-input">`).

## Modals & drawers (JS-wired)
Trigger: `<button data-open="mdl-post-voucher">`. Close: any `[data-close]` or click on scrim.
```html
<div class="overlay" id="mdl-post-voucher">
  <div class="modal">               <!-- .wide 760 / .xl 1080 -->
    <div class="modal-head"><div><h2>Post voucher?</h2><p>…</p></div><button class="x" data-close><i data-lucide="x"></i></button></div>
    <div class="modal-body">…</div>
    <div class="modal-foot"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-close data-toast="Voucher posted">Post</button></div>
  </div>
</div>
<div class="overlay drawer-overlay" id="drw-employee"><aside class="drawer"> same head/body/foot </aside></div>
```
Put modals INSIDE the section they belong to. Modal ids must be globally unique — prefix with your partial name (e.g. `acc-`, `hr-`).
`data-toast="Message"` on any button shows a toast.

## Wizards (JS-wired)
```html
<div class="wizard" data-wizard>
  <ol class="steps"><li class="active"><b>1</b><span>Company</span></li><li><b>2</b><span>Plan</span></li></ol>
  <div class="wz-pane active">…<div class="form-actions"><button class="btn primary" data-next>Continue</button></div></div>
  <div class="wz-pane">…<div class="form-actions"><button class="btn secondary" data-prev>Back</button><button class="btn primary" data-next>Continue</button></div></div>
</div>
```

## Banners, empty states, misc
- `<div class="banner warn"><i data-lucide="alert-triangle"></i><div><b>Title</b><p>Text</p></div><button class="btn sm secondary">Action</button></div>` tones: info, warn, danger, good.
- `<div class="empty-state"><span class="icon-well lg"><i data-lucide="inbox"></i></span><h4>No records</h4><p>…</p><button class="btn primary sm">Create</button></div>`
- `.hero-band` (dark navy gradient hero): `<div class="hero-band"><div><span class="hero-eyebrow">Good morning</span><h1>…</h1><p>…</p></div><div class="hero-actions">buttons</div></div>`
- `.list` > `.list-item` (`<span class="icon-well">…</span><div><b>title</b><small>sub</small></div><span class="spacer"></span>value`)
- `.dl` definition rows: `<div class="dl"><div><span>Label</span><b>Value</b></div>…</div>`
- `.progress` `<div class="progress"><i style="width:62%"></i></div>` (`.progress.warn`, `.danger`)
- `.avatar` (`.sm`, `.lg`, `.xl`) with initials text.
- `.timeline` > `.tl-item` (`<span class="tl-dot good"></span><div><b>…</b><small>…</small></div>`)
- Profile header: `.profile-head` > `.avatar.xl` + `div(h2, p, .row of badges)` + `.head-actions`.
- Kanban: `.kanban` > `.kb-col` (`.kb-col-head` h4 + count) > `.kb-card`.
- Cards grid: `.card-grid` (auto-fill minmax 260px) > `.card`.
- Plan / pricing cards: `.plan-card` (`.featured` variant).
- Attendance month grid: `.att-grid` with cells `<i class="p">P</i>` classes p (present) a (absent) l (leave) h (holiday) w (weekend) lt (late) hd (half day).
- Calendar: `.cal` > `.cal-head` (7 day names) + `.cal-day` cells (`.muted`, `.today`, with `<em class="ev good">event</em>`).
- Org chart: `.org` > `.org-node` > `.org-card` + `.org-children` (nested).
- Permission matrix: `table.tbl.matrix` with checkboxes.
- Document/print paper (invoice, payslip, voucher print): `.paper` > `.paper-head`, `.paper-meta`, table.tbl, `.paper-totals`, `.paper-foot`.
- COA tree rows: `.tree` > `.tree-row.l1/.l2/.l3/.l4` (`<span class="tw"><i data-lucide="chevron-down"></i></span><b>code</b> name … amount`).

## Charts (no library)
- Bars: `<div class="bars"><div class="bar" style="--h:62%"><i></i><span>Jul</span></div>…</div>` (`.bars.dual` -> each `.bar` has two `<i>`; second `<i class="b">`).
- Donut: `<div class="donut" style="--p:68;--c:var(--brand-600)"><b>68%</b><small>Present</small></div>`.
- Multi-segment stacked bar: `<div class="stackbar"><i style="width:40%;background:#15803d"></i><i style="width:20%;background:#efbc61"></i></div>`.
- Line/area charts: inline `<svg class="chart" viewBox="0 0 600 200" preserveAspectRatio="none">` with `<path class="area">` and `<path class="line">` (+ `.line.alt`). Add `.legend` below: `<div class="legend"><span><i style="background:#15803d"></i>Income</span></div>`.
- Sparkline: `<svg class="spark" viewBox="0 0 100 30"><path d="…"/></svg>`.

## Domain data (use consistently)
- Platform: Finsoft Cloud. Platform staff: Saim Javed (Super Admin), Mariam Iqbal (Support Lead), Danish Ahmed (Billing).
- Demo tenant: **Al-Noor Enterprises (Pvt) Ltd**, Lahore — tenant code `ALNOOR`, NTN 4271839-6, STRN 32-77-8761-234-55. Branches: Lahore HQ, Karachi, Islamabad, Faisalabad.
- Other tenants: Bhatti Traders, Crescent Textiles, Zameen Builders, Indus Foods, Shaheen Logistics, Pak Agro Mills, Karakoram Tech, Margalla Pharma, Ravi Motors, Sukkur Rice Co., Gwadar Marine.
- Plans: Starter (Rs 9,999/mo), Growth (Rs 24,999/mo), Business (Rs 49,999/mo), Enterprise (custom).
- Currency PKR, shown as `Rs 1,24,500` (thousands grouping like the source is fine as `Rs 124,500` — use **Western grouping `Rs 1,245,000`** consistently). Fiscal year July–June, current FY 2026-27, today = 01 Oct 2026.
- Tax: GST 18% standard (also 0%, exempt), WHT u/s 153(1)(a)/(b)/(c), 149 salary, 236G/236H, further tax 4%. EOBI, PESSI/SESSI, Provident Fund.
- Doc numbers: `JV-2026-000045`, `CPV-…`, `CRV-…`, `BPV-…`, `BRV-…`, `INV-2026-000123`, `QT-…`, `SO-…`, `CN-…`, `BILL-…`, `PO-…`, `DN-…`, `RCPT-…`, `PAY-…`, `FA-0012`, `PR-2026-09` (payroll run), employee `EMP-0012`.
- People (tenant users/employees): Ahmed Raza (CEO), Sana Javed (Finance Manager), Hira Ali (Accountant), Ayesha Noor (HR Manager), Bilal Khan (Sales Exec), Usman Ali (Procurement), Umar Farooq, Zainab Raza, Hamza Butt, Fatima Noor, Kashif Ali, Nida Shah, Faisal Qureshi, Mehwish Tariq, Ali Haider, Rabia Saeed.
- Customers: Shifa International, City Mart Superstores, Fatima Group, Packages Ltd, Hashoo Hotels, Al-Fatah Stores, Metro Cash & Carry, Engro Foods, Lucky Cement, Interloop Ltd.
- Vendors: Pak Suzuki Spares, Nishat Mills, Siemens Pakistan, Habib Packaging, Shan Foods, PTCL, K-Electric, LESCO, Daraz Business, TCS Logistics.
- Banks: Meezan Bank — 0123 (current), HBL — 8721, UBL — 2294, Bank Alfalah — 5510.
- Departments: Finance, Human Resources, Sales, Operations, Procurement, IT, Administration, Warehouse.
